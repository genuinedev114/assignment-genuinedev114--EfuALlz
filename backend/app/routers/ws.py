from __future__ import annotations

import logging

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, status

from ..auth import authenticate_user_id
from ..db import SessionLocal
from ..realtime import broadcaster

logger = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/ws")
async def ws_endpoint(ws: WebSocket, token: str = Query(default="")):
    # WebSockets don't easily support custom headers in the browser, so we authenticate
    # via a `?token=...` query param. The token is the same JWT issued on login.
    if not token:
        await ws.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    with SessionLocal() as db:
        user = authenticate_user_id(token, db)
    if user is None:
        await ws.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await broadcaster.connect(ws, user.id)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception as e:  # noqa: BLE001
        logger.debug("ws session ended: %s", e)
    finally:
        await broadcaster.disconnect(ws, user.id)
