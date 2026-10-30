"""Local models via the official ollama Python library. Free and offline."""
import os

from .base import Provider


class OllamaProvider(Provider):
    name = "ollama"
    label = "Ollama (local)"
    tier = "local"
    note = "Runs on your machine. Free, works offline, speed depends on your hardware."

    def _client(self, timeout=None):
        from ollama import Client
        return Client(host=os.getenv("OLLAMA_HOST", "http://localhost:11434"), timeout=timeout)

    def configured(self):
        try:
            self._client(timeout=1.5).list()
            return True
        except Exception:  # noqa: BLE001 - not running / not installed
            return False

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
        return [m.model for m in self._client(timeout=3).list().models]
