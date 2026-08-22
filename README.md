# Azure AI Foundry Chat POC

A minimal proof of concept: an Astrion Executive Command Center-styled chat UI in React, streaming responses from Azure AI Foundry through a Node/Express proxy.

```
React (Vite) :5173  --/api/chat (SSE)-->  Node/Express :3001  --HTTPS-->  Azure AI Foundry
```

The browser never talks to Azure directly. The API key lives only in `backend/.env` and is never sent to the client.

## Prerequisites

- **Node.js 18+.** This repo pins **22.22.2** via `.nvmrc`, and that is also the nvm `default`, so a new terminal already lands on it — check with `node -v`. If yours reports something older (a different version manager, or the default has drifted), run `nvm use` to pick up `.nvmrc`.
- **An Azure AI Foundry resource** (`*.services.ai.azure.com`) with a deployed chat model. This POC is
  configured against **`gpt-5-mini`**. A classic Azure OpenAI resource (`*.openai.azure.com`) also works —
  the v1 URL shape is the same — but the gpt-5 parameter rules below are specific to the gpt-5 family.

## Setup

```bash
cd backend  && npm install
cd ../frontend && npm install
```

Then create the backend env file and fill in your Azure values:

```bash
cd backend
cp .env.example .env
```

| Variable | Required | Where to find it |
| --- | --- | --- |
| `AZURE_OPENAI_ENDPOINT` | yes | Azure AI Foundry → your resource → **Keys and Endpoint** (e.g. `https://your-resource.services.ai.azure.com`). The portal often shows it with `/openai/v1` already appended — paste either form, the backend normalises it |
| `AZURE_OPENAI_API_KEY` | yes | Same blade, KEY 1 or KEY 2. A plain key is sufficient; the `DefaultAzureCredential` flow in the portal's sample code is **not** needed |
| `AZURE_OPENAI_DEPLOYMENT` | yes | Foundry → **Deployments** — the *deployment* name you chose (e.g. `gpt-5-mini`), not the model family. Sent to Azure as the `model` field |
| `AZURE_OPENAI_MAX_TOKENS` | no | Completion budget, defaults to **2000**. Read the reasoning-model note below before lowering it |
| `AZURE_OPENAI_API_VERSION` | no | **Unused.** The v1 API surface takes no `api-version`. Retained in `.env.example` only for anyone switching to the older `/openai/deployments/...` path |
| `PORT` | no | Backend port, defaults to `3001` |
| `CORS_ORIGIN` | no | Allowed browser origin, defaults to `http://localhost:5173` |

## Running

Two terminals:

```bash
# terminal 1
cd backend && npm run dev

# terminal 2
cd frontend && npm run dev
```

Open the URL Vite prints (`http://localhost:5173`). Vite proxies `/api/*` to the backend, so there's no CORS friction in dev.

The backend starts fine without Azure credentials — it logs which variables are missing, and `/api/chat` returns a clear error until you set them. `GET /api/health` reports `{ ok, configured }`.

### Production build

`npm run dev` is the one to use while working on the UI — hot module reload, unminified, source maps. To check the optimized bundle instead:

```bash
cd frontend
npm run build     # emits dist/ (~152 kB raw, ~49 kB gzipped)
npm run preview   # serves dist/ on http://localhost:4173
```

**`preview` does not proxy `/api`.** The proxy in `vite.config.js` sits under `server`, which only applies to `npm run dev`; Vite does not reuse it for `preview`. So chat calls 404 on :4173 until you either add a matching `preview.proxy` block to `vite.config.js` or set `CORS_ORIGIN=http://localhost:4173` in `backend/.env` and point the frontend at the backend directly. The UI shell itself renders fine either way.

## How streaming works

1. The frontend POSTs the full message array to `/api/chat`.
2. The backend prepends the system prompt (`backend/src/routes/chat.js`), POSTs to Azure's v1 endpoint
   (`{endpoint}/openai/v1/chat/completions`, deployment in the body as `model`) with `stream: true`, and
   pipes Azure's `text/event-stream` straight through.
3. The frontend reads the response with `ReadableStream`, buffers partial SSE frames, and appends each token delta to the in-progress assistant message.

**Non-streaming fallback:** `POST /api/chat?stream=false` returns a single JSON completion instead. Useful if streaming misbehaves during a live demo.

## Working with a reasoning model (gpt-5-mini)

gpt-5 models are **reasoning** models, and three of their rules broke the original request shape. Each was
confirmed against the live deployment, so treat them as hard constraints rather than style preferences:

| Rule | What Azure returns if you break it |
| --- | --- |
| Use `max_completion_tokens` | `400 — "'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead."` |
| Send **no** `temperature` | `400 — "'temperature' does not support 0.7 with this model. Only the default (1) value is supported."` |
| Leave real headroom in the budget | No error — a **200 with empty content**, see below |

**The budget trap is the one that will waste your afternoon.** Reasoning tokens are billed against the same
completion budget as visible text, and they are produced *first*. If the budget runs out during reasoning,
Azure returns HTTP 200 with `finish_reason: "length"` and an empty string — a success response containing
nothing. Measured on this deployment:

| `max_completion_tokens` | Result |
| --- | --- |
| 50 | `finish_reason: length`, 50 reasoning tokens, **empty content** |
| 200 | `finish_reason: length`, 200 reasoning tokens, **empty content** |
| 800 | `finish_reason: stop`, 192 reasoning + 40 visible — fine, but little margin |
| 2000 (current default) | Comfortable; a routine question used 512 reasoning tokens |

