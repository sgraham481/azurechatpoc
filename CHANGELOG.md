# Changelog

Release notes for every commit. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Add entries under `[Unreleased]` in the same commit as the code change.

## [Unreleased]

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
