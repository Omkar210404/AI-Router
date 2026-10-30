"""FastAPI backend: model catalog, provider status, history, streaming chat."""
import json
import time

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import config, db
from .providers import PROVIDERS, NotConfigured, catalog, split_model_id
from .providers.base import short_error
from .router import route

app = FastAPI(title="AIRouter")


class ChatIn(BaseModel):
    text: str
    model: str
    conversation_id: str | None = None
    route: dict | None = None   # the router's recommendation, saved for transparency
    retry: bool = False         # re-ask the last question after a failed reply


def sse(event: str, data) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def build_context(history: list[dict]) -> list[dict]:
    """Turn saved messages into the plain role/content list every provider takes.
    Messages from *any* earlier model are included, which is what makes switching
    models mid-thread seamless. Consecutive same-role turns (e.g. after a failed
    reply) are merged because some APIs require strict alternation."""
    out: list[dict] = []
    for m in history:
        if not m["content"].strip():
            continue
        if out and out[-1]["role"] == m["role"]:
            out[-1]["content"] += "\n\n" + m["content"]
        else:
            out.append({"role": m["role"], "content": m["content"]})
    return out


@app.get("/api/models")
def models():
    return catalog()


@app.get("/api/providers")
def providers():
    return [{"name": p.name, "label": p.label, "tier": p.tier, "note": p.note,
             "key_env": p.key_env, "configured": p.configured()} for p in PROVIDERS.values()]


@app.post("/api/providers/{name}/test")
def test_provider(name: str):
    if name not in PROVIDERS:
        raise HTTPException(404, "Unknown provider")
    return PROVIDERS[name].test()


class RouteIn(BaseModel):
    text: str


@app.post("/api/route")
def recommend(req: RouteIn):
    return route(req.text, catalog())


@app.get("/api/routing")
def routing_table():
    """The routing config as the router sees it, so the UI can show it."""
    cfg = config.load_routing()
    return {"file": str(config.ROUTING_FILE), "categories": cfg["categories"]}


@app.get("/api/conversations")
def conversations():
    with db.connect() as con:
        return db.list_conversations(con)


@app.get("/api/conversations/{cid}")
def conversation(cid: str):
    with db.connect() as con:
        conv = db.get_conversation(con, cid)
    if not conv:
        raise HTTPException(404, "Conversation not found")
    return conv


@app.delete("/api/conversations/{cid}")
def delete(cid: str):
    with db.connect() as con:
        db.delete_conversation(con, cid)
    return {"ok": True}


@app.post("/api/chat")
def chat(req: ChatIn):
    if not req.text.strip():
        raise HTTPException(400, "Empty message")
    try:
        provider, model = split_model_id(req.model)
        provider.require()
    except NotConfigured as e:
        raise HTTPException(400, str(e)) from e

    con = db.connect()
    cid = req.conversation_id
    if not cid or not db.get_conversation(con, cid):
        cid = db.create_conversation(con, req.text)
    history = db.messages(con, cid)
    if req.retry and history and history[-1]["role"] == "user" and history[-1]["content"] == req.text:
        user_msg = history[-1]          # already saved; don't store the question twice
    else:
        user_msg = db.add_message(con, cid, "user", req.text, route=req.route)
    context = build_context(db.messages(con, cid))

    st = {"parts": [], "usage": {}, "first": None, "t0": time.perf_counter(), "saved": False}

    def save(stopped: bool) -> dict:
        st["saved"] = True
        now = time.perf_counter()
        return db.add_message(
            con, cid, "assistant", "".join(st["parts"]), model=req.model, stopped=int(stopped),
            latency_ms=round((now - st["t0"]) * 1000),
            first_token_ms=round((st["first"] - st["t0"]) * 1000) if st["first"] else None,
            tokens_in=st["usage"].get("input"), tokens_out=st["usage"].get("output"))

    def events():
        yield sse("meta", {"conversation_id": cid, "user_message": user_msg})
        try:
            for ev in provider.stream(model, context):
                if ev["type"] == "token":
                    st["first"] = st["first"] or time.perf_counter()
                    st["parts"].append(ev["text"])
                    yield sse("token", {"text": ev["text"]})
                elif ev["type"] == "usage":
                    st["usage"] = ev
            yield sse("done", save(stopped=False))
        except Exception as e:  # noqa: BLE001 - show the provider's error, never a fake reply
            yield sse("error", {"message": short_error(e)})
        finally:
            if not st["saved"] and st["parts"]:   # client pressed stop: keep what arrived
                save(stopped=True)
            con.close()

    return StreamingResponse(events(), media_type="text/event-stream")


if config.WEB_DIST.exists():
    app.mount("/assets", StaticFiles(directory=config.WEB_DIST / "assets"), name="assets")

    @app.get("/{path:path}")
    def spa(path: str):
        return FileResponse(config.WEB_DIST / "index.html")
