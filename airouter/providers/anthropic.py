"""Anthropic (Claude) via the official anthropic SDK. Paid: every message is billed."""
from .base import Provider


class AnthropicProvider(Provider):
    name = "anthropic"
    label = "Anthropic"
    key_env = "ANTHROPIC_API_KEY"
    tier = "paid"
    note = "Paid. Every message is billed to your Anthropic account."

    def _client(self):
        from anthropic import Anthropic
        return Anthropic(api_key=self.api_key())

    def stream(self, model, messages):
        self.require()
        # Claude needs the first turn to be from the user.
        while messages and messages[0]["role"] != "user":
            messages = messages[1:]
        client = self._client()
        with client.messages.stream(model=model, max_tokens=4096, messages=messages) as s:
            for text in s.text_stream:
                yield {"type": "token", "text": text}
            usage = s.get_final_message().usage
        yield {"type": "usage", "input": usage.input_tokens, "output": usage.output_tokens}

    def list_models(self):
        client = self._client()
        return [m.id for m in client.models.list()]
