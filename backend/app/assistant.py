"""Conversational AI assistant with tool use, powered by OpenRouter (OpenAI-compatible).

Tools the assistant can invoke against our own backend:
- list_invoices(status?): summary list, optionally filtered by status
- get_invoice(id): full row including extracted data
- retry_invoice(id): re-enqueue a failed invoice
- summarize_totals(status?): aggregate totals across invoices

The pattern is the standard OpenAI tool-calling loop: send messages + tools, if the model
returns `tool_calls` we execute them, append `role=tool` results, and call again until
the model returns a final assistant message with content. We cap iterations to avoid loops.
"""
from __future__ import annotations

import json
import logging
from typing import Any

from openai import OpenAI, OpenAIError
from sqlalchemy import select

from .ai_logger import log_ai_response
from .config import settings
from .db import SessionLocal
from .models import Invoice, InvoiceStatus
from .queue import enqueue
from .schemas import ChatStep

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """\
You are an assistant embedded in an invoice processing app. You help the user understand
the state of their invoices and take actions on them.

Use the provided tools to look up real data — never invent invoice numbers, totals, or
statuses. When the user asks about "my invoices" or anything specific, call a tool first.

When you reference an invoice, include its short id (first 8 characters) and filename so
the user can locate it in the UI. Keep responses concise.
"""

