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
> (Node) or a Worker **secret** (Cloudflare), and is never sent to the browser, never
> written to `ai/config.js`, and never committed to the repository. The browser only
> ever talks to the proxy's `/api/ai` URL.

Two interchangeable variants ship here, same `POST /api/ai { task, payload }` contract:

- **`index.mjs`** — Node HTTP server (`@anthropic-ai/sdk`), streams tokens to the browser.
- **`worker.js`** — Cloudflare Workers variant (Anthropic REST). Runs on the **free tier**,
  so there is **no server to babysit** (무인/autonomous).

## Cost-efficient by default (저비용)

- **Model:** cost-first default `claude-haiku-4-5` (**$1 / $5 per MTok** in/out).
  Configurable via `AI_MODEL` — raise to `claude-sonnet-5` ($2/$10) or `claude-opus-5`
  ($5/$25) for harder tasks.
- **Prompt caching:** the stable system prompt is sent as a cacheable block
  (`cache_control: {type:'ephemeral'}`), so repeated calls pay much less for input.
- **Output cap:** modest `AI_MAX_TOKENS` (default `700`) bounds output-token cost.
- **Thinking/effort:** Haiku 4.5 sends **no** thinking/effort (it rejects them → 400s).
  Non-Haiku models send `thinking:{type:'adaptive'}` + `output_config:{effort: AI_EFFORT}`
  (default `low`).
- **Guardrails:** in-memory **per-IP rate limit** + a **monthly token budget**
  (`AI_MONTHLY_TOKEN_CAP`, default `2,000,000`). When either trips, the proxy returns
  **HTTP 429 `{fallback:true}`** and the browser auto-falls back to the built-in mock —
  the app never breaks.

### Rough cost estimate (per 1,000 requests)

Assume a cached ~300-token system prompt, ~150 fresh input tokens, and ~400 output
tokens per request on **Haiku 4.5** ($1/$5 per MTok):

- Input (cache miss, first call only): negligible after warm-up (cache reads ~0.1×).
- Warm input ≈ 1,000 × 450 tok = 0.45 MTok × ~$0.30 (mostly cache reads) ≈ **$0.14**
- Output ≈ 1,000 × 400 tok = 0.40 MTok × $5 ≈ **$2.00**
- **≈ $2 per 1,000 requests** on Haiku 4.5. Sonnet 5 ≈ 2×, Opus 5 ≈ 5× (output-dominated).

The `AI_MONTHLY_TOKEN_CAP` default (2M tokens) is roughly one month of ~2,500 such
requests before fallback kicks in — tune it to your budget.

## What it does

- Exposes `POST /api/ai` accepting `{ "task", "payload" }`.
- Tasks: `coach`, `retention`, `notice`, `briefing` (matching `ai/ai.js`).
- Builds a per-task cached system + user prompt and calls Claude with the model/effort
  rules above. `index.mjs` streams the reply; `worker.js` returns the text.
- Sets permissive CORS so the GitHub Pages origin can call it.
- Accumulates `usage` toward the monthly budget (`index.mjs`; visible at `GET /health`).

## Run the Node variant (`index.mjs`) on any Node host

```bash
cd server
cp .env.example .env          # then put your key in .env  (or export it)
export ANTHROPIC_API_KEY=your-key-here   # your key — server-side environment ONLY
npm install                   # installs @anthropic-ai/sdk
npm start                     # -> http://localhost:8787/api/ai
```

Optional env: `AI_MODEL`, `AI_MAX_TOKENS`, `AI_EFFORT`, `AI_MONTHLY_TOKEN_CAP`,
`AI_RATE_MAX`, `AI_RATE_WINDOW_MS`, `PORT`, `ALLOW_ORIGIN`.

Any Node host works (Render, Railway, Fly.io, a VM, a container, etc.). Provide the
`ANTHROPIC_API_KEY` through that host's secret/environment manager — **not** in code.

## Deploy the Cloudflare Workers variant (`worker.js`) — free, unmanned (무인)

```bash
cd server
npx wrangler secret put ANTHROPIC_API_KEY   # stored by Cloudflare, never in the repo
npx wrangler deploy                          # -> https://gymmanager-ai-proxy.<subdomain>.workers.dev
```

Config lives in `wrangler.toml` (`AI_MODEL`, `AI_MAX_TOKENS`, `AI_EFFORT`, `ALLOW_ORIGIN`
under `[vars]`; the key is a **secret**, set via `wrangler secret put`). The free tier
covers a small gym's traffic with no server to keep alive. If the key is missing or the
upstream call fails/429s, the Worker returns `{fallback:true}` and the browser uses the mock.

## Point the front-end at your proxy

Edit `ai/config.js`:

```js
export const AI_ENDPOINT = "https://your-proxy.example.com/api/ai";
// or the Workers URL: https://gymmanager-ai-proxy.<subdomain>.workers.dev/api/ai
```

Optionally set `ALLOW_ORIGIN` to your exact Pages origin to tighten CORS.

## Security notes

- **Never** hardcode the key in `index.html`, `ai/config.js`, or any front-end file.
- Keep `.env` out of git (covered by the repo `.gitignore`). Use a Worker secret on Cloudflare.
- The built-in per-IP rate limit + monthly cap are basic; add real auth/WAF for public deployments.
- These files are provided as a reference; review them before exposing them publicly.
