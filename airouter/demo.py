"""Export real conversations + the routing rules for the static GitHub Pages demo.
No keys are exported: only model names, configured flags, chats and routing.toml."""
import json
from pathlib import Path

from . import config, db
from .providers import PROVIDERS, catalog

OUT = config.ROOT / "web" / "src" / "demo-data.json"


def export(ids: list[str], out: Path = OUT) -> Path:
    with db.connect() as con:
        convs = [db.get_conversation(con, i) for i in ids] if ids else [
            db.get_conversation(con, c["id"]) for c in db.list_conversations(con)]
    convs = [c for c in convs if c]
    data = {
        "models": catalog(),
        "providers": [{"name": p.name, "label": p.label, "tier": p.tier, "note": p.note,
                       "key_env": p.key_env, "configured": p.configured()} for p in PROVIDERS.values()],
        "routing": {"file": "routing.toml", "categories": config.load_routing()["categories"]},
        "conversations": convs,
    }
    out.write_text(json.dumps(data, indent=1, ensure_ascii=False), encoding="utf-8")
    return out
