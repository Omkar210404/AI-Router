"""Google Gemini via the official google-genai SDK."""
from .base import Provider


class GeminiProvider(Provider):
    name = "gemini"
    label = "Google Gemini"
    key_env = "GEMINI_API_KEY"
    tier = "free"
    note = "Has a free tier with rate limits. Usage beyond it is billed by Google."

    def _client(self):
        from google import genai
        return genai.Client(api_key=self.api_key())

    def stream(self, model, messages):
        self.require()
        from google.genai import types
        contents = [
            types.Content(role="user" if m["role"] == "user" else "model",
                          parts=[types.Part(text=m["content"])])
            for m in messages
        ]
        usage = None
        for chunk in self._client().models.generate_content_stream(model=model, contents=contents):
            if chunk.text:
                yield {"type": "token", "text": chunk.text}
            if chunk.usage_metadata:
                usage = chunk.usage_metadata
        if usage:
            yield {"type": "usage", "input": usage.prompt_token_count or 0,
                   "output": usage.candidates_token_count or 0}

    def list_models(self):
        return [m.name.removeprefix("models/") for m in self._client().models.list()]
