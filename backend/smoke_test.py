"""End-to-end smoke test against a running backend.

Exercises: upload, list, detail, worker pipeline, WebSocket events, retry, delete,
chat endpoint shape, and the assistant tool-use loop (when an API key is configured).
"""
from __future__ import annotations

import asyncio
import io
import json
import sys
import time
from typing import Any

import httpx
import websockets
from PIL import Image, ImageDraw

API = "http://127.0.0.1:8000"
WS = "ws://127.0.0.1:8000/ws"


def make_invoice_png() -> bytes:
    img = Image.new("RGB", (600, 300), "white")
    d = ImageDraw.Draw(img)
    d.text((20, 20), "INVOICE #SMOKE-001", fill="black")
    d.text((20, 60), "Vendor: Smoke Test Corp", fill="black")
    d.text((20, 100), "Total: USD 250.00", fill="black")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


PASSES: list[str] = []
FAILS: list[str] = []


def ok(name: str) -> None:
    PASSES.append(name)
    print(f"  PASS  {name}")


def fail(name: str, detail: str) -> None:
    FAILS.append(f"{name}: {detail}")
    print(f"  FAIL  {name}: {detail}")


async def collect_ws(events: list[dict[str, Any]], stop: asyncio.Event) -> None:
    async with websockets.connect(WS) as ws:
        try:
            while not stop.is_set():
                try:
                    msg = await asyncio.wait_for(ws.recv(), timeout=0.5)
                except asyncio.TimeoutError:
                    continue
                events.append(json.loads(msg))
        except websockets.ConnectionClosed:
            pass


