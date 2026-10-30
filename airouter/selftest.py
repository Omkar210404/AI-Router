"""Offline self-test. No API keys, no network: uses a mock provider and a temp DB."""
import json
import tempfile
from pathlib import Path

from . import config, db
from .providers import PROVIDERS
from .providers.base import Provider


class MockProvider(Provider):
    """Test double. Only registered inside tests, never in the running app."""
    name, label, tier = "mock", "Mock", "local"

    def __init__(self):
        self.calls = []

    def configured(self):
        return True

    def stream(self, model, messages):
        self.calls.append((model, messages))
        reply = f"[{model}] heard {len(messages)} messages; last: {messages[-1]['content']}"
        for word in reply.split(" "):
            yield {"type": "token", "text": word + " "}
        yield {"type": "usage", "input": 7, "output": len(reply.split())}

    def list_models(self):
        return ["a", "b"]


def _sse_events(body: str) -> list[tuple[str, dict]]:
    out = []
    for block in body.strip().split("\n\n"):
        lines = dict(line.split(": ", 1) for line in block.splitlines())
        out.append((lines["event"], json.loads(lines["data"])))
    return out


def check_provider_interface():
    mock = MockProvider()
    events = list(mock.stream("a", [{"role": "user", "content": "hi"}]))
    assert events[0]["type"] == "token" and events[-1]["type"] == "usage"
    res = mock.send_message("a", [{"role": "user", "content": "hi"}])
    assert res["text"].strip().endswith("last: hi") and res["usage"]["input"] == 7
    assert mock.test()["ok"]
    return "stream yields tokens then usage; send_message joins them"


def check_unconfigured_is_honest():
    import os
    key = os.environ.pop("GEMINI_API_KEY", None)
    try:
        status = PROVIDERS["gemini"].test()
        assert not status["ok"] and "GEMINI_API_KEY" in status["detail"]
        try:
            next(PROVIDERS["gemini"].stream("gemini-2.5-flash", [{"role": "user", "content": "x"}]))
            raise AssertionError("stream should refuse without a key")
        except Exception as e:  # noqa: BLE001
            assert type(e).__name__ == "NotConfigured"
    finally:
        if key:
            os.environ["GEMINI_API_KEY"] = key
    return "missing key -> 'not configured', no reply produced"


def check_history_and_switching(tmp: Path):
    """Chat through the real HTTP endpoint with the mock, switch models, resume."""
    from fastapi.testclient import TestClient

    from .server import app
    config.DB_PATH = tmp / "test.db"
    mock = MockProvider()
    PROVIDERS["mock"] = mock
    try:
        client = TestClient(app)
        r = client.post("/api/chat", json={"text": "my name is Ada", "model": "mock:a"})
        ev = _sse_events(r.text)
        assert [e for e, _ in ev][0] == "meta" and ev[-1][0] == "done", ev[-1]
        cid = ev[0][1]["conversation_id"]
        assert "".join(d["text"] for e, d in ev if e == "token").startswith("[a]")

        r = client.post("/api/chat", json={"text": "what is my name?", "model": "mock:b",
                                           "conversation_id": cid})
        ev = _sse_events(r.text)
        assert ev[-1][0] == "done"
        model, ctx = mock.calls[-1]
        assert model == "b" and len(ctx) == 3 and ctx[0]["content"] == "my name is Ada"

        conv = client.get(f"/api/conversations/{cid}").json()
        roles = [(m["role"], m["model"]) for m in conv["messages"]]
        assert roles == [("user", None), ("assistant", "mock:a"), ("user", None), ("assistant", "mock:b")]
        assert conv["messages"][1]["tokens_in"] == 7 and conv["messages"][1]["latency_ms"] is not None
        assert any(c["id"] == cid for c in client.get("/api/conversations").json())
    finally:
        PROVIDERS.pop("mock", None)
    return "2 turns saved, model b got model a's context, thread resumes from DB"


def run(extra_steps=()) -> int:
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as d:
        steps = [*extra_steps,
                 ("provider interface (mock)", check_provider_interface),
                 ("unconfigured provider is honest", check_unconfigured_is_honest),
                 ("history save/resume + model switch", lambda: check_history_and_switching(Path(d)))]
        failed = 0
        for name, fn in steps:
            try:
                detail = fn()
                print(f"PASS  {name}: {detail}")
            except Exception as e:  # noqa: BLE001
                failed += 1
                print(f"FAIL  {name}: {type(e).__name__}: {e}")
        print(f"\n{len(steps) - failed}/{len(steps)} steps passed")
        return 1 if failed else 0
