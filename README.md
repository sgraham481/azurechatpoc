# Azure OpenAI Chat POC

A minimal proof of concept: an Astrion Executive Command Center-styled chat UI in React, streaming responses from Azure OpenAI through a Node/Express proxy.

```
React (Vite) :5173  --/api/chat (SSE)-->  Node/Express :3001  --HTTPS-->  Azure OpenAI
```

The browser never talks to Azure directly. The API key lives only in `backend/.env` and is never sent to the client.

## Prerequisites

- **Node.js 18+.** This repo pins **22.22.2** via `.nvmrc`, and that is also the nvm `default`, so a new terminal already lands on it — check with `node -v`. If yours reports something older (a different version manager, or the default has drifted), run `nvm use` to pick up `.nvmrc`.
- An Azure OpenAI resource with a deployed chat model (e.g. `gpt-4o-mini`).

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

| Variable | Where to find it |
| --- | --- |
| `AZURE_OPENAI_ENDPOINT` | Azure portal → your resource → **Keys and Endpoint** (e.g. `https://your-resource.openai.azure.com`) |
| `AZURE_OPENAI_API_KEY` | Same blade, KEY 1 or KEY 2 |
| `AZURE_OPENAI_DEPLOYMENT` | Azure AI Foundry → **Deployments** — the *deployment* name you chose, not the model name |
| `AZURE_OPENAI_API_VERSION` | Shown alongside your deployment's sample code. The value in `.env.example` is a placeholder — use the current one your deployment lists |
| `PORT` | Backend port, defaults to `3001` |
| `CORS_ORIGIN` | Allowed browser origin, defaults to `http://localhost:5173` |

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
2. The backend prepends the system prompt (`backend/src/routes/chat.js`), calls Azure with `stream: true`, and pipes Azure's `text/event-stream` straight through.
3. The frontend reads the response with `ReadableStream`, buffers partial SSE frames, and appends each token delta to the in-progress assistant message.

**Non-streaming fallback:** `POST /api/chat?stream=false` returns a single JSON completion instead. Useful if streaming misbehaves during a live demo.

## Error handling

| Condition | Result in the UI |
| --- | --- |
| Missing env vars | 500 naming exactly which variables to set |
| Azure 401/403 | "Auth failed — check API key/endpoint" |
| Azure 404 | Points at the deployment name / API version |
| Azure 429 | 429 with Azure's `Retry-After` passed through |
| Content filter | Friendly inline message, conversation preserved |
| Stream drops mid-response | Error frame in the stream, rendered as an inline error bubble |

Errors render as an inline error bubble — never an alert, never a blank screen — and the rest of the conversation stays intact.

## Project layout

```
backend/
  src/server.js          Express app, CORS, health check, config validation
  src/routes/chat.js     POST /api/chat — system prompt, Azure call, SSE passthrough, error mapping
  .env.example
frontend/
  src/App.jsx            Message state, send handler, SSE parsing
  src/components/
    Header.jsx           Top bar (presentational)
    Sidebar.jsx          Left nav (presentational)
    Footer.jsx           Footer bar (presentational)
    ChatWindow.jsx       Scrollable message list, auto-scroll, typing indicator
    MessageBubble.jsx    User / assistant / error bubble styling
    ChatInput.jsx        Auto-growing textarea, Enter to send, Shift+Enter for newline
    SuggestionChips.jsx  Starter prompts — clicking one sends it
    Icons.jsx            Inline SVGs, no icon dependency
  src/styles.css         Design tokens and layout
```

## Notes and known gaps

- The **ASTRION wordmark is a placeholder** SVG in `Icons.jsx`. Swap in the real asset when you have it.
- Search, notifications, the account avatar, and the footer links are **presentational only** — deliberately out of scope.
- The footer's "Data as of" timestamp is **hardcoded** in `App.jsx`; there's no live data source behind it.
- The system prompt tells the model not to invent figures it wasn't given. Since no real metrics are wired in, it will decline specific numbers — worth knowing before you demo the "Why is Rule of 40 at 7.3%?" chip.
- No auth, no persistence (refresh clears the chat), single user, local only.
