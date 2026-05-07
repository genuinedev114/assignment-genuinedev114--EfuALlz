"""In-process async job queue for invoice processing.

A single asyncio worker pulls invoice IDs off a queue and runs the extraction pipeline.
This is intentionally simple — for production you'd want a real broker (Redis/RQ, Celery,
SQS) so jobs survive process restarts and can scale horizontally. The seam is the
`enqueue` function: swap its body and the rest of the system doesn't care.

On startup we also re-enqueue any invoices that were left in `processing` state — that
covers the crash-mid-job case so users don't end up with stuck rows.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy import select

from .db import SessionLocal
from .extraction import extract_invoice
from .models import Invoice, InvoiceStatus
from .realtime import broadcaster

logger = logging.getLogger(__name__)

_queue: asyncio.Queue[str] = asyncio.Queue()
_worker_task: asyncio.Task | None = None


def enqueue(invoice_id: str) -> None:
    _queue.put_nowait(invoice_id)


async def _set_status(invoice_id: str, status: InvoiceStatus, *, error: str | None = None,
                       extracted: dict | None = None, bump_attempts: bool = False) -> Invoice | None:
    """Update status in a short-lived session and broadcast the change to the owner."""
    with SessionLocal() as db:
        inv = db.get(Invoice, invoice_id)
        if inv is None:
            return None
        inv.status = status.value
        inv.updated_at = datetime.now(timezone.utc)
        if error is not None:
            inv.error = error
        if status is InvoiceStatus.COMPLETED:
            inv.error = None
        if extracted is not None:
            inv.extracted = extracted
        if bump_attempts:
            inv.attempts = (inv.attempts or 0) + 1
        db.commit()
        db.refresh(inv)
        owner_id = inv.user_id
        snapshot = {
            "id": inv.id,
            "filename": inv.filename,
            "status": inv.status,
            "error": inv.error,
            "attempts": inv.attempts,
            "extracted": inv.extracted,
            "updated_at": inv.updated_at.isoformat(),
        }
    await broadcaster.broadcast(owner_id, {"type": "invoice.updated", "invoice": snapshot})
    return inv


async def _process_one(invoice_id: str) -> None:
    with SessionLocal() as db:
        inv = db.get(Invoice, invoice_id)
        if inv is None:
            logger.warning("queued invoice %s no longer exists", invoice_id)
            return
        storage_path = inv.storage_path
        content_type = inv.content_type

    await _set_status(invoice_id, InvoiceStatus.PROCESSING, bump_attempts=True)
    try:
        extracted = await extract_invoice(storage_path, content_type)
        await _set_status(invoice_id, InvoiceStatus.COMPLETED, extracted=extracted)
        logger.info("invoice %s completed", invoice_id)
    except Exception as exc:  # noqa: BLE001 — surface any extractor failure as job-level failure
        logger.exception("invoice %s failed", invoice_id)
        await _set_status(invoice_id, InvoiceStatus.FAILED, error=str(exc))


async def _worker_loop() -> None:
    while True:
        invoice_id = await _queue.get()
        try:
            await _process_one(invoice_id)
        finally:
            _queue.task_done()


async def start_worker() -> None:
    global _worker_task
    if _worker_task is not None:
        return
    # Recover anything stuck in `processing` from a previous run — most likely a crash.
    with SessionLocal() as db:
        stuck = db.execute(
            select(Invoice.id).where(Invoice.status == InvoiceStatus.PROCESSING.value)
        ).scalars().all()
    for invoice_id in stuck:
        logger.info("re-enqueueing stuck invoice %s on startup", invoice_id)
        enqueue(invoice_id)
    _worker_task = asyncio.create_task(_worker_loop(), name="invoice-worker")


async def stop_worker() -> None:
    global _worker_task
    if _worker_task is None:
        return
    _worker_task.cancel()
    try:
        await _worker_task
    except asyncio.CancelledError:
        pass
    _worker_task = None
