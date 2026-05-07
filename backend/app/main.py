from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .db import init_db
from .queue import start_worker, stop_worker
from .realtime import broadcaster
from .routers import auth, chat, invoices, ws

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    broadcaster.bind_loop(asyncio.get_running_loop())
    await start_worker()
    try:
        yield
    finally:
        await stop_worker()


app = FastAPI(title="Invoice Processing System", lifespan=lifespan)

# Vite dev server runs on 5173. In prod the frontend would be served from the same
# origin (or behind a reverse proxy) and CORS could be tightened/removed.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Error handlers ---
#
# Two custom handlers replace FastAPI's defaults:
#   - 422 (validation) errors are flattened into a single human-readable
#     message instead of the verbose `[{loc, msg, ...}]` array. This keeps
#     the frontend code simple — it always reads `detail` as a string.
#   - Any uncaught exception returns a clean 500 JSON instead of leaking a
#     stack trace. The trace is still logged server-side for debugging.

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    # Build "field: message" pairs and join with semicolons.
    parts: list[str] = []
    for err in exc.errors():
        loc_parts = [str(p) for p in err.get("loc", ()) if p not in ("body", "query", "path")]
        loc = ".".join(loc_parts) if loc_parts else "request"
        msg = err.get("msg", "invalid input")
        parts.append(f"{loc}: {msg}")
    detail = "; ".join(parts) or "validation failed"
    return JSONResponse(status_code=422, content={"detail": detail})


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    # FastAPI handles HTTPException and the validation handler above on its own,
    # so this only fires for genuinely unexpected errors.
    logger.exception("unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error. Please try again."},
    )


app.include_router(auth.router)
app.include_router(invoices.router)
app.include_router(chat.router)
app.include_router(ws.router)


@app.get("/api/health")
def health():
    return {"ok": True}
