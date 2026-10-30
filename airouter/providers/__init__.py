"""Provider registry and the model catalog the UI picks from."""
from ..config import load_routing
from .anthropic import AnthropicProvider
from .base import NotConfigured, Provider
from .gemini import GeminiProvider
from .ollama import OllamaProvider
from .openai import OpenAIProvider

PROVIDERS: dict[str, Provider] = {
    p.name: p for p in (GeminiProvider(), OllamaProvider(), OpenAIProvider(), AnthropicProvider())}


def split_model_id(model_id: str) -> tuple[Provider, str]:
    """'ollama:qwen2.5-coder:7b' -> (OllamaProvider, 'qwen2.5-coder:7b')."""
    prov, _, model = model_id.partition(":")
    if prov not in PROVIDERS or not model:
        raise NotConfigured(f"Unknown model '{model_id}'")
    return PROVIDERS[prov], model


def catalog() -> list[dict]:
    """Every model the app knows about, with a configured flag.
    Cloud models come from routing.toml; Ollama models are whatever is installed."""
    status = {name: p.configured() for name, p in PROVIDERS.items()}
    routing = load_routing()
    hidden = set(routing.get("ollama", {}).get("hide", []))
    out = []
    for m in routing.get("models", []):
        prov = m["id"].partition(":")[0]
        if prov in PROVIDERS:
            p = PROVIDERS[prov]
            out.append({**m, "provider": prov, "provider_label": p.label,
                        "tier": m.get("tier", p.tier), "configured": status[prov]})
    if status.get("ollama"):
        for name in PROVIDERS["ollama"].list_models():
            if name in hidden:
                continue
            out.append({"id": f"ollama:{name}", "label": name, "provider": "ollama",
                        "provider_label": PROVIDERS["ollama"].label, "tier": "local",
                        "speed": "local", "configured": True})
    return out


__all__ = ["PROVIDERS", "NotConfigured", "Provider", "split_model_id", "catalog"]