TOOLS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "list_invoices",
            "description": "List invoices, optionally filtered by status. Returns id, filename, status, total, vendor, and timestamps.",
            "parameters": {
                "type": "object",
                "properties": {
                    "status": {
                        "type": "string",
                        "enum": ["uploaded", "processing", "completed", "failed"],
                        "description": "Optional status filter.",
                    },
                    "limit": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 100,
                        "description": "Max rows to return. Default 25.",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_invoice",
            "description": "Fetch a single invoice by id (full id or unique prefix), including extracted data.",
            "parameters": {
                "type": "object",
                "properties": {"id": {"type": "string"}},
                "required": ["id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "retry_invoice",
            "description": "Re-enqueue a failed invoice for processing. Only works on invoices in 'failed' status.",
            "parameters": {
                "type": "object",
                "properties": {"id": {"type": "string"}},
                "required": ["id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "summarize_totals",
            "description": "Aggregate totals across invoices. Returns count and sum-by-currency.",
            "parameters": {
                "type": "object",
                "properties": {
                    "status": {
                        "type": "string",
                        "enum": ["uploaded", "processing", "completed", "failed"],
                    },
                },
            },
        },
    },
]


def _resolve_id(db, partial: str, user_id: str) -> Invoice | None:
    """Look up by full id, then by unique prefix — the model often uses short ids.
    Always filter by user_id so a user can never see or act on another user's invoice.
    """
    inv = db.get(Invoice, partial)
    if inv is not None and inv.user_id == user_id:
        return inv
    matches = db.execute(
        select(Invoice).where(Invoice.id.like(f"{partial}%"), Invoice.user_id == user_id)
    ).scalars().all()
    if len(matches) == 1:
        return matches[0]
    return None


def _summarize_invoice(inv: Invoice) -> dict[str, Any]:
    extracted = inv.extracted or {}
    return {
        "id": inv.id,
        "short_id": inv.id[:8],
        "filename": inv.filename,
        "status": inv.status,
        "vendor": extracted.get("vendor_name"),
        "total": extracted.get("total"),
        "currency": extracted.get("currency"),
        "attempts": inv.attempts,
        "error": inv.error,
        "created_at": inv.created_at.isoformat(),
    }


def _tool_list_invoices(args: dict[str, Any], user_id: str) -> dict[str, Any]:
    status = args.get("status")
    limit = int(args.get("limit", 25))
    with SessionLocal() as db:
        stmt = (
            select(Invoice)
            .where(Invoice.user_id == user_id)
            .order_by(Invoice.created_at.desc())
            .limit(limit)
        )
        if status:
            stmt = stmt.where(Invoice.status == status)
        rows = db.execute(stmt).scalars().all()
        return {"count": len(rows), "invoices": [_summarize_invoice(r) for r in rows]}


def _tool_get_invoice(args: dict[str, Any], user_id: str) -> dict[str, Any]:
    with SessionLocal() as db:
        inv = _resolve_id(db, args["id"], user_id)
        if inv is None:
            return {"error": f"no invoice found matching id {args['id']!r}"}
        return {
            **_summarize_invoice(inv),
            "extracted": inv.extracted,
            "updated_at": inv.updated_at.isoformat(),
        }


def _tool_retry_invoice(args: dict[str, Any], user_id: str) -> dict[str, Any]:
    with SessionLocal() as db:
        inv = _resolve_id(db, args["id"], user_id)
        if inv is None:
            return {"error": f"no invoice found matching id {args['id']!r}"}
        if inv.status != InvoiceStatus.FAILED.value:
            return {
                "error": f"invoice is in status {inv.status!r}; retry only applies to failed invoices",
                "id": inv.id,
            }
        invoice_id = inv.id
    enqueue(invoice_id)
    return {"ok": True, "id": invoice_id, "message": "re-enqueued for processing"}


def _tool_summarize_totals(args: dict[str, Any], user_id: str) -> dict[str, Any]:
    status = args.get("status")
    totals: dict[str, float] = {}
    count = 0
    with SessionLocal() as db:
        stmt = select(Invoice).where(Invoice.user_id == user_id)
        if status:
            stmt = stmt.where(Invoice.status == status)
        for inv in db.execute(stmt).scalars():
            count += 1
            extracted = inv.extracted or {}
            total = extracted.get("total")
            currency = extracted.get("currency") or "UNKNOWN"
            if isinstance(total, (int, float)):
                totals[currency] = totals.get(currency, 0.0) + float(total)
    return {"count": count, "totals_by_currency": totals}


TOOL_HANDLERS = {
    "list_invoices": _tool_list_invoices,
    "get_invoice": _tool_get_invoice,
    "retry_invoice": _tool_retry_invoice,
    "summarize_totals": _tool_summarize_totals,
}


def _to_openai_messages(messages: list[dict[str, str]]) -> list[dict[str, Any]]:
    convo: list[dict[str, Any]] = [{"role": "system", "content": SYSTEM_PROMPT}]
    for m in messages:
        if m["role"] in ("user", "assistant"):
            convo.append({"role": m["role"], "content": m["content"]})
    return convo


def _make_client() -> OpenAI:
    return OpenAI(
        api_key=settings.openrouter_api_key,
        base_url=settings.openrouter_base_url,
        default_headers={
            "HTTP-Referer": "http://localhost:5173",
            "X-Title": "Invoice Processing Demo",
        },
    )


def run_chat(messages: list[dict[str, str]], user_id: str) -> tuple[list[ChatStep], str]:
    if not settings.openrouter_api_key:
        return (
            [ChatStep(kind="text", text="The assistant is not configured (no OPENROUTER_API_KEY). Set one in backend/.env to enable chat.")],
            "The assistant is not configured (no OPENROUTER_API_KEY).",
        )

    client = _make_client()
    convo = _to_openai_messages(messages)
    steps: list[ChatStep] = []
    final_text = ""

    for round_index in range(6):  # cap tool-use rounds
        try:
            resp = client.chat.completions.create(
                model=settings.assistant_model,
                max_tokens=1024,
                messages=convo,
                tools=TOOLS,
            )
        except OpenAIError as e:
            # Auth, rate-limit, model-not-found, etc. — surface to the UI as a chat
            # message rather than a 500. The user sees the actual problem and can fix it.
            logger.warning("OpenRouter API error during chat: %s", e)
            msg = f"Assistant error: {e}"
            steps.append(ChatStep(kind="text", text=msg))
            return steps, msg

        message_dump = resp.choices[0].message.model_dump() if resp.choices else None
        log_ai_response(
            "assistant",
            settings.assistant_model,
            message_dump,
            user_id=user_id,
            round=round_index,
            finish_reason=resp.choices[0].finish_reason if resp.choices else None,
        )

        if not resp.choices:
            final_text = "(no response)"
            break

        message = resp.choices[0].message
        tool_calls = message.tool_calls or []

        # Append the assistant turn so the next iteration sees it. Some providers reject
        # `content: null`, so coerce to empty string when only tool_calls are present.
        asst_entry: dict[str, Any] = {
            "role": "assistant",
            "content": message.content or "",
        }
        if tool_calls:
            asst_entry["tool_calls"] = [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {"name": tc.function.name, "arguments": tc.function.arguments},
                }
                for tc in tool_calls
            ]
        convo.append(asst_entry)

        if message.content:
            final_text = message.content
            steps.append(ChatStep(kind="text", text=message.content))

        if not tool_calls:
            if not message.content:
                final_text = "(no response)"
            break

        for tc in tool_calls:
            tool_name = tc.function.name
            try:
                tool_input = json.loads(tc.function.arguments or "{}")
            except json.JSONDecodeError:
                tool_input = {}
            handler = TOOL_HANDLERS.get(tool_name)
            steps.append(ChatStep(kind="tool_use", tool_name=tool_name, tool_input=tool_input))
            if handler is None:
                result: Any = {"error": f"unknown tool {tool_name}"}
            else:
                try:
                    result = handler(tool_input, user_id)
                except Exception as e:  # noqa: BLE001
                    logger.exception("tool %s failed", tool_name)
                    result = {"error": str(e)}
            steps.append(ChatStep(kind="tool_result", tool_name=tool_name, tool_result=result))
            convo.append({
                "role": "tool",
                "tool_call_id": tc.id,
                "content": json.dumps(result, default=str),
            })
    else:
        final_text = final_text or "(stopped after too many tool-use rounds)"

    return steps, final_text
