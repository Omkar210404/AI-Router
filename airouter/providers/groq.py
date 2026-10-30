"""Groq via the official groq SDK. Free tier with rate limits; runs open models fast."""
from .base import Provider


class GroqProvider(Provider):
    name = "groq"
    label = "Groq"
    key_env = "GROQ_API_KEY"
    tier = "free"
    note = "Has a free tier with rate limits. Runs open models (GPT-OSS, Qwen) very fast."

    def _client(self):
        from groq import Groq
        return Groq(api_key=self.api_key())

    def stream(self, model, messages):
        self.require()
        client = self._client()
        usage = None
        for chunk in client.chat.completions.create(model=model, messages=messages, stream=True):
            if chunk.choices and chunk.choices[0].delta.content:
                yield {"type": "token", "text": chunk.choices[0].delta.content}
            # Groq puts token usage on the last chunk, under x_groq.usage
            extra = getattr(chunk, "x_groq", None)
            usage = getattr(chunk, "usage", None) or (getattr(extra, "usage", None) if extra else None) or usage
        if usage:
            yield {"type": "usage", "input": usage.prompt_tokens, "output": usage.completion_tokens}

    def list_models(self):
        client = self._client()
        return [m.id for m in client.models.list().data]
