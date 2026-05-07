"""WebSocket fan-out for invoice status updates, scoped per user.

A single in-process broadcaster is fine for a single-node demo. In production this would
be a pub/sub backplane (Redis pub/sub, NATS, etc.) so multiple API replicas can fan out
events from any worker.
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class Broadcaster:
    def __init__(self) -> None:
        # Map user_id -> set of WebSocket connections, so we can fan out only to that
        # user's open tabs/devices.
        self._clients: dict[str, set[WebSocket]] = {}
        self._lock = asyncio.Lock()
        self._loop: asyncio.AbstractEventLoop | None = None

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        """Capture the main event loop so worker threads / sync code can schedule broadcasts."""
        self._loop = loop

    async def connect(self, ws: WebSocket, user_id: str) -> None:
        await ws.accept()
        async with self._lock:
            self._clients.setdefault(user_id, set()).add(ws)

    async def disconnect(self, ws: WebSocket, user_id: str) -> None:
        async with self._lock:
            bucket = self._clients.get(user_id)
            if bucket is not None:
                bucket.discard(ws)
                if not bucket:
                    self._clients.pop(user_id, None)

    async def broadcast(self, user_id: str, event: dict[str, Any]) -> None:
        payload = json.dumps(event, default=str)
        async with self._lock:
            targets = list(self._clients.get(user_id, ()))
        dead: list[WebSocket] = []
        for ws in targets:
            try:
                await ws.send_text(payload)
            except Exception as e:  # noqa: BLE001 — any send failure means we drop the client
                logger.debug("ws send failed, dropping client: %s", e)
                dead.append(ws)
        if dead:
            async with self._lock:
                bucket = self._clients.get(user_id)
                if bucket is not None:
                    for ws in dead:
                        bucket.discard(ws)
                    if not bucket:
                        self._clients.pop(user_id, None)

    def broadcast_threadsafe(self, user_id: str, event: dict[str, Any]) -> None:
        """Schedule a broadcast from a non-async context (e.g. a worker thread)."""
        if self._loop is None:
            logger.warning("broadcaster has no loop bound; dropping event %s", event.get("type"))
            return
        asyncio.run_coroutine_threadsafe(self.broadcast(user_id, event), self._loop)


broadcaster = Broadcaster()
