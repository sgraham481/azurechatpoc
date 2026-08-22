# Changelog

Release notes for every commit. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Add entries under `[Unreleased]` in the same commit as the code change.

## [Unreleased]

### Fixed

- **`staticwebapp.config.json` moved into `frontend/public/` so it ships inside `dist/`.** At the repo root
  it was outside `app_location`, so Static Web Apps never read it — meaning the role gating did not apply
  and the first deploy would have been publicly accessible. Caught by probing the deployed site, not by
  review. The deploy workflow now fails if the file is missing from the built output.
- **The deploy builds in a step we control rather than delegating to Oryx.** The first deploy reported
  success while every path returned 404, and the action's own logs gave no usable signal. The workflow now
  runs `npm ci`, `npm run check`, and `npm run build` explicitly, asserts that `index.html`,
  `login.html`, and `staticwebapp.config.json` exist in `dist/`, then uploads with `skip_app_build: true`.
  A missing artifact now fails the job instead of publishing an empty site.

### Changed

- **Consolidated to one deploy workflow.** Azure added its own on resource creation, which raced with
  ours and skipped the typecheck gate. Removed it and pointed our workflow at the secret Azure had already
  created (`AZURE_STATIC_WEB_APPS_API_TOKEN_AMBITIOUS_FLOWER_0CD51B70F`), so the token never needs handling
  by hand.

### Added

- **Deployment to Azure Static Web Apps**, so the app can be shared in a browser with the Azure key still
  server-side. GitHub Pages was evaluated and cannot host this: it serves static files only and cannot run
  the API, so `/api/chat` would 404 on every message. Pages remains enabled on the repo and renders
  `README.md` via Jekyll, which is unrelated.
  - `api/` — an Azure Functions app (`@azure/functions` v4) exposing `POST /api/chat` and `GET /api/health`.
  - `staticwebapp.config.json` — routes, auth redirects, and role gating.
  - `.github/workflows/azure-static-web-apps.yml` — runs `npm run check` **before** deploying, so a type
    error fails the deploy instead of shipping. Node version comes from `.nvmrc` so CI cannot drift.
  - `frontend/public/login.html` and `denied.html` — a provider chooser and a clear "signed in but not
    invited" page, rather than a bare 401/403.
- **Access is gated behind a custom `chatuser` role**, granted only by invitation through the portal's Role
  management. Deliberately *not* the built-in `authenticated` role, which admits any Microsoft or GitHub
  account — i.e. anyone on the internet, spending real Azure tokens. `/api/health` stays anonymous so
  deploys can be smoke-tested without a login.

### Changed

- **The Azure contract moved to `api/src/chat-core.mjs`, shared by both entry points.** The deployed
  Function and the local Express route are now thin adapters over it. The gpt-5 parameter rules were
  discovered by probing the live deployment and are easy to get wrong; two copies would have drifted.
  `backend/` is now a local-development adapter only.
- **The frontend picks streaming vs. JSON from the response `Content-Type`.** HTTP streaming through
  Static Web Apps' managed functions is not dependable, so the deployed Function returns a single JSON
  completion while local Express still streams SSE. One build works in both places with no configuration.
  Visible effect when deployed: the typing indicator, then the whole answer at once, rather than word by
  word.
- **The pre-commit doc reminder now also triggers** on `staticwebapp.config.json`, `.github/workflows/*`,
  and `api/src/*`, matching the new deployment surface the docs describe.

### Added

- **`githooks/pre-commit` — the commit checklist is now enforced, not just documented.** It blocks a commit
  when source files changed without a `CHANGELOG.md` entry, and when `frontend/` fails `npm run check`.
  It also warns (without blocking) when source changed but `README.md`/`CLAUDE.md` did not, since no hook
  can judge whether prose is still accurate.
  - The hook sources nvm and honours `.nvmrc`. Git hooks run with a bare environment where `node` can
    resolve to this machine's Node 10, which cannot parse modern `tsc` and fails with a misleading
    `SyntaxError: Unexpected token ?`. Found while testing the hook, not in production.
  - Versioned in the repo rather than left in `.git/hooks`, so it survives a clone. Enable with
    `git config core.hooksPath githooks`. Bypass one commit with `git commit --no-verify`.
  - **The doc reminder is targeted rather than firing on every source commit.** It triggers only for
    changes that plausibly invalidate a doc: `package.json`, `.env.example`, `tsconfig.json`,
    `vite.config.ts`, `.nvmrc`, anything under `backend/src/`, and any source file added or deleted.
    Edits inside existing components are silent. A reminder that fires on routine work stops being read
    and would then be ignored on the commit where it mattered; the accepted cost is that a behaviour
    change confined to one component will not prompt you. Verified against five cases — silent for a CSS
    tweak and a component edit, firing for a new env var, a `backend/src/` change, and an added file.
- **`npm run check`** in `frontend/` — the umbrella verification entry point, currently `tsc --noEmit`.
  Lint and tests should be added behind this name rather than as new scripts. `npm run typecheck` remains
  for types specifically, and **`npm run build` now runs `check` first**, so a type error fails the build.

### Changed

