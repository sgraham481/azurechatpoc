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
path returns a `budget_exhausted` error, and `App.tsx` names the cause when a stream yields no deltas.

## Deployment

Deploys to **Azure Static Web Apps** — static React bundle plus a managed Function at `/api/*` on the same
origin. **GitHub Pages cannot host this app**: it serves static files only and cannot run the API. Pages is
enabled on the repo and renders `README.md` via Jekyll; that is unrelated to the deployment.

- `api/src/chat-core.mjs` is the **single source of truth for the Azure contract**, shared by the deployed
  Function (`api/src/functions/chat.mjs`) and the local Express route (`backend/src/routes/chat.js`).
  Change the Azure call here, never in one of the adapters.
- **The deployed Function does not stream.** HTTP streaming through Static Web Apps' managed functions is
  unreliable, so it returns one JSON completion. `App.tsx` picks its path from the response `Content-Type`,
  so the same build works locally (SSE) and deployed (JSON) with no configuration. Do not "fix" the
  deployed app by forcing the streaming path.
- **`staticwebapp.config.json` must live in `frontend/public/`**, so Vite copies it into `dist/`. Static
  Web Apps reads it only from the deployed artifact; a copy at the repo root is **silently ignored** and
  the site deploys with no access control at all. This already happened once. The deploy workflow now
  fails if the file is missing from `dist/`.
- `frontend/public/staticwebapp.config.json` gates `/*` and `POST /api/chat` behind the custom role **`chatuser`**, granted
  only by invitation via the portal's Role management. This is deliberate: the built-in `authenticated`
  role would admit any Microsoft or GitHub account, i.e. anyone, spending real tokens. `/api/health` is
  intentionally anonymous so deploys can be smoke-tested.
- Runtime config lives in the Static Web App's *Application settings*, using the same variable names as
  `backend/.env`.
- `.github/workflows/azure-static-web-apps.yml` runs `npm run check` before deploying, so a type error
  fails the deploy rather than shipping.

## Current status (2026-08-23)

**Deployed and live:** https://ambitious-flower-0cd51b70f.7.azurestaticapps.net/

Verified against the running site:

| Check | Result |
| --- | --- |
| Anonymous `GET /` | 302 → `/login.html` — app shell not served |
| `GET /api/health` | 200 `{"ok":true,"configured":true}` |
| Anonymous `POST /api/chat` | 302, zero bytes — no completion returned |
| API key in delivered assets | 0 matches |
| `globalHeaders` | all three applied |

Azure resource name is `ambitious-flower-0cd51b70f`; note the hostname carries a **`.7.`** region segment
(`...-0cd51b70f.7.azurestaticapps.net`), which is not guessable from the resource name — get it from the
portal Overview if it is ever lost.

Application settings are set in the portal: `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`,
`AZURE_OPENAI_DEPLOYMENT`, `AZURE_OPENAI_MAX_TOKENS`. The deployment token is in the repo as
`AZURE_STATIC_WEB_APPS_API_TOKEN_AMBITIOUS_FLOWER_0CD51B70F`, created by Azure — the workflow references
that name, so it never needs handling by hand.

**The deployment is complete and working.** Two accounts hold the `chatuser` role and have signed in and
used the chat end to end (confirmed by the repo owner, 2026-08-23). The anonymous boundary in the table
above was verified separately by probing the live site.

To add another user: portal → Role management → Invite → choose provider, enter their username or email,
set the role to exactly `chatuser`, and send them the generated link. Signing in alone grants nothing; an
uninvited account lands on `denied.html`.

Reminder when demoing: the deployed Function returns one JSON completion rather than streaming, so the
answer appears all at once after the typing indicator. That is by design — see the Deployment section.

**Not done / possible next steps:** the backend is still plain JavaScript (only the frontend was converted
to TypeScript); there are no tests, no linter; the ASTRION wordmark is still a placeholder; no real business
data is wired in.

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
backend/src/server.js        Express app, CORS, /api/health, config validation (local dev only)
backend/src/routes/chat.js   Local Express adapter over chat-core — adds the SSE streaming path
api/src/chat-core.mjs        THE Azure contract — shared by the Function and the Express route
api/src/functions/chat.mjs   Deployed POST /api/chat (JSON, no streaming)
api/src/functions/health.mjs Deployed GET /api/health
frontend/public/
  staticwebapp.config.json   Routes, roles, auth redirects. MUST live here, not at the repo
                             root — see the Deployment section
frontend/public/login.html   Sign-in chooser (Microsoft / GitHub)
frontend/public/denied.html  Signed in but not invited
frontend/src/types.ts        Message, WireMessage, StreamChunk, ChatCompletion, FinishReason, ApiError
frontend/src/App.tsx         Message state, send handler, hand-rolled SSE parsing
frontend/src/components/     Header/Sidebar/Footer (presentational), ChatWindow, MessageBubble,
                             ChatInput, SuggestionChips, Icons (inline SVG) — all .tsx
frontend/src/styles.css      Design tokens and layout
frontend/tsconfig.json       Strict; noEmit (Vite owns emit)
```

Streaming is parsed by hand in `App.tsx`: SSE frames split on a blank line, buffered across chunk
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

Steps 1 and 4 are enforced by `githooks/pre-commit`. Steps 2 and 3 only get a reminder, and only for
changes that plausibly invalidate a doc: `package.json`, `.env.example`, `tsconfig.json`, `vite.config.ts`,
`.nvmrc`, anything under `backend/src/`, and any source file added or deleted. Ordinary edits inside
existing components are silent by design — a reminder that fires on every commit stops being read, and
would then be ignored on the commit where it mattered. The hook is versioned in the repo — after a fresh
clone, enable it:

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
- The footer "Data as of" timestamp is hardcoded in `App.tsx`.
- **No real business data is wired in.** The system prompt forbids inventing figures, so the model will
  decline specific numbers — including the "Why is Rule of 40 at 7.3%?" suggestion chip. Expected, not a bug.
- No auth, no persistence (refresh clears the chat), single user, local only.
- No tests and no lint config.
- **The backend is still plain JavaScript.** Converting it is a reasonable next step but has not been done.
