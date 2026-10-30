"""OpenAI via the official openai SDK. Paid: every message is billed to your key."""
from .base import Provider


class OpenAIProvider(Provider):
    name = "openai"
    label = "OpenAI"
    key_env = "OPENAI_API_KEY"
    tier = "paid"
    note = "Paid. Every message is billed to your OpenAI account."

    def _client(self):
        from openai import OpenAI
        return OpenAI(api_key=self.api_key())

    def stream(self, model, messages):
        self.require()
        stream = self._client().chat.completions.create(
            model=model, messages=messages, stream=True, stream_options={"include_usage": True})
        for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield {"type": "token", "text": chunk.choices[0].delta.content}
            if chunk.usage:
                yield {"type": "usage", "input": chunk.usage.prompt_tokens,
                       "output": chunk.usage.completion_tokens}

    def list_models(self):
        return [m.id for m in self._client().models.list()]
