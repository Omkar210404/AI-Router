"""SQLite chat history: conversations and the messages in them."""
import json
import sqlite3
import time
import uuid
from pathlib import Path

from . import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at REAL, updated_at REAL);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL, content TEXT NOT NULL, model TEXT,
  latency_ms INTEGER, first_token_ms INTEGER, tokens_in INTEGER, tokens_out INTEGER,
  route TEXT, stopped INTEGER DEFAULT 0, created_at REAL);
"""


def connect(path: Path | None = None) -> sqlite3.Connection:
    path = Path(path or config.DB_PATH)
    path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(path, check_same_thread=False)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    con.executescript(SCHEMA)
    return con


def create_conversation(con, title: str) -> str:
    cid = uuid.uuid4().hex[:12]
    now = time.time()
    title = " ".join(title.split())[:60] or "New chat"
    con.execute("INSERT INTO conversations VALUES (?,?,?,?)", (cid, title, now, now))
    con.commit()
    return cid


def list_conversations(con) -> list[dict]:
    rows = con.execute("SELECT * FROM conversations ORDER BY updated_at DESC").fetchall()
    return [dict(r) for r in rows]


def get_conversation(con, cid: str) -> dict | None:
    row = con.execute("SELECT * FROM conversations WHERE id=?", (cid,)).fetchone()
    return {**dict(row), "messages": messages(con, cid)} if row else None


def delete_conversation(con, cid: str):
    con.execute("DELETE FROM conversations WHERE id=?", (cid,))
    con.commit()


def add_message(con, cid: str, role: str, content: str, **meta) -> dict:
    route = meta.pop("route", None)
    cols = ["conversation_id", "role", "content", "route", "created_at", *meta]
    vals = [cid, role, content, json.dumps(route) if route else None, time.time(), *meta.values()]
    cur = con.execute(f"INSERT INTO messages ({','.join(cols)}) VALUES ({','.join('?' * len(cols))})", vals)
    con.execute("UPDATE conversations SET updated_at=? WHERE id=?", (time.time(), cid))
    con.commit()
    return _row(con.execute("SELECT * FROM messages WHERE id=?", (cur.lastrowid,)).fetchone())


def messages(con, cid: str) -> list[dict]:
    rows = con.execute("SELECT * FROM messages WHERE conversation_id=? ORDER BY id", (cid,)).fetchall()
    return [_row(r) for r in rows]


def _row(r) -> dict:
    d = dict(r)
    d["route"] = json.loads(d["route"]) if d.get("route") else None
    return d
