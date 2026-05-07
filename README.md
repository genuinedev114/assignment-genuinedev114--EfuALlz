# Invoice Studio

A full-stack invoice processing app: upload PDFs or images, extract structured
data with a vision LLM, talk to an AI assistant that can answer questions and
take actions, and create new invoices that render as print-ready PDFs.

```text
┌──────────┐  upload   ┌────────────┐  enqueue  ┌─────────────┐
│  React   │ ────────► │  FastAPI   │ ────────► │ asyncio     │
│ + MUI +  │           │   API      │           │ worker      │
│ Framer   │ ◄── WS ── │ + auth/JWT │ ◄── DB ── │ + extractor │
└────┬─────┘           └─────┬──────┘           └──────┬──────┘
     │                       │                         │
     │  /api/chat            ▼                         ▼
     └────────────► tool-use loop ◄── DB ◄── OpenRouter (vision PDF passthrough)
                    (4 tools: list / get / retry / summarize)
```

---

## Run it

You need **Python 3.13+** and **Node 20+**. The whole thing is two terminals.

### 0. Get an OpenRouter key

Free tier at <https://openrouter.ai/keys> — no card required. Copy a `sk-or-v1-…` key.

### 1. Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1                # PowerShell
# or: source .venv/bin/activate              # bash

pip install --only-binary=:all: -r requirements.txt
copy .env.example .env                       # PowerShell  (cp .env.example .env on bash)
# edit .env and set OPENROUTER_API_KEY=sk-or-v1-...

.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

> **Why `--only-binary=:all:`?** On Python 3.13/3.14, `pydantic-core`, `bcrypt`, and a few
> others need recent prebuilt wheels. Forcing binary wheels avoids a from-source build.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>. Vite proxies `/api` and `/ws` to the backend on `:8000`.

> **Windows tip.** If Chrome shows `localhost refused to connect`, Vite has bound IPv6-only.
> Run with `npm run dev -- --host 127.0.0.1` instead.

### 3. First-time use

1. Click **Create account**, pick a username + email + a strong password (the form shows live
   requirements — uppercase, lowercase, number, symbol, ≥ 8 chars).
2. You're signed in immediately — no email verification step.
3. Drag a PDF or image into the **Upload** button (top right of Dashboard or Invoices), or
   press `Ctrl+U` to open the file picker. Files cap at 15 MB.
4. Watch the row flip from `uploaded` → `processing` → `completed` (or `failed`) live, no
   refresh. Click it to see extracted vendor / dates / line items, or toggle to **Preview**
   to see the PDF inline.
5. Try the floating **AI assistant** (bottom-right, or `Ctrl+K`):
   - "Which invoices are still processing?"
   - "Summarize totals across completed invoices."
   - "Show me failed invoices and retry them." (chains `list_invoices` → `retry_invoice` per row)
6. Try **/invoices/new** to build an invoice from a form: logo upload, line items, signature
   pad (draw or upload), footer image, Modern or Traditional theme. Click **Generate PDF**
   and the new row lands in your invoice list with status = completed.

### 4. Env vars (`backend/.env`)

| Var | Default | Notes |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | — | Required for real extraction & chat. |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | Override only if you front it with a proxy. |
| `EXTRACTION_MODEL` | `nvidia/nemotron-nano-12b-v2-vl:free` | Must support vision (image input + PDF file blocks). `google/gemini-2.5-flash` is the recommended upgrade. |
| `ASSISTANT_MODEL` | `openai/gpt-oss-120b:free` | Must support OpenAI-style tool calling. |
| `USE_STUB_EXTRACTION` | `0` | Set to `1` to bypass the model and write deterministic stub data — useful for offline demos. |
| `JWT_SECRET` | dev value | **Change in production.** |
| `JWT_EXPIRY_SECONDS` | `604800` (7d) | Token lifetime. |
| `DATABASE_URL` | `sqlite:///./invoices.db` | Any SQLAlchemy URL. |
| `UPLOAD_DIR` | `./uploads` | Where uploaded + generated PDFs live. |

If a free model gets rate-limited (429s), swap to one of the alternatives in
[`backend/.env.example`](backend/.env.example) — Llama 3.3, Qwen3, GLM-4.5, etc.

---

## Test it

### Automated smoke test

```powershell
cd backend
.\.venv\Scripts\python.exe smoke_test.py
```