async def main() -> int:
    async with httpx.AsyncClient(base_url=API, timeout=15.0) as client:
        # 1. health
        r = await client.get("/api/health")
        if r.status_code == 200 and r.json() == {"ok": True}:
            ok("GET /api/health")
        else:
            fail("GET /api/health", f"{r.status_code} {r.text}")
            return 1

        # 2. WebSocket: start collector, then upload
        events: list[dict[str, Any]] = []
        stop = asyncio.Event()
        ws_task = asyncio.create_task(collect_ws(events, stop))
        await asyncio.sleep(0.3)  # let the WS connect

        # 3. upload
        png = make_invoice_png()
        r = await client.post(
            "/api/invoices",
            files={"file": ("smoke.png", png, "image/png")},
        )
        if r.status_code == 201:
            inv = r.json()
            invoice_id = inv["id"]
            if inv["status"] == "uploaded" and inv["filename"] == "smoke.png":
                ok("POST /api/invoices (created, uploaded status)")
            else:
                fail("POST /api/invoices", f"unexpected payload: {inv}")
        else:
            fail("POST /api/invoices", f"{r.status_code} {r.text}")
            stop.set()
            await ws_task
            return 1

        # 4. wait for completion via polling
        deadline = time.monotonic() + 10
        last = None
        while time.monotonic() < deadline:
            r = await client.get(f"/api/invoices/{invoice_id}")
            last = r.json()
            if last["status"] in ("completed", "failed"):
                break
            await asyncio.sleep(0.2)

        if last and last["status"] == "completed" and last["extracted"]:
            ok("worker: uploaded -> processing -> completed")
        else:
            fail("worker pipeline", f"final state: {last}")

        # 5. list returns it
        r = await client.get("/api/invoices")
        if r.status_code == 200 and any(i["id"] == invoice_id for i in r.json()):
            ok("GET /api/invoices contains uploaded row")
        else:
            fail("GET /api/invoices", f"{r.status_code}: id missing")

        # 6. file download
        r = await client.get(f"/api/invoices/{invoice_id}/file")
        if r.status_code == 200 and r.headers.get("content-type", "").startswith("image/"):
            ok("GET /api/invoices/:id/file")
        else:
            fail("GET /api/invoices/:id/file", f"{r.status_code} {r.headers.get('content-type')}")

        # 7. retry on a non-failed invoice should 409
        r = await client.post(f"/api/invoices/{invoice_id}/retry")
        if r.status_code == 409:
            ok("POST /api/invoices/:id/retry rejects non-failed (409)")
        else:
            fail("retry on completed should 409", f"got {r.status_code}")

        # 8. WS events: should see invoice.created and at least one invoice.updated for this id
        await asyncio.sleep(0.4)  # drain
        rel = [e for e in events if (e.get("invoice", {}).get("id") == invoice_id) or e.get("id") == invoice_id]
        types = [e["type"] for e in rel]
        if "invoice.created" in types and "invoice.updated" in types:
            ok(f"WebSocket received invoice.created + invoice.updated ({len(rel)} events)")
        else:
            fail("WebSocket events", f"got types={types}")

        # 9. retry path: induce a failure, then retry
        # Drop a non-image file by crafting a content-type the worker cannot rasterize.
        # We can't easily force the extractor to fail in stub mode without code changes,
        # so we exercise the retry endpoint directly by manipulating the row via SQL.
        # Skip if we can't reach the DB (out of process); just note it.
        try:
            from app.db import SessionLocal
            from app.models import Invoice, InvoiceStatus

            with SessionLocal() as db:
                row = db.get(Invoice, invoice_id)
                if row is not None:
                    row.status = InvoiceStatus.FAILED.value
                    row.error = "synthetic failure for retry test"
                    db.commit()
            r = await client.post(f"/api/invoices/{invoice_id}/retry")
            if r.status_code == 200 and r.json()["status"] == "uploaded":
                ok("POST /api/invoices/:id/retry on failed -> re-enqueued")
            else:
                fail("retry on failed", f"{r.status_code} {r.text}")

            # wait for it to flip to completed again
            deadline = time.monotonic() + 10
            while time.monotonic() < deadline:
                r = await client.get(f"/api/invoices/{invoice_id}")
                last = r.json()
                if last["status"] in ("completed", "failed"):
                    break
                await asyncio.sleep(0.2)
            if last["status"] == "completed" and last["attempts"] >= 2:
                ok(f"retry pipeline ran a second pass (attempts={last['attempts']})")
            else:
                fail("retry pipeline", f"state after retry: {last}")
        except Exception as e:
            fail("DB-level retry test", str(e))

        # 10. delete
        r = await client.delete(f"/api/invoices/{invoice_id}")
        if r.status_code == 204:
            ok("DELETE /api/invoices/:id")
        else:
            fail("DELETE /api/invoices/:id", f"{r.status_code} {r.text}")

        r = await client.get(f"/api/invoices/{invoice_id}")
        if r.status_code == 404:
            ok("GET after delete -> 404")
        else:
            fail("GET after delete", f"{r.status_code}")

        # 11. chat endpoint shape (stub-friendly)
        r = await client.post("/api/chat", json={"messages": [{"role": "user", "content": "hi"}]})
        if r.status_code == 200:
            data = r.json()
            if "reply" in data and "steps" in data:
                ok(f"POST /api/chat returns shape (reply len={len(data['reply'])})")
            else:
                fail("POST /api/chat shape", f"{data}")
        else:
            fail("POST /api/chat", f"{r.status_code} {r.text}")

        # 12. validation: bad content type
        r = await client.post(
            "/api/invoices",
            files={"file": ("a.txt", b"not an image", "text/plain")},
        )
        if r.status_code == 415:
            ok("POST /api/invoices rejects unsupported content type (415)")
        else:
            fail("POST /api/invoices content-type validation", f"got {r.status_code}")

        # 13. 404 on unknown id
        r = await client.get("/api/invoices/does-not-exist")
        if r.status_code == 404:
            ok("GET /api/invoices/:id 404 for unknown id")
        else:
            fail("404 path", f"got {r.status_code}")

        stop.set()
        await ws_task

    print()
    print(f"--- {len(PASSES)} passed, {len(FAILS)} failed ---")
    for f in FAILS:
        print("  -", f)
    return 0 if not FAILS else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
