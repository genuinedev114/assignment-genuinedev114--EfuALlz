from __future__ import annotations

import csv
import hashlib
import io
import os
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..config import settings
from ..db import get_db
from ..models import Invoice, InvoiceStatus, User
from ..pdf_generator import generate_invoice_pdf
from ..queue import enqueue
from ..realtime import broadcaster
from ..schemas import (
    BulkIdsRequest,
    BulkResult,
    InvoiceGenerateRequest,
    InvoiceOut,
    InvoiceUpdate,
)
from ..storage import delete_file, save_upload

router = APIRouter(prefix="/api/invoices", tags=["invoices"])

ALLOWED_TYPES = {
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
}
MAX_BYTES = 15 * 1024 * 1024  # 15 MB cap — adjust per real-world invoices


def _user_invoice(db: Session, invoice_id: str, user: User) -> Invoice:
    inv = db.get(Invoice, invoice_id)
    if inv is None or inv.user_id != user.id:
        raise HTTPException(404, "invoice not found")
    return inv


@router.post("", response_model=InvoiceOut, status_code=201)
async def upload_invoice(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(415, f"unsupported content type: {file.content_type}")

    invoice_id, path, size, content_hash = save_upload(file.file, file.filename or "invoice")
    if size == 0:
        delete_file(path)
        raise HTTPException(400, "empty upload")
    if size > MAX_BYTES:
        delete_file(path)
        raise HTTPException(413, f"file too large ({size} bytes; max {MAX_BYTES})")

    # Duplicate detection: if this user already uploaded a file with the same content,
    # don't re-process — point them at the existing row. The hash is computed during
    # streaming-save so this only adds an indexed lookup.
    existing = db.execute(
        select(Invoice)
        .where(Invoice.user_id == user.id, Invoice.content_hash == content_hash)
        .limit(1)
    ).scalar_one_or_none()
    if existing is not None:
        delete_file(path)
        raise HTTPException(
            409,
            {
                "code": "duplicate",
                "message": f"You already uploaded this file as '{existing.filename}'.",
                "existing_id": existing.id,
            },
        )

    inv = Invoice(
        id=invoice_id,
        user_id=user.id,
        filename=file.filename or "invoice",
        content_type=file.content_type,
        size_bytes=size,
        storage_path=path,
        content_hash=content_hash,
        status=InvoiceStatus.UPLOADED.value,
    )
    db.add(inv)
    db.commit()
    db.refresh(inv)

    await broadcaster.broadcast(user.id, {
        "type": "invoice.created",
        "invoice": InvoiceOut.model_validate(inv).model_dump(mode="json"),
    })
    enqueue(invoice_id)
    return inv


@router.get("", response_model=list[InvoiceOut])
def list_invoices(
    status: str | None = None,
    limit: int | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = select(Invoice).where(Invoice.user_id == user.id).order_by(Invoice.created_at.desc())
    if status:
        stmt = stmt.where(Invoice.status == status)
    if limit is not None and limit > 0:
        stmt = stmt.limit(limit)
    return list(db.execute(stmt).scalars())


@router.get("/stats")
def invoice_stats(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Aggregate stats for the dashboard: counts per status, totals by currency."""
    rows = list(db.execute(select(Invoice).where(Invoice.user_id == user.id)).scalars())
    by_status = {s.value: 0 for s in InvoiceStatus}
    totals_by_currency: dict[str, float] = {}
    for inv in rows:
        by_status[inv.status] = by_status.get(inv.status, 0) + 1
        extracted = inv.extracted or {}
        total = extracted.get("total")
        currency = extracted.get("currency") or "—"
        if isinstance(total, (int, float)):
            totals_by_currency[currency] = totals_by_currency.get(currency, 0.0) + float(total)
    return {
        "total": len(rows),
        "by_status": by_status,
        "totals_by_currency": totals_by_currency,
    }


@router.get("/export.csv")
def export_csv(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Stream all invoices as CSV. Useful for accountants and external workflows."""
    rows = list(
        db.execute(select(Invoice).where(Invoice.user_id == user.id).order_by(Invoice.created_at.desc())).scalars()
    )
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "id", "filename", "status", "vendor", "invoice_number", "invoice_date",
        "due_date", "currency", "subtotal", "tax", "total", "attempts", "created_at",
    ])
    for inv in rows:
        ex = inv.extracted or {}
        writer.writerow([
            inv.id, inv.filename, inv.status,
            ex.get("vendor_name") or "",
            ex.get("invoice_number") or "",
            ex.get("invoice_date") or "",
            ex.get("due_date") or "",
            ex.get("currency") or "",
            ex.get("subtotal") if ex.get("subtotal") is not None else "",
            ex.get("tax") if ex.get("tax") is not None else "",
            ex.get("total") if ex.get("total") is not None else "",
            inv.attempts,
            inv.created_at.isoformat(),
        ])
    buf.seek(0)
    headers = {"Content-Disposition": 'attachment; filename="invoices.csv"'}
    return StreamingResponse(iter([buf.read()]), media_type="text/csv", headers=headers)


@router.post("/generate", response_model=InvoiceOut, status_code=201)
async def generate_invoice(
    req: InvoiceGenerateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Render the form payload as a PDF, persist as a completed invoice."""
    # Compute totals so we can store them in `extracted` for list/detail/AI tools.
    subtotal = 0.0
    line_items: list[dict] = []
    for it in req.items:
        amount = float(it.rate) * float(it.quantity)
        subtotal += amount
        line_items.append({
            "description": it.description,
            "quantity": it.quantity,
            "unit_price": it.rate,
            "amount": amount,
        })
    discount = 0.0
    if req.discount_type == "percentage" and req.discount_value:
        discount = subtotal * (req.discount_value / 100.0)
    elif req.discount_type == "fixed" and req.discount_value:
        discount = float(req.discount_value)
    taxable = max(0.0, subtotal - discount)
    tax = taxable * ((req.tax_rate or 0) / 100.0)
    total = taxable + tax

    # Render to a UUID-prefixed PDF in the upload dir, mirroring uploads.
    invoice_id = str(uuid.uuid4())
    filename = f"{req.number or 'invoice'}.pdf".replace("/", "_").replace("\\", "_")
    storage_path = str(settings.upload_path / f"{invoice_id}.pdf")
    payload = req.model_dump(by_alias=False)
    # The PDF generator expects a `from`/`to` shape but our schema uses sender/recipient.
    payload["from"] = payload.pop("sender")
    payload["to"] = payload.pop("recipient")
    try:
        generate_invoice_pdf(payload, storage_path)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(500, f"failed to render PDF: {e}")

    # Hash + size for the standard fields.
    with open(storage_path, "rb") as f:
        data = f.read()
    content_hash = hashlib.sha256(data).hexdigest()
    size_bytes = len(data)

    extracted = {
        "vendor_name": req.sender.name,
        "vendor_address": ", ".join(filter(None, [req.sender.address, req.sender.city])) or None,
        "invoice_number": req.number,
        "invoice_date": req.date,
        "due_date": req.due_date,
        "currency": req.currency,
        "subtotal": round(subtotal, 2),
        "tax": round(tax, 2),
        "total": round(total, 2),
        "line_items": line_items,
        "notes": req.notes,
    }

    inv = Invoice(
        id=invoice_id,
        user_id=user.id,
        filename=filename,
        content_type="application/pdf",
        size_bytes=size_bytes,
        storage_path=storage_path,
        content_hash=content_hash,
        status=InvoiceStatus.COMPLETED.value,
        attempts=0,
        extracted=extracted,
    )
    db.add(inv)
    db.commit()
    db.refresh(inv)

    await broadcaster.broadcast(user.id, {
        "type": "invoice.created",
        "invoice": InvoiceOut.model_validate(inv).model_dump(mode="json"),
    })
    return inv


@router.post("/bulk_delete", response_model=BulkResult)
async def bulk_delete(
    req: BulkIdsRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    succeeded: list[str] = []
    failed: dict[str, str] = {}
    paths_to_delete: list[str] = []
    for invoice_id in req.ids:
        inv = db.get(Invoice, invoice_id)
        if inv is None or inv.user_id != user.id:
            failed[invoice_id] = "not found"
            continue
        paths_to_delete.append(inv.storage_path)
        db.delete(inv)
        succeeded.append(invoice_id)
    db.commit()
    for p in paths_to_delete:
        delete_file(p)
    for invoice_id in succeeded:
        await broadcaster.broadcast(user.id, {"type": "invoice.deleted", "id": invoice_id})
    return BulkResult(succeeded=succeeded, failed=failed)


@router.post("/bulk_retry", response_model=BulkResult)
async def bulk_retry(
    req: BulkIdsRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    succeeded: list[str] = []
    failed: dict[str, str] = {}
    for invoice_id in req.ids:
        inv = db.get(Invoice, invoice_id)
        if inv is None or inv.user_id != user.id:
            failed[invoice_id] = "not found"
            continue
        if inv.status != InvoiceStatus.FAILED.value:
            failed[invoice_id] = f"status is {inv.status!r}; retry only applies to failed"
            continue
        inv.status = InvoiceStatus.UPLOADED.value
        inv.error = None
        inv.updated_at = datetime.now(timezone.utc)
        succeeded.append(invoice_id)
    db.commit()
    for invoice_id in succeeded:
        inv = db.get(Invoice, invoice_id)
        if inv is None:
            continue
        await broadcaster.broadcast(user.id, {
            "type": "invoice.updated",
            "invoice": InvoiceOut.model_validate(inv).model_dump(mode="json"),
        })
        enqueue(invoice_id)
    return BulkResult(succeeded=succeeded, failed=failed)


@router.get("/{invoice_id}", response_model=InvoiceOut)
def get_invoice(
    invoice_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return _user_invoice(db, invoice_id, user)


@router.patch("/{invoice_id}", response_model=InvoiceOut)
async def update_invoice(
    invoice_id: str,
    req: InvoiceUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Allow the user to manually correct fields the extractor got wrong.

    The `extracted` payload replaces the existing dict wholesale — the frontend
    sends the merged version. Status is unaffected.
    """
    inv = _user_invoice(db, invoice_id, user)
    if req.extracted is not None:
        inv.extracted = req.extracted
        inv.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(inv)

    await broadcaster.broadcast(user.id, {
        "type": "invoice.updated",
        "invoice": InvoiceOut.model_validate(inv).model_dump(mode="json"),
    })
    return inv


@router.get("/{invoice_id}/file")
def get_invoice_file(
    invoice_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    inv = _user_invoice(db, invoice_id, user)
    return FileResponse(inv.storage_path, media_type=inv.content_type, filename=inv.filename)


@router.post("/{invoice_id}/retry", response_model=InvoiceOut)
async def retry_invoice(
    invoice_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    inv = _user_invoice(db, invoice_id, user)
    if inv.status != InvoiceStatus.FAILED.value:
        raise HTTPException(409, f"can only retry failed invoices (current: {inv.status})")

    inv.status = InvoiceStatus.UPLOADED.value
    inv.error = None
    inv.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(inv)

    await broadcaster.broadcast(user.id, {
        "type": "invoice.updated",
        "invoice": InvoiceOut.model_validate(inv).model_dump(mode="json"),
    })
    enqueue(invoice_id)
    return inv


@router.delete("/{invoice_id}", status_code=204)
async def delete_invoice(
    invoice_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    inv = _user_invoice(db, invoice_id, user)
    storage_path = inv.storage_path
    db.delete(inv)
    db.commit()
    delete_file(storage_path)
    await broadcaster.broadcast(user.id, {"type": "invoice.deleted", "id": invoice_id})
    return None
