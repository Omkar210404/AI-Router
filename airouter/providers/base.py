"""The common interface every provider module implements."""
import os
from typing import Iterator


class NotConfigured(Exception):
    """Raised when a provider has no key / is not reachable. Never fake a reply."""


class Provider:
    name = ""          # short id used in model ids, e.g. "gemini"
    label = ""         # shown in the UI
    key_env = None     # env var holding the API key (None for local providers)
    tier = "paid"      # "free", "local" or "paid"
    note = ""          # one honest line about cost shown in settings

    def api_key(self) -> str | None:
        return os.getenv(self.key_env) if self.key_env else None

    def configured(self) -> bool:
        return bool(self.api_key())

    def stream(self, model: str, messages: list[dict]) -> Iterator[dict]:
        """Yield {"type": "token", "text": ...} events, then optionally one
        {"type": "usage", "input": int, "output": int} event."""
        raise NotImplementedError

    def send_message(self, model: str, messages: list[dict]) -> dict:
        """Non-streaming helper built on stream()."""
        text, usage = [], {}
        for ev in self.stream(model, messages):
            if ev["type"] == "token":
                text.append(ev["text"])
            elif ev["type"] == "usage":
                usage = ev
        return {"text": "".join(text), "usage": usage}

    def list_models(self) -> list[str]:
        """Model names the provider reports. Listing is free on every provider,
        so the settings test button uses this instead of spending tokens."""
        raise NotImplementedError

    def test(self) -> dict:
        if not self.configured():
            return {"ok": False, "detail": self.missing_reason()}
        try:
            models = self.list_models()
            return {"ok": True, "detail": f"Connected. {len(models)} models visible."}
        except Exception as e:  # noqa: BLE001 - surface any SDK error to the UI
            return {"ok": False, "detail": short_error(e)}

    def missing_reason(self) -> str:
        return f"Not configured: set {self.key_env} in .env"

    def require(self):
        if not self.configured():
            raise NotConfigured(self.missing_reason())


def short_error(e: Exception) -> str:
    msg = str(e).strip().splitlines()[0] if str(e).strip() else ""
    return f"{type(e).__name__}: {msg[:240]}"
