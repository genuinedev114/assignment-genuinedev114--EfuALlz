# Extraction prompt notes

The current extraction prompt lives in `backend/app/extraction.py` as `EXTRACTION_PROMPT`.

## What I tried

1. **First draft** — long instructions, examples, "be careful with currency" caveats. The
   model was already doing the right thing without any of that, and the extra tokens
   added latency. Trimmed to the schema + a JSON-only output instruction.

2. **JSON-only directive** — initial drafts had the model wrap output in ```json fences
   even when told not to. Added `_strip_json_fence()` as a defensive parse to recover
   gracefully instead of failing the whole job. (Doesn't seem to be needed with
   Haiku 4.5 / Sonnet 4.6, but harmless.)

3. **Schema as JSON-with-types vs. natural language** — JSON shape with `string | null`
   syntax got more consistent output than prose ("the vendor name, or null if missing").

## What I'd add given more time

- A second pass that asks the model to grade its own confidence per field, and surface
  low-confidence fields in the UI for human review.
- Few-shot examples for tricky cases (multi-page invoices, tax-inclusive vs.
  tax-exclusive totals, foreign currency).
- An output schema enforced via Anthropic's tool-use feature instead of a JSON-output
  prompt, which would give us guaranteed structure rather than best-effort parsing.

## Why I'm rasterizing PDFs instead of using the Files API

- Keeps the dependency surface small (just `pypdfium2`).
- Works the same way for image and PDF inputs — one code path.
- No vendor-specific "PDF document block" — works on any vision-capable model.

The downside is token cost: a multi-page PDF balloons the request. I cap at 5 pages
and call out chunked extraction as a follow-up.
