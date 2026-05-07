# Initial plan (jotted down before writing any code)

> Left in as-is per the assignment. Some details drifted during implementation —
> the README is the source of truth for what got built.

## Constraints I'm designing against

- Single-day build. No multi-node infra.
- Real-time updates with no polling.
- Async state that survives mid-flight failures.
- AI assistant has to take *actions*, not just answer.
- Reviewer should be able to run it locally without a Docker stack.

## Architecture sketch

- **Backend: FastAPI + SQLAlchemy + SQLite.**
  - One process, one DB, one upload directory. Everything else is a seam I can swap later.
  - `asyncio.Queue` worker (in-process) runs the extraction. Cheaper than Celery/RQ for a demo and the queue is the *only* place that needs to change to scale out.
  - WebSocket fan-out for status changes. SSE was tempting but WS gives me a future bidirectional channel for free if I add streaming chat later.
- **Frontend: Vite + React + TS.**
  - Three panes: list, detail, chat. Single hook owns the invoice list and applies WS events.
- **AI:**
  - Claude vision for extraction (image blocks; rasterize PDFs locally with pypdfium2 to avoid Files API).
  - Claude tool-use loop for the assistant. Tools wrap the same DB the UI reads, so retries flow through the WS stream without special-casing.

## Data model

```
Invoice
  id (uuid, PK)
  filename, content_type, size_bytes, storage_path
  status: uploaded | processing | completed | failed
  error: text | null
  attempts: int
  extracted: JSON | null
  created_at, updated_at
```

Single table is enough. The extracted shape is dictated by the LLM and can change
per-invoice — JSON column means no migrations when I tweak the prompt.

## Status flow

```
uploaded ──► processing ──► completed
                  │
                  └────────► failed ──(retry)──► uploaded ──► ...
```

Retry just flips status back to `uploaded` and re-enqueues. Counter on `attempts`
records how many passes have run.

## Failure cases I want to handle

- **Crash mid-extraction.** On startup, re-enqueue any rows still in `processing`.
- **Empty / oversized upload.** Reject at the API boundary, delete the half-written file.
- **Model returns garbage JSON.** Worker raises, status flips to `failed`, error captured.
- **WS dropped.** Frontend reconnects with backoff and re-fetches the list to fill the gap.

## What I'm not doing

- Auth/multi-tenant.
- Streaming chat (out of scope; trace is shown after the fact instead).
- Real message broker.
- File-type sniffing beyond Content-Type (trusting the browser-supplied type for the demo).
- Confidence scores or human-in-the-loop review.

## AI assistant tools

- `list_invoices(status?)` — filtered list summary.
- `get_invoice(id)` — full row including extracted data. Accepts short-id prefix.
- `retry_invoice(id)` — only allowed on `failed` status.
- `summarize_totals(status?)` — count + sum-by-currency.

System prompt insists on calling tools rather than inventing data. Hard cap of 6
tool-use rounds to avoid loops. Tool trace is surfaced to the UI for trust.
