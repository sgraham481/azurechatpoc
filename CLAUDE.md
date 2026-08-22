# CLAUDE.md

Context for an agent picking this repo up cold. Read this before changing the Azure call path — several
non-obvious constraints below were found by probing the live resource, not by reading docs.

## What this is

A POC: a React chat UI styled as "Astrion Executive Command Center", streaming from Azure AI Foundry
through a Node/Express proxy so the API key never reaches the browser.

```
React (Vite) :5173  --/api/chat (SSE)-->  Node/Express :3001  --HTTPS-->  Azure AI Foundry
```

**Frontend: React 18 + Vite 5 in strict TypeScript. Backend: Express 4 in plain JavaScript.** The split is
intentional — only the frontend was converted (2026-08-22). Backend is ESM (`"type": "module"`) and calls
Azure with bare `fetch`; there is no `openai` or `@azure/*` SDK, so the request body is built by hand.

**Vite does not typecheck.** It strips types at transform time, so `npm run dev` happily hot-reloads code
that does not compile. `tsc` is the only gate: `npm run typecheck` (or `npm run build`, which runs it first).
Run it before committing frontend changes.

`frontend/tsconfig.json` is strict and additionally sets `noUnusedLocals`, `noUnusedParameters`,
`noFallthroughCasesInSwitch`, and `noUncheckedIndexedAccess`. The last one means array indexing yields
`T | undefined`, which is why `App.tsx` guards `frames.pop()` and `parsed.choices?.[0]`.

Shared types are in `frontend/src/types.ts`. `StreamChunk.choices` is optional on purpose: Azure's first SSE
frame contains only prompt content-filter results with an empty `choices` array.

## Running it

Node **22.22.2**, pinned in `.nvmrc` and set as the nvm `default`, so a new terminal already has it.
Node 18+ is the real floor (the backend needs global `fetch`). Verify with `node -v` before debugging
anything weird — this machine has Node 10 installed and it produces a bare `SyntaxError: Unexpected token {`.

```bash
cd backend  && npm install && npm run dev   # :3001
cd frontend && npm install && npm run dev   # :5173  <- open this one
```

Vite proxies `/api/*` to :3001, so there is no CORS in dev. `GET /api/health` returns `{ ok, configured }`.
The backend boots fine without credentials and reports which vars are missing.

`npm run preview` (production build on :4173) does **not** proxy `/api` — `vite.config.js` puts the proxy
under `server`, which Vite does not reuse for `preview`. Chat 404s there until a `preview.proxy` block exists.

## Azure: the constraints that actually matter

The resource is **Azure AI Foundry** (`*.services.ai.azure.com`), **not** classic Azure OpenAI
(`*.openai.azure.com`), and the deployed model is **gpt-5-mini**, a *reasoning* model. Both facts change
the request shape. All of the following were confirmed against the live endpoint:

| Constraint | Why |
| --- | --- |
| Use `max_completion_tokens`, never `max_tokens` | Azure 400: *"'max_tokens' is not supported with this model"* |
| Do **not** send `temperature` | Azure 400: *"does not support 0.7 … Only the default (1) value is supported"* |
| Budget needs real headroom (default 2000) | Reasoning tokens are billed against the same budget and are emitted *before* any visible text |
| v1 URL: `{base}/openai/v1/chat/completions`, deployment goes in the body as `model` | Foundry's v1 surface; the classic `/openai/deployments/{dep}/...?api-version=` path also works, but v1 is version-less |
| `AZURE_OPENAI_API_VERSION` is unused | The v1 surface takes no `api-version`. Kept in `.env.example` only for the classic path |
| Plain `api-key` header is enough | The Foundry portal sample shows `DefaultAzureCredential`, but key auth was verified working on both surfaces. No Entra dependency |

**The reasoning-budget trap.** gpt-5-mini can spend the *entire* completion budget on hidden reasoning and
return HTTP 200 with `finish_reason: "length"` and empty content. Measured: budgets of 50 and 200 produced
zero visible text; a routine question used 512 reasoning tokens. A blank assistant bubble is almost always
this, not a streaming bug — raise `AZURE_OPENAI_MAX_TOKENS`. Both paths guard against it: the non-streaming
path returns a `budget_exhausted` error, and `App.jsx` names the cause when a stream yields no deltas.