Exercises every API path (auth + invoices + chat + WS). 14 checks; non-zero exit code on any
failure. Hits a running backend at `http://127.0.0.1:8000`, registers a throwaway user, and
walks the upload → processing → completed pipeline.

### Manual happy path

After starting both servers and creating an account:

| Step | What to look for |
| --- | --- |
| Drop a PDF onto the upload button | Row appears with `uploaded` status, then live-flips to `processing`, then `completed`. |
| Click the row | Two-tab toggle: **Extracted data** (vendor, dates, totals, line items) and **Preview** (inline PDF). |
| Click **Edit** on the data tab | Inline form for every field; corrections save via `PATCH /api/invoices/:id`. |
| Stop the backend mid-job, restart it | Anything stuck in `processing` is re-enqueued on startup (crash recovery). |
| Upload the same file twice | Second upload returns 409; you get a friendly **"Already uploaded"** toast (SHA-256 dedup). |
| Try the AI assistant | Returns `steps[]` with the trace of tool calls — visible under the "N tool calls" disclosure on each reply. |
| `Ctrl+L` / `Ctrl+U` / `Ctrl+K` / `/` | Keyboard shortcuts for Invoices / Upload / Chat / Search focus. |
| Toggle the sun/moon in the topbar | Light ↔ dark theme; the choice persists. |
| Avatar dropdown (top right) | Profile / Settings / Sign out. |

### Forcing a failure

