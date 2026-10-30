# Camposanto

A quiet graveyard for your abandoned projects. Point it at a folder of old repos and each one becomes a tombstone. A local open-weight model writes an epitaph and a "cause of death" from the real `git log` and README, and a **resurrect** button tells you what the project was and how to bring it back.

Everything runs on your machine: no accounts, no API keys, no network once the model is pulled.

## Run

```
ollama pull qwen2.5:3b       # ~2GB, fits a 4GB GPU
node server.js               # Node 18+, no npm install needed
```

Open http://localhost:7331, set the folder to scan, pick a model from the dropdown.

`config.json` holds `port`, `scanRoot`, `ollamaUrl`, `defaultModel` and `staleDays` (a repo with no commits for that many days counts as dead; the rest keep a candle lit).

## Swapping models

The dropdown lists whatever Ollama has installed. Good small choices: `llama3.2:3b`, `qwen3:4b`, `gemma3:4b`, `phi4-mini`. Epitaphs are cached per repo + commit + model, so switching models regenerates them.

## Why open matters here

- **Your old code stays yours.** Half-finished side projects, private repos and embarrassing commit messages are read by a model on your own laptop, not uploaded anywhere.
- **Works with the lights off.** Disable wifi and it still runs.
- **Change the voice.** The prompts live in `lib/llm.js`; swap the model or rewrite the persona (gravedigger, poet, disappointed parent) without asking anyone's permission.
- **Costs nothing** to run on as many repos as you like.

## Layout

```
server.js      static server + API (/api/models, /api/repos, /api/epitaph, /api/resurrect)
lib/scan.js    finds repos, reads git history
lib/llm.js     Ollama client and prompts
lib/cache.js   .camposanto/cache.json
public/        the graveyard UI
```
