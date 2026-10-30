# AIRouter

A chat app that talks to each AI provider through its **own official API**, suggests which model fits your question (and says why), and lets you switch models in the middle of a conversation without losing context.

- **Direct integrations, no aggregator.** Gemini (`google-genai`), Groq (`groq`), OpenAI (`openai`), Anthropic (`anthropic`) and Ollama (`ollama`), each through its own official SDK with its own key in `.env`.
- **Router.** Classifies each message (private, coding, math, creative, quick fact, long reasoning, image, general) with simple rules, picks the first configured model from an editable preference list, and shows the reason and the signals it matched. You can accept or override.
- **Switch models any time.** The new model receives the whole conversation so far. Every reply shows which model wrote it.
- **Works for free.** Gemini's and Groq's free tiers and/or a local Ollama model are enough. Paid providers are optional.
- **Private stays local.** Messages that mention things like bank details, salary, passwords or medical reports are routed to the local Ollama model, so they never leave your computer.

![Routed coding answer](docs/routed.png)

## Screenshots

| Switching models mid-thread | Settings: providers and routing rules |
|---|---|
| ![Model switch](docs/model-switch.png) | ![Settings](docs/settings.png) |

<img src="docs/mobile.png" width="260" alt="Narrow screen">

All screenshots are of the real app. The switching example goes Gemini 3.5 Flash → local Llama 3.2 3B → Gemini 3.5 Flash-Lite in one thread; the other replies come from local Ollama models.

## How it works

```mermaid
flowchart LR
    UI["React chat UI<br/>(Vite, plain CSS)"] -- "POST /api/route" --> R["Router<br/>rules from routing.toml"]
    UI -- "POST /api/chat (SSE stream)" --> S["FastAPI server"]
    S --> DB[("SQLite<br/>chat history")]
    S -- "full thread as context" --> P{"Provider interface<br/>stream() / send_message()"}
    P --> G["Gemini<br/>google-genai"]
    P --> GQ["Groq<br/>groq SDK"]
    P --> O["Ollama<br/>local"]
    P --> OA["OpenAI<br/>openai SDK"]
    P --> A["Anthropic<br/>anthropic SDK"]
```

- **Provider interface** ([airouter/providers/base.py](airouter/providers/base.py)): every provider implements `stream(model, messages)` (yields tokens, then token usage if the provider reports it), `send_message()` and `list_models()`. If a key is missing the provider raises `NotConfigured`; it never fakes a reply.
- **Context on switch**: each request rebuilds the thread from SQLite as a plain `role/content` list, so whichever model answers next sees everything, including replies written by other models.
- **Router** ([airouter/router.py](airouter/router.py) + [routing.toml](routing.toml)): each category has keywords, regex patterns, weights and optional length bonuses. Highest score wins; nothing matched means "general". The router then walks the category's `prefer` list and picks the first model you have configured. If the top choice isn't set up, it says so ("Claude Sonnet 5.5 would be first choice but isn't configured"). The file is re-read on every request, so edits apply immediately.
- **Streaming**: the server sends Server-Sent Events (`meta`, `token`, `done`, `error`). Each saved reply stores total time, time to first token and the provider's token counts. If you press stop, the partial reply is kept and marked as stopped.

## Run it

Needs Python 3.11+ and Node 18+.

```bash
python -m venv .venv
.venv\Scripts\activate            # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt

cd web && npm install && npm run build && cd ..

cp .env.example .env              # then fill in the keys you have
python -m airouter serve          # opens http://127.0.0.1:8400
```

Free setup options (you need at least one):

- **Gemini**: get a free key at <https://aistudio.google.com/apikey> and set `GEMINI_API_KEY`.
- **Groq**: get a free key at <https://console.groq.com/keys> and set `GROQ_API_KEY`. Fast open models (GPT-OSS, Qwen).
- **Ollama**: install from <https://ollama.com>, then `ollama pull llama3.2:3b` (a small general model) and/or `ollama pull qwen2.5-coder:7b` (coding). Every pulled model shows up in the picker on its own.

`OPENAI_API_KEY` and `ANTHROPIC_API_KEY` are optional. **They cost money**: every message to them is billed to your account. The settings page's *Test connection* button only lists models, which is free on every provider.

