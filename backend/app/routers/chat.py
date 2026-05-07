from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends

from ..assistant import run_chat
from ..auth import get_current_user
from ..models import User
from ..schemas import ChatRequest, ChatResponse

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("", response_model=ChatResponse)
async def chat(req: ChatRequest, user: User = Depends(get_current_user)):
    messages = [m.model_dump() for m in req.messages]
    # The OpenAI SDK call is sync; offload so we don't block the event loop.
    steps, reply = await asyncio.to_thread(run_chat, messages, user.id)
    return ChatResponse(steps=steps, reply=reply)
