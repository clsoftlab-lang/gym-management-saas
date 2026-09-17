<!--
SPDX-License-Identifier: Apache-2.0
Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
-->

# 짐매니저 AI 프록시 (reference backend)

This is a **reference** backend proxy that connects the 짐매니저 front-end to the
real Claude API. **The demo does not need it** — the browser ships with a built-in
mock. Deploy this only when you (the operator) want real AI, using **your own**
`ANTHROPIC_API_KEY`.

> **🔒 The API key stays server-side only.** It is read from `process.env.ANTHROPIC_API_KEY`
> and is never sent to the browser, never written to `ai/config.js`, and never committed
> to the repository. The browser only ever talks to this proxy's `/api/ai` URL.

## What it does

- Exposes `POST /api/ai` accepting `{ "task", "payload" }`.
- Builds a per-task system + user prompt and calls
  `client.messages.stream({ model: "claude-opus-5", max_tokens: 2048, thinking: { type: "adaptive" }, ... })`.
- Streams the response text back to the browser (which renders it token-by-token).
- Sets permissive CORS so the GitHub Pages origin can call it.
- Tasks: `coach`, `retention`, `notice` (matching `ai/ai.js`).

Model: **`claude-opus-5`** (adaptive thinking, streaming).

## Run on any Node host

```bash
cd server
cp .env.example .env          # then put your key in .env  (or export it)
export ANTHROPIC_API_KEY=your-key-here   # your key — server-side environment ONLY
npm install                   # installs @anthropic-ai/sdk
npm start                     # -> http://localhost:8787/api/ai
```

Then point the front-end at it by editing `ai/config.js`:

```js
export const AI_ENDPOINT = "https://your-proxy.example.com/api/ai";
```

Any Node host works (Render, Railway, Fly.io, a VM, a container, etc.). Provide the
`ANTHROPIC_API_KEY` through that host's secret/environment manager — **not** in code.
Optionally set `ALLOW_ORIGIN` to your exact Pages origin to tighten CORS.

## Security notes

- **Never** hardcode the key in `index.html`, `ai/config.js`, or any front-end file.
- Keep `.env` out of git (already covered by the repo `.gitignore` patterns).
- Consider adding rate limiting / auth in front of `/api/ai` for public deployments.
- This file is provided as a reference; review it before exposing it publicly.
