"""Local models via the official ollama Python library. Free and offline."""
import os
import time

from .base import Provider


class OllamaProvider(Provider):
    name = "ollama"
    label = "Ollama (local)"
    tier = "local"
    note = "Runs on your machine. Free, works offline, speed depends on your hardware."

    _cache: tuple[float, list[str] | None] = (0.0, None)

    def _client(self, timeout=None):
        from ollama import Client
        # 127.0.0.1, not localhost: on Windows "localhost" tries IPv6 first and adds ~2 s per call.
        return Client(host=os.getenv("OLLAMA_HOST", "http://127.0.0.1:11434"), timeout=timeout)

    def _models(self) -> list[str] | None:
        """Installed models, or None if Ollama isn't reachable. Cached for 15 s so
        page loads don't wait on Ollama every time."""
        at, models = self._cache
        if time.time() - at > 15:
            try:
                models = [m.model for m in self._client(timeout=4).list().models]
            except Exception:  # noqa: BLE001 - not running / not installed
                models = None
            self._cache = (time.time(), models)
        return models

    def configured(self):
        return self._models() is not None

    def missing_reason(self):
        return "Not running: install Ollama and run `ollama serve` (and `ollama pull <model>`)"

    def stream(self, model, messages):
        self.require()
        for part in self._client().chat(model=model, messages=messages, stream=True):
            if part.message and part.message.content:
                yield {"type": "token", "text": part.message.content}
            if part.done:
                yield {"type": "usage", "input": part.prompt_eval_count or 0,
                       "output": part.eval_count or 0}

    def list_models(self):
        models = self._models()
        if models is None:
            raise ConnectionError("Ollama is not reachable")
        return models