Easiest: temporarily edit `backend/app/extraction.py` to `raise RuntimeError("forced")` at the
top of `_extract_sync`, upload an image, then revert. The row flips to `failed` with the error
visible in the detail page; the **Retry** button (or the assistant's `retry_invoice` tool)
re-runs it.

---

## What's built

### Required by the assignment ([TASK.md](TASK.md))

- **Upload** — drag-and-drop PDF / PNG / JPG / WebP (≤15 MB). Hidden file input opens via the
  Upload button or `Ctrl+U`.
- **List with status** — full Invoices page with filters (All / Uploaded / Processing /
  Completed / Failed), search, sort by newest/amount/vendor.
- **Real-time updates** — WebSocket fan-out at `/ws` (auth via `?token=` query param).
  Reconnect with exponential backoff, full re-sync on reconnect.
- **Extracted data view** — vendor, address, invoice #, dates, currency, subtotal/tax/total,
  line items, notes, plus inline PDF preview.
- **Retry** — per-row Retry button, bulk retry, and the AI assistant's `retry_invoice` tool —
  all hit the same backend code path. Crash recovery on startup re-enqueues stuck rows.
- **AI assistant** — floating bottom-right chat (Cmd/Ctrl+K). Powered by an OpenAI-compatible
  tool-use loop with four tools, every one of them scoped to the current user:
  - `list_invoices(status?, limit?)` — read
  - `get_invoice(id)` — read
  - `summarize_totals(status?)` — read
  - **`retry_invoice(id)` — action** (re-enqueues a failed invoice)
- **Status lifecycle** — `uploaded → processing → completed | failed`, with `attempts`
  bumped per pass and `error` recorded on failure.

### Beyond the assignment

| Area | What |
| --- | --- |
| **Auth** | Username + email + bcrypt password (with complexity rules), JWT, all invoice and chat routes scoped to `user_id`. WS authenticated via the same token. |
| **Pages** | React Router with proper URLs: `/`, `/invoices`, `/invoices/new`, `/invoices/:id`, `/profile`, `/settings`, `/login`, `/register`, plus 404. Page transitions via Framer Motion. |
| **Design system** | Material UI v6 with a custom theme (indigo `#2563eb` + cyan `#06b6d4` accent, warm neutral surfaces). Light + dark mode synced to `prefers-color-scheme` with manual override. Framer Motion for stagger entrances, page transitions, FAB float, list-item layout animations. |
| **Invoice creation** | Form-driven PDF generator (`/invoices/new`) with logo upload, signature pad (canvas-based) or upload, footer image, two themes (Modern / Traditional), tax & discount math. Generated invoices land in your list as `completed`. |
| **Inline editing** | PATCH endpoint to correct extracted fields; the AI sees corrections immediately because it queries the same DB. |
| **Bulk ops** | Multi-select with checkboxes; bulk delete and bulk retry endpoints. |
| **CSV export** | `GET /api/invoices/export.csv` streams a CSV; the UI downloads as a blob (auth-aware, no token-in-URL). |
| **Charts** | Inline-SVG status donut + currency-totals bar list on the dashboard. |
| **Duplicate detection** | SHA-256 of the file at upload time; same hash + same user → 409 with the existing invoice id. |
| **Notifications** | Toast stack (top-right, vertical). Auth events (login / register / sign out), invoice events (uploaded / processed / failed / deleted), and validation errors all surface here. |
| **Keyboard shortcuts** | `Ctrl+U` upload, `Ctrl+K` chat, `Ctrl+L` invoices, `/` focus search, `?` cheat-sheet, `Esc` close chat. |
| **Error handling** | FastAPI exception handlers (single-string `detail` for 422s, JSON 500s without leaking traces). React `<ErrorBoundary>`. Centralized `formatError()` for HTTP/network errors. Friendly upload-error copy (415 / 413 / 409 / 400 / 401). |
| **AI response logging** | Every model response is appended as a JSON line to `backend/logs/ai-<timestamp>.log` for debugging extractions later. |

---

## Stack & decisions

| Layer | Choice | Why |
| --- | --- | --- |
| API | FastAPI + SQLAlchemy 2 + SQLite | Async-first, single language for AI/extraction, zero-setup DB. Swap to Postgres in prod via `DATABASE_URL`. |
| Async | In-process `asyncio.Queue` worker | Smallest moving part for a demo. The `enqueue()` seam is the whole abstraction — swap for Redis/RQ/Celery without touching the rest. |
| Real-time | Native WebSocket with an in-process broadcaster (per-user fan-out) | One-way fan-out is enough; no SSE overhead. Replace the `Broadcaster` with Redis pub/sub for multi-replica prod. |
| Storage | Local FS, UUID-prefixed filenames | The `storage` module is the seam for swapping in S3. |
| LLM | OpenRouter (OpenAI-compatible) for both vision extraction and tool-use chat | One key, many models, free tier, easy to A/B by changing `EXTRACTION_MODEL` / `ASSISTANT_MODEL`. PDFs go to the model as native `file` blocks (no rasterization). |
| Assistant | OpenAI tool-use loop (max 6 rounds) | Standard pattern: feed back `tool_result` blocks until the model emits final text. The trace is surfaced to the UI for trust and debuggability. |
| Auth | Username + email + bcrypt + JWT | No third-party identity provider; tokens validated on every request and on the WS handshake. |
| PDF generation | ReportLab Platypus | Pure-Python wheel, cross-platform, no system deps. Two themes share a builder. |
| Frontend | React 18 + Vite + TypeScript + React Router | Familiar, fast dev loop, no app-framework overhead. |
| UI | Material UI v6 + Emotion + Framer Motion | The most popular React component library globally; Framer for delightful list/page animations. |
| State | One context per concern (Auth / Theme / Notifications / InvoiceStream) | A store (Zustand/Redux) would be premature for the surface area here. |

### Notable trade-offs

- **SQLite + in-process queue** is fine for one replica. Multi-node would need a real broker,
  shared blob storage, and a pub/sub backplane.
- **Tool calls are synchronous within the chat request.** Streaming would be nicer for UX
  (show tool calls as they happen) — left out for time. The trace shows after the fact.
- **The model controls when to call tools.** I deliberately did not add hard rules ("always
  call list_invoices first"); the system prompt + explicit tool descriptions are enough.
- **Short-lived DB sessions** in the worker and tool handlers — avoids holding connections
  across the LLM round-trip.
- **JWT only, no refresh tokens.** A simple long-lived JWT is enough for a demo; production
  wants refresh + revocation.
- **Retry is a status flip, not a backoff queue.** Production wants exponential backoff with
  a max-attempts cap and a dead-letter status.

---

## Repo layout

```text
backend/
  app/
    main.py             # FastAPI app + lifespan + global exception handlers
    config.py           # pydantic-settings env loader
    db.py               # SQLAlchemy engine, session, init_db (auto-wipes legacy schemas)
    models.py           # User + Invoice ORM models, status enum
    schemas.py          # Pydantic request/response models
    auth.py             # bcrypt + JWT + get_current_user dependency
    storage.py          # local file storage + SHA-256 hash (the S3 seam)
    queue.py            # asyncio worker queue + crash recovery
    extraction.py       # OpenRouter vision extractor (PDF passthrough or image_url)
    assistant.py        # OpenAI tool-use loop + 4 tool handlers
    pdf_generator.py    # ReportLab generator (Modern + Traditional themes, logo/signature/footer)
    realtime.py         # per-user WebSocket broadcaster
    ai_logger.py        # appends every AI response as JSON to logs/ai-<timestamp>.log
    routers/
      auth.py           # register / login / me / change password
      invoices.py       # upload / list / detail / file / patch / retry / delete / generate / stats / export.csv / bulk_*
      chat.py           # POST /api/chat
      ws.py             # /ws (auth via ?token=)
  smoke_test.py         # end-to-end test against a running server
  requirements.txt
  .env.example

frontend/
  src/
    App.tsx             # router + provider tree (Theme → MUI → Notifications → Auth)
    main.tsx
    api.ts              # fetch wrappers + UploadError + formatError + self-upload set
    types.ts
    styles.css          # backdrop, brand mark, splash, page-content, animations
    auth/               # AuthContext, ThemeContext
    components/
      AppLayout|AuthLayout (chrome)
      TopNav (horizontal menu) + user dropdown menu
      ChatWidget (floating FAB + Framer panel)
      ConfirmDialog (delete + sign-out)
      ToastStack (vertical Framer-animated notifications)
      ErrorBoundary
      FilePreview (auth-aware blob iframe + image)
      FileTypeBadge
      PageTransition
      SignaturePad (canvas)
      StatusDonut (inline SVG chart)
      ThemeToggle | UploadButton
    hooks/
      useInvoiceStream.ts (WS + toast dispatch)
      useKeyboardShortcuts.ts
    layouts/
      AppLayout.tsx | AuthLayout.tsx
    pages/
      DashboardPage | InvoicesPage | InvoiceDetailPage | CreateInvoicePage
      LoginPage | RegisterPage
      ProfilePage | SettingsPage | NotFoundPage
    notifications/NotificationsContext.tsx
    stream/InvoiceStreamContext.tsx
    theme/muiTheme.ts + MuiThemeBridge.tsx
  vite.config.ts | tsconfig.json | package.json

ai-artifacts/             # planning notes, prompt drafts (left as-is)
TASK.md                   # the original assignment brief
```

---

## What I'd do with more time

- **Streaming chat** — emit tool calls and tokens as they arrive instead of waiting for the
  whole response.
- **Pagination** — the invoice list is unbounded; for thousands of rows we'd want server-side
  pagination + virtualization.
- **Real broker** — `asyncio.Queue` for Redis/RQ so jobs survive restarts and scale across
  workers.
- **Schema for `extracted`** — currently free-form JSON. A Pydantic schema in the worker would
  let us reject bad model outputs and retry them automatically.
- **Confidence scores** — ask the model to grade each field; surface low-confidence ones for
  human review.
- **Tests** — backend unit tests for the extractor (with recorded fixtures) and tool handlers
  (in-memory SQLite). Playwright for the upload/chat flow.
- **Observability** — structured logs with invoice-id correlation, `/metrics` endpoint, traces
  around LLM calls.
- **PII handling** — strip/redact or encrypt uploads on disk; don't keep raw files alongside
  the DB indefinitely.

---

## How AI was used in development

Honest log of how I built this with Claude (which is the spirit of the assignment):

- **Architecture, code, and the AI assistant prompt itself were written by Claude in agent
  mode**, with me steering decisions (which broker, which model, which seam to leave open).
  Every file in this repo I reviewed before committing.
- **Decisions I made by hand, not delegated to AI:**
  - In-process queue vs. Redis (chose simplicity, called out the seam).
  - PDF passthrough via OpenRouter `file` blocks vs. local rasterization (less code, works on
    every vision-capable provider).
  - Tool-use loop with a hard iteration cap (avoids runaway loops).
  - Crash recovery via re-enqueueing `processing` rows on startup (cheap fix for a real
    failure mode).
  - Showing the tool-call trace in the UI (debuggability + user trust beat hiding the
    mechanism).
  - Indigo/cyan palette (rejected an early purple-gradient direction as too brand-loud).
- **Where Claude was clearly faster than me:** scaffolding the FastAPI + SQLAlchemy +
  Pydantic boilerplate, building the MUI theme overrides, stitching the WebSocket reconnect
  logic, writing the canvas-based signature pad.
- **Where I had to push back:** initial drafts over-engineered things (a full job-state
  machine, a separate worker process, a Redis backplane for a demo). I kept paring scope
  until the system fit on one page of architecture.
- **AI artifacts** — see [ai-artifacts/](ai-artifacts/) for the planning notes and prompt
  drafts left in as-is per the rubric.