For frontend development, run `npm run dev` in `web/` (proxies `/api` to port 8400) alongside `python -m airouter serve --no-browser`.

## Self-test

`python -m airouter selftest` needs no keys and no network. It runs the router on 14 sample queries, exercises the provider interface with a mock provider, checks that providers without keys refuse to answer, and runs a two-turn chat through the real HTTP endpoint (switching models between turns) before reloading it from SQLite. Output from this repo:

```
PASS  router classifies sample queries: 13/14 sample queries routed as expected; fallbacks explained
PASS  provider interface (mock): stream yields tokens then usage; send_message joins them
PASS  unconfigured provider is honest: gemini/groq/openai/anthropic without keys -> 'not configured', no reply produced
PASS  history save/resume + model switch: 2 turns saved, model b got model a's context, thread resumes from DB

4/4 steps passed
```

`pytest` runs the same checks plus one for context building (5 tests, all passing).

## What was tested live

- **Gemini (free tier)**: real streaming chats with `gemini-3.5-flash` and `gemini-3.5-flash-lite` (about 2.5-6 s per short reply), including a Gemini → Ollama → Gemini switch in one thread where each model answered from the earlier turns. On a free key, the older `gemini-2.5-*` models returned "no longer available" and `gemini-3.1-pro-preview` returned "quota exceeded", so Pro is labelled paid and left out of the router's picks.
- **Ollama**: real streaming chats with `llama3.2:3b`, `qwen2.5-coder:7b` and `qwen2.5-coder-16k`. On this machine (Ryzen 5 laptop, 16 GB RAM), warm replies took about 5-17 s and the first reply after loading a model took 20-35 s. Once, with under 2 GB of RAM free, loading the model took over half an hour, so local models need free memory.
- **Groq (free tier)**: real chats with `qwen/qwen3.8-27b`, `openai/gpt-oss-20b` and `openai/gpt-oss-120b`, about 1-2.5 s per short reply. The Llama models Groq used to host were no longer listed for this key.
- **Auto mode across providers**: in one live run the router sent a quick fact to Qwen on Groq (1.2 s), an equation to GPT-OSS 120B on Groq (1.5 s), a poem and a general question to Gemini 3.5 Flash (8-15 s) and a salary/budget question to local Llama. One Gemini request failed with a temporary `503 UNAVAILABLE` (model overloaded); the app shows the error and a *Try again* button rather than a made-up answer.
- **OpenAI, Anthropic**: the modules are written against each official SDK and tested for the "not configured" path, but have not been run with real keys, to avoid spending money. Model names in `routing.toml` (e.g. `gpt-5`, `claude-sonnet-5-5`) may need updating as providers release new ones; *Test connection* shows the models your key can see.

## Customising the router

Open [routing.toml](routing.toml). For example, to send coding questions to a local model first:

```toml
[categories.coding]
prefer = ["ollama:*coder*", "anthropic:claude-sonnet-5-5", "gemini:gemini-3.5-flash"]
```

To keep an installed Ollama model out of the picker (without uninstalling it), add it to `hide` under `[ollama]` in the same file.

The default preferences reflect common opinion about each model family, **not benchmarks I ran**. Change them to match your own experience.

## Limitations

- The router is keyword/regex rules, not a trained model. It handles clear-cut messages well and gets mixed ones wrong (a message mentioning both "error" and "screenshot" depends on weights).
- No image upload yet. The router can recognise an image question and suggest a vision-capable model, but you have to describe the image in text.
- No cost estimates in money: prices change often, so the app shows the provider's token counts and labels paid models instead.
- Single user, local only. There is no login; don't expose the server to a network.
- Long threads are sent in full every time. There is no trimming, so very long chats can hit a model's context limit.

## Project layout

```
airouter/
  providers/       base.py (interface), gemini.py, groq.py, ollama.py, openai.py, anthropic.py
  router.py        rule-based classifier + model pick
  server.py        FastAPI: models, providers, route, chat (SSE), history
  db.py            SQLite history
  selftest.py      offline checks (mock provider)
routing.toml       model catalog + routing rules (edit me)
web/src/           React UI: App, Chat, Settings, ui helpers, styles.css
tests/             pytest
```

## License

MIT
