"""Rule-based query router. Every number it uses comes from routing.toml,
and it returns the matched signals so the UI can show *why*."""
import re
from fnmatch import fnmatch

from .config import load_routing


def classify(text: str, categories: dict) -> dict:
    words = len(text.split())
    lowered = text.lower()
    scores, signals = {}, {}
    for name, cat in categories.items():
        score, hits = 0, []
        for kw in cat.get("keywords", []):
            if re.search(rf"(?<!\w){re.escape(kw.lower())}(?!\w)", lowered):
                score += cat.get("keyword_weight", 1)
                hits.append(kw)
        for pat in cat.get("patterns", []):
            if re.search(pat, text, re.I | re.M):
                score += cat.get("pattern_weight", 2)
                hits.append(f"pattern {pat}")
        if "short_words" in cat and words <= cat["short_words"]:
            score += cat.get("short_bonus", 1)
            hits.append(f"short ({words} words)")
        if "long_words" in cat and words >= cat["long_words"]:
            score += cat.get("long_bonus", 1)
            hits.append(f"long ({words} words)")
        scores[name], signals[name] = score, hits

    # A length bonus alone is too weak a signal, so it only boosts real matches.
    for n, hits in signals.items():
        if not any(not h.startswith(("short", "long")) for h in hits):
            scores[n] = 0
    best = max(scores, key=scores.get)          # ties: first category in the file
    if scores[best] == 0:
        best = "general"
    return {"category": best, "scores": scores, "signals": signals.get(best, [])}


def pick_model(prefer: list[str], models: list[dict]) -> tuple[dict | None, list[str]]:
    """First configured model matching the preference list, plus the ids skipped."""
    skipped = []
    for pattern in prefer:
        matches = [m for m in models if fnmatch(m["id"], pattern)]
        ready = [m for m in matches if m["configured"]]
        if ready:
            return ready[0], skipped
        skipped += [m["id"] for m in matches] or ([pattern] if "*" not in pattern else [])
    return None, skipped


def route(text: str, models: list[dict], routing: dict | None = None) -> dict:
    routing = routing or load_routing()
    cats = routing["categories"]
    c = classify(text, cats)
    cat = cats[c["category"]]
    model, skipped = pick_model(cat.get("prefer", []), models)
    note = ""
    if model is None:
        fallback = [m for m in models if m["configured"]]
        model = fallback[0] if fallback else None
        if model:
            note = f"None of the preferred models for this are set up, so using {model['label']}."
    elif skipped:
        names = {m["id"]: m["label"] for m in models}
        first = names.get(skipped[0], skipped[0].split(":", 1)[-1])
        note = f"{first} would be first choice but isn't configured."
    return {
        "category": c["category"],
        "label": cat.get("label", c["category"]),
        "reason": cat.get("reason", ""),
        "note": note,
        "signals": c["signals"][:6],
        "scores": c["scores"],
        "model": model["id"] if model else None,
        "model_label": model["label"] if model else None,
    }