So **a blank assistant reply almost always means the budget, not a streaming bug.** Raise
`AZURE_OPENAI_MAX_TOKENS`. Both code paths now say so explicitly instead of failing silently.

Because reasoning happens before the first visible token, expect a **longer pause before the stream starts**
than with a non-reasoning model. That delay is the model thinking, not a stalled connection.

## Error handling

| Condition | Result in the UI |
| --- | --- |
| Missing env vars | 500 naming exactly which variables to set |
| Reasoning used the whole budget | Inline message naming `AZURE_OPENAI_MAX_TOKENS` (`budget_exhausted`) rather than a blank bubble |
| Azure 401/403 | "Auth failed — check API key/endpoint" |
| Azure 404 | Points at the deployment name / endpoint |
| Azure 429 | 429 with Azure's `Retry-After` passed through |
| Content filter | Friendly inline message, conversation preserved |
| Stream drops mid-response | Error frame in the stream, rendered as an inline error bubble |

Errors render as an inline error bubble — never an alert, never a blank screen — and the rest of the conversation stays intact.

## Project layout

```
backend/
  src/server.js          Express app, CORS, health check, config validation
  src/routes/chat.js     POST /api/chat — system prompt, Azure v1 call, SSE passthrough, error mapping
  .env.example
frontend/
  tsconfig.json          Strict TS config; type checking only, Vite owns emit
  src/types.ts           Message, WireMessage, StreamChunk, FinishReason, ApiError
  src/App.tsx            Message state, send handler, SSE parsing
  src/components/
    Header.tsx           Top bar (presentational)
    Sidebar.tsx          Left nav (presentational)
    Footer.tsx           Footer bar (presentational)
    ChatWindow.tsx       Scrollable message list, auto-scroll, typing indicator
    MessageBubble.tsx    User / assistant / error bubble styling
    ChatInput.tsx        Auto-growing textarea, Enter to send, Shift+Enter for newline
    SuggestionChips.tsx  Starter prompts — clicking one sends it
    Icons.tsx            Inline SVGs, no icon dependency
  src/styles.css         Design tokens and layout
```

## Stack

**Frontend: React 18 + Vite 5 in TypeScript** (strict). **Backend: Node/Express 4 in plain JavaScript.**
The two halves differ deliberately — only the frontend has been converted so far.

Type checking is a separate step from bundling: Vite strips types without checking them, so `tsc` is the
only thing that will actually fail on a type error.

```bash
cd frontend
npm run check        # umbrella verification; today this is tsc --noEmit
npm run build        # runs check first, then vite build
```

`npm run dev` does **not** typecheck — Vite's transform ignores types entirely, so a broken type still
hot-reloads happily. `npm run check` is the gate, and `githooks/pre-commit` runs it for you.

`tsconfig.json` enables `strict` plus `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`,
and `noUncheckedIndexedAccess`. That last one is why `buffer.split()` results are accessed defensively in
`App.tsx` — indexing an array yields `T | undefined`.

Shared types live in `frontend/src/types.ts`: `Message` (UI state), `WireMessage` (the trimmed shape sent to
the backend), `StreamChunk` (one Azure SSE frame), and `FinishReason`. Note `StreamChunk.choices` is
optional because Azure's first frame carries only prompt filter results with an empty `choices` array.

The backend is ESM (`"type": "module"`) and calls Azure with the built-in `fetch` — there is no `openai`
or `@azure/*` SDK, which is why the request body is assembled by hand in `chat.js`. There are no tests and
no lint config yet.

## Contributing

**Every commit ships its documentation.** Code, release notes, and docs land in the same commit — never as
a follow-up. Before committing:

| # | Step | Enforced? |
| --- | --- | --- |
| 1 | Add a `CHANGELOG.md` entry under `[Unreleased]`. For non-obvious fixes record the *evidence* — the verbatim API error, the measured numbers — since that is what a diff cannot convey | **blocks the commit** |
| 2 | Update `README.md` if setup, commands, configuration, or the stack changed | reminder |
| 3 | Update `CLAUDE.md` if the stack, Azure contract, run instructions, or conventions changed | reminder |
| 4 | `cd frontend && npm run check` | **blocks the commit** |
| 5 | Never commit `backend/.env`, keys, `node_modules`, or build output | `.gitignore` |

Steps 1 and 4 are enforced by `githooks/pre-commit`. Steps 2 and 3 only warn — no hook can judge whether
prose is still true, so that judgement stays with you.

**After a fresh clone, enable the hook** (Git does not do this automatically):

```bash
git config core.hooksPath githooks
```

The hook sources nvm and honours `.nvmrc`, because hooks run with a bare environment in which `node` may
resolve to an old version. Bypass a single commit with `git commit --no-verify`.

### Frontend scripts

```bash
npm run check      # umbrella verification — types today; add lint and tests here
npm run typecheck  # tsc --noEmit specifically
npm run build      # runs check first, then vite build
npm run dev        # NO typechecking
```

`check` is the entry point to call and to extend. `build` is gated on it, so a type error fails the build.

## Notes and known gaps

- The **ASTRION wordmark is a placeholder** SVG in `Icons.jsx`. Swap in the real asset when you have it.
- Search, notifications, the account avatar, and the footer links are **presentational only** — deliberately out of scope.
- The footer's "Data as of" timestamp is **hardcoded** in `App.jsx`; there's no live data source behind it.
- The system prompt tells the model not to invent figures it wasn't given. Since no real metrics are wired in, it will decline specific numbers — worth knowing before you demo the "Why is Rule of 40 at 7.3%?" chip.
- No auth, no persistence (refresh clears the chat), single user, local only.
- No tests, no linter, no CI.
