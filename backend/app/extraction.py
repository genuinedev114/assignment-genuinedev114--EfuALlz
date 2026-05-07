"""Invoice data extraction via OpenRouter (OpenAI-compatible vision API).

Strategy:
- Images go to the model as a base64 data-URL `image_url` block.
- PDFs go to the model directly as a base64 `file` block (OpenRouter's PDF passthrough,
  supported by Gemini, Claude, and other vision-capable providers). The model handles
  pagination internally — we don't rasterize.

We ask the model to return a strict JSON object and parse it. If parsing fails we raise,
which the worker turns into a `failed` status the user can retry.
"""
from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import re
from typing import Any

from openai import OpenAI, OpenAIError

from .ai_logger import log_ai_response
from .config import settings

logger = logging.getLogger(__name__)

EXTRACTION_PROMPT = """\
You are an invoice extraction service. Look at the invoice and return a JSON
object with these fields. Use null when a field is not visible.

{
  "vendor_name": string | null,
  "vendor_address": string | null,
  "invoice_number": string | null,
  "invoice_date": string | null,        // ISO 8601 (YYYY-MM-DD) when possible
  "due_date": string | null,            // ISO 8601 when possible
  "currency": string | null,            // ISO 4217 (USD, EUR, ...)
  "subtotal": number | null,
  "tax": number | null,
  "total": number | null,
  "line_items": [
    { "description": string, "quantity": number | null, "unit_price": number | null, "amount": number | null }
  ],
  "notes": string | null
}

Respond with JSON only — no commentary, no markdown fences.
"""


def _is_pdf(content_type: str, path: str) -> bool:
    return content_type == "application/pdf" or path.lower().endswith(".pdf")


def _is_image(content_type: str) -> bool:
    return content_type.startswith("image/")


def _data_url(data: bytes, media_type: str) -> str:
    b64 = base64.standard_b64encode(data).decode("ascii")
    return f"data:{media_type};base64,{b64}"


def _image_block(path: str, content_type: str) -> dict[str, Any]:
    with open(path, "rb") as f:
        data = f.read()
    media_type = content_type if content_type.startswith("image/") else "image/png"
    return {"type": "image_url", "image_url": {"url": _data_url(data, media_type)}}


def _pdf_file_block(path: str) -> dict[str, Any]:
    """OpenRouter's `file` content type: ships the raw PDF to the model as a data URL."""
    with open(path, "rb") as f:
        data = f.read()
    return {
        "type": "file",
        "file": {
            "filename": os.path.basename(path),
            "file_data": _data_url(data, "application/pdf"),
        },
    }


def _strip_json_fence(text: str) -> str:
    """Best-effort recovery: peel markdown code fences and extract the first JSON object.

    Models routinely wrap JSON in ```json ... ``` despite the prompt asking them not to.
    They also sometimes prepend prose ("Here's the JSON:") or get truncated mid-response.
    This handles all of those by:
      1. Stripping a leading ```fence (with optional language tag and newline)
      2. Stripping a trailing ``` fence
      3. Falling back to the substring between the first `{` and matching last `}`
    """
    cleaned = text.strip()
    # 1) Drop opening fence like ```json\n or ```\n
    cleaned = re.sub(r"^```(?:[a-zA-Z0-9_+-]+)?\s*\n?", "", cleaned, count=1)
    # 2) Drop trailing fence
    cleaned = re.sub(r"\s*```\s*$", "", cleaned).strip()
    # 3) If the cleaned text is still not pure JSON (preamble / postamble), pull out
    #    the largest object-shaped slice. This is a heuristic but very effective.
    if not cleaned.startswith("{"):
        first = cleaned.find("{")
        last = cleaned.rfind("}")
        if first != -1 and last > first:
            cleaned = cleaned[first:last + 1]
    return cleaned


def _stub_extraction(path: str) -> dict[str, Any]:
    """Deterministic placeholder used when USE_STUB_EXTRACTION=1 (no API key needed)."""
    return {
        "vendor_name": "Acme Corp (stubbed)",
        "vendor_address": "123 Example St",
        "invoice_number": "STUB-0001",
        "invoice_date": "2026-01-15",
        "due_date": "2026-02-15",
        "currency": "USD",
        "subtotal": 100.0,
        "tax": 10.0,
        "total": 110.0,
        "line_items": [
            {"description": "Demo line item", "quantity": 1, "unit_price": 100.0, "amount": 100.0},
        ],
        "notes": f"Stub extraction for {path}",
    }


def _make_client() -> OpenAI:
    return OpenAI(
        api_key=settings.openrouter_api_key,
        base_url=settings.openrouter_base_url,
        default_headers={
            "HTTP-Referer": "http://localhost:5173",
            "X-Title": "Invoice Studio",
        },
    )


def _extract_sync(path: str, content_type: str) -> dict[str, Any]:
    if settings.use_stub_extraction or not settings.openrouter_api_key:
        if not settings.openrouter_api_key:
            logger.warning("no OPENROUTER_API_KEY set — falling back to stub extraction")
        return _stub_extraction(path)

    if _is_pdf(content_type, path):
        media_block: dict[str, Any] = _pdf_file_block(path)
    elif _is_image(content_type):
        media_block = _image_block(path, content_type)
    else:
        raise ValueError(f"unsupported content type: {content_type}")

    client = _make_client()
    try:
        resp = client.chat.completions.create(
            model=settings.extraction_model,
            # 4096 leaves headroom for invoices with many line items / long addresses
            # (Unicode escapes like é in vendor names eat tokens fast).
            max_tokens=4096,
            messages=[
                {
                    "role": "user",
                    "content": [media_block, {"type": "text", "text": EXTRACTION_PROMPT}],
                }
            ],
        )
    except OpenAIError as e:
        raise ValueError(f"model call failed: {e}") from e

    text = resp.choices[0].message.content if resp.choices else None
    finish_reason = resp.choices[0].finish_reason if resp.choices else None
    log_ai_response(
        "extraction",
        settings.extraction_model,
        text,
        path=path,
        content_type=content_type,
        finish_reason=finish_reason,
    )
    if not resp.choices:
        raise ValueError("model returned no choices")
    if not text:
        raise ValueError("model returned no text content")
    raw = _strip_json_fence(text)
    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        # `finish_reason="length"` means the response was cut by max_tokens
        # before the closing brace — a common cause. Surface that hint so the
        # user / next-engineer knows whether to bump the limit. The full
        # response is captured in the AI log file for deeper debugging.
        hint = " (response was truncated — bump max_tokens)" if finish_reason == "length" else ""
        raise ValueError(
            f"extractor returned non-JSON output{hint}: {e}: {raw[:300]!r}"
        ) from e


async def extract_invoice(path: str, content_type: str) -> dict[str, Any]:
    # The SDK call is blocking, so push to a thread to keep the event loop free.
    return await asyncio.to_thread(_extract_sync, path, content_type)