- **The frontend is now TypeScript.** All 10 `.jsx` files became `.tsx` (renamed via `git mv`, so history
  follows), `vite.config.js` became `vite.config.ts`, and `index.html` now loads `/src/main.tsx`. Added
  `typescript`, `@types/react`, and `@types/react-dom` as dev dependencies. The backend is unchanged and
  remains plain JavaScript.
  - `tsconfig.json` is `strict`, plus `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`,
    and `noUncheckedIndexedAccess`. It sets `noEmit` — Vite still does the bundling; `tsc` only checks.
  - **`npm run build` now runs `tsc --noEmit` first**, so a type error fails the build. Added
    `npm run typecheck` for the check alone. Note `npm run dev` does *not* typecheck: Vite strips types
    without checking them, so broken types still hot-reload.
  - New `src/types.ts` holds the shared model: `Message` (UI state, including the UI-only `isError` and
    `isStreaming` flags), `WireMessage` (the trimmed `{role, content}` shape actually sent to the backend),
    `StreamChunk` (one Azure SSE frame), `FinishReason`, and `ApiError`.
  - `StreamChunk.choices` is typed optional because Azure's first SSE frame carries only prompt
    content-filter results with an empty `choices` array — the types now document that quirk.
  - `main.tsx` throws a clear error if `#root` is missing rather than passing `null` to `createRoot`, and
    `App.tsx` narrows caught errors with `instanceof` instead of assuming `err.message` exists.

### Fixed

- **Azure calls now target AI Foundry's v1 surface.** The request URL is
  `{endpoint}/openai/v1/chat/completions` with the deployment sent in the body as `model`, replacing the
  classic `/openai/deployments/{name}/chat/completions?api-version=` path. The previous code also mangled
  endpoints copied from the Foundry portal, which already end in `/openai/v1`, producing a doubled
  `/openai/` segment. Both forms are now normalised.
- **`max_tokens` replaced with `max_completion_tokens`.** gpt-5 models reject the former outright
  (`400: "'max_tokens' is not supported with this model"`).
- **Removed `temperature: 0.7`.** gpt-5 models accept only the default value
  (`400: "does not support 0.7 … Only the default (1) value is supported"`).
- **Completion budget raised from 800 to 2000**, configurable via `AZURE_OPENAI_MAX_TOKENS`. gpt-5-mini is
  a reasoning model whose hidden reasoning tokens are drawn from the same budget and emitted before any
  visible text. Measured against the live deployment: budgets of 50 and 200 returned HTTP 200 with
  `finish_reason: "length"` and empty content, and a routine question consumed 512 reasoning tokens — so
  the old 800 left little headroom for the answer itself.

### Added

- **README: "Working with a reasoning model (gpt-5-mini)" section** — the two hard 400s (`max_tokens`,
  `temperature`) with Azure's verbatim error text, and a measured table of completion budgets against
  outcomes, so the empty-response failure mode is recognisable before it costs anyone an afternoon.
- **README: Stack and Contributing sections** — states plainly that the project is plain JavaScript with
  no TypeScript (the `.jsx` extension invites the opposite assumption), and records the release-notes-per-commit convention.
- **`CLAUDE.md`** — orientation for an agent opening this repo cold: stack, run instructions, the Azure
  constraints above, configuration reference, and deliberate gaps.
- **`CHANGELOG.md`** — this file.
- **Reasoning-budget exhaustion is now reported, not silent.** Previously it surfaced as a blank assistant
  bubble or a generic "Azure returned an empty response". The non-streaming path returns a
  `budget_exhausted` error naming `AZURE_OPENAI_MAX_TOKENS`, and the streaming path in `App.jsx` tracks
  `finish_reason` so a stream with no content deltas explains the real cause.
- **Production build documented** in the README, including that `npm run preview` does not inherit the
  `/api` proxy from `vite.config.js`'s `server` block.

### Documentation

- **README and `CLAUDE.md` corrected on the stack**, which previously stated outright that the project had
  no TypeScript. Both now describe the strict config, the `types.ts` model, and — most importantly — that
  `npm run dev` does not typecheck, so `tsc` is the only real gate.

- **All docs updated to describe Azure AI Foundry rather than classic Azure OpenAI**, matching the code as
  shipped: the title, architecture diagram, prerequisites, and project layout now name the v1 surface.
- **Environment variable table rewritten** with a Required column. `AZURE_OPENAI_API_VERSION` is now marked
  **unused** (it previously read as mandatory, which was actively misleading), `AZURE_OPENAI_MAX_TOKENS` is
  documented, and the endpoint row explains that a portal-supplied `/openai/v1` suffix is accepted.
- **`backend/.env.example` rewritten** to match — Foundry endpoint, a note that plain key auth suffices
  instead of `DefaultAzureCredential`, the budget variable with its reasoning-token caveat, and
  `AZURE_OPENAI_API_VERSION` commented out as unused.

### Changed

- **`AZURE_OPENAI_API_VERSION` is no longer required.** The v1 surface takes no `api-version` parameter, so
  it was dropped from the startup config check in `server.js` and from `REQUIRED_ENV` in `chat.js`.
  Key-based auth was verified working against both surfaces, so the `DefaultAzureCredential` flow shown in
  the Foundry portal sample is not needed.
- **README Node instructions** no longer tell you to run `nvm use` in every terminal; nvm's `default` now
  points at the pinned 22.22.2.

## [0.1.0] - 2026-08-21

### Added

- Initial POC: React 18 + Vite 5 chat UI (Executive Command Center styling) with token streaming, and a
  Node/Express proxy that keeps the Azure API key server-side. Inline error bubbles for auth, rate-limit,
  content-filter, and mid-stream failures; `?stream=false` non-streaming fallback; `/api/health`.
