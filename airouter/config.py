"""Paths, .env loading and the editable routing.toml catalog."""
import os
import tomllib
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

DATA_DIR = Path(os.getenv("AIROUTER_DATA", ROOT / "data"))
DB_PATH = DATA_DIR / "airouter.db"
ROUTING_FILE = Path(os.getenv("AIROUTER_ROUTING", ROOT / "routing.toml"))
WEB_DIST = ROOT / "web" / "dist"


def load_routing() -> dict:
    """Read routing.toml fresh every call so edits apply without a restart."""
    with open(ROUTING_FILE, "rb") as f:
        return tomllib.load(f)
