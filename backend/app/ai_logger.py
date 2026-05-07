"""Append every AI-model response to a per-server-run log file.

Filename embeds the server start time so each restart produces a fresh log:
    backend/logs/ai-2026-05-07T10-15-30.log

Each entry is a single JSON line with timestamp, kind (extraction/assistant),
model, request meta (e.g. invoice id), and the raw response payload. Useful for
debugging extraction failures and reviewing what the assistant actually said.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any

logger = logging.getLogger(__name__)

_LOG_DIR = Path(__file__).resolve().parent.parent / "logs"
_LOG_DIR.mkdir(parents=True, exist_ok=True)

# Local time in the filename so people grepping their logs see something familiar.
_START_TS = datetime.now().strftime("%Y-%m-%dT%H-%M-%S")
LOG_FILE = _LOG_DIR / f"ai-{_START_TS}.log"

_lock = Lock()
_announced = False


def log_ai_response(kind: str, model: str, response: Any, **meta: Any) -> None:
    """Append a JSON line for one AI model response. Best-effort: never raises."""
    global _announced
    entry = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "kind": kind,
        "model": model,
        "meta": meta,
        "response": response,
    }
    line = json.dumps(entry, default=str, ensure_ascii=False)
    try:
        with _lock:
            with LOG_FILE.open("a", encoding="utf-8") as f:
                f.write(line + "\n")
            if not _announced:
                logger.info("AI log file: %s", LOG_FILE)
                _announced = True
    except Exception as e:  # noqa: BLE001 — logging must not crash the request
        logger.warning("failed to write ai log: %s", e)