## Configuration

`backend/.env` (gitignored — never commit it, never print the key):

| Variable | Notes |
| --- | --- |
| `AZURE_OPENAI_ENDPOINT` | Base host. A trailing `/openai/v1` is tolerated and stripped |
| `AZURE_OPENAI_API_KEY` | Portal → Keys and Endpoint |
| `AZURE_OPENAI_DEPLOYMENT` | Deployment name (`gpt-5-mini`), not the model family |
| `AZURE_OPENAI_MAX_TOKENS` | Optional, defaults to 2000. Raise if answers truncate |
| `PORT` / `CORS_ORIGIN` | Default `3001` / `http://localhost:5173` |

## Layout

```
backend/src/server.js        Express app, CORS, /api/health, config validation
backend/src/routes/chat.js   POST /api/chat — system prompt, Azure v1 call, SSE passthrough, error mapping
frontend/src/types.ts        Message, WireMessage, StreamChunk, FinishReason, ApiError
frontend/src/App.tsx         Message state, send handler, hand-rolled SSE parsing
frontend/src/components/     Header/Sidebar/Footer (presentational), ChatWindow, MessageBubble,
                             ChatInput, SuggestionChips, Icons (inline SVG) — all .tsx
frontend/src/styles.css      Design tokens and layout
frontend/tsconfig.json       Strict; noEmit (Vite owns emit)
```

Streaming is parsed by hand in `App.jsx`: SSE frames split on a blank line, buffered across chunk
boundaries. Errors always render as an inline error bubble — never an alert, never a blank screen — and
the rest of the conversation survives.

## Commit process

**Every commit ships its documentation.** Code, docs, and release notes land together — never as a
follow-up, because a commit that changes behaviour without changing its docs is how the docs went stale
before. Work through this checklist before committing:

1. **`CHANGELOG.md`** — add an entry under `[Unreleased]`, Keep a Changelog format. Describe the
   user-visible effect, and for non-obvious fixes record the *evidence* (the verbatim API error, the
   measured numbers). That is what a future reader cannot reconstruct from the diff.
2. **`README.md`** — update if setup, commands, configuration, or the stack changed.
3. **`CLAUDE.md`** — update if anything here is now wrong: the stack, the Azure contract, run
   instructions, conventions, or the known-gaps list.
4. **`npm run check`** in `frontend/` — must pass. Vite does not typecheck, so this is the only gate.
5. **Never commit** `backend/.env`, keys, `node_modules`, or build output.

Steps 1 and 4 are enforced by `githooks/pre-commit`; steps 2 and 3 get a reminder, since no hook can
judge whether a doc is still accurate. The hook is versioned in the repo — after a fresh clone, enable it:

```bash
git config core.hooksPath githooks
```

It sources nvm and honours `.nvmrc`, because hooks run with a bare environment where `node` may resolve to
this machine's Node 10 and fail with a confusing `SyntaxError: Unexpected token ?`. Bypass a single commit
with `git commit --no-verify` when you genuinely need to.

Commits go to `main`; remote is `origin` (HTTPS, authenticated via macOS keychain).

## Frontend scripts

```bash
npm run check      # umbrella verification — types today, add lint/tests here
npm run typecheck  # tsc --noEmit specifically
npm run build      # runs check first, then vite build
npm run dev        # NO typechecking — Vite strips types without checking them
```

`check` is the entry point to call and to extend; keep `build` gated on it.

## Known gaps (deliberate)

- The ASTRION wordmark in `Icons.jsx` is a **placeholder** SVG.
- Search, notifications, the avatar, and footer links are presentational only.
- The footer "Data as of" timestamp is hardcoded in `App.jsx`.
- **No real business data is wired in.** The system prompt forbids inventing figures, so the model will
  decline specific numbers — including the "Why is Rule of 40 at 7.3%?" suggestion chip. Expected, not a bug.
- No auth, no persistence (refresh clears the chat), single user, local only.
- No tests and no lint config.
- **The backend is still plain JavaScript.** Converting it is a reasonable next step but has not been done.
