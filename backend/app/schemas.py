import re
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class InvoiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    filename: str
    content_type: str
    size_bytes: int
    status: str
    error: str | None = None
    attempts: int
    extracted: dict[str, Any] | None = None
    created_at: datetime
    updated_at: datetime


class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]


class ChatStep(BaseModel):
    """A single step in the assistant's response — either text or a tool invocation we surface to the UI."""

    kind: str  # "text" | "tool_use" | "tool_result"
    text: str | None = None
    tool_name: str | None = None
    tool_input: dict[str, Any] | None = None
    tool_result: Any | None = None


class ChatResponse(BaseModel):
    steps: list[ChatStep]
    reply: str


# --- auth ---

_HAS_UPPER = re.compile(r"[A-Z]")
_HAS_LOWER = re.compile(r"[a-z]")
_HAS_DIGIT = re.compile(r"\d")
_HAS_SYMBOL = re.compile(r"[^A-Za-z0-9]")


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=32, pattern=r"^[a-zA-Z0-9_-]+$")
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    password_confirm: str

    @field_validator("password")
    @classmethod
    def _password_complexity(cls, v: str) -> str:
        problems: list[str] = []
        if not _HAS_UPPER.search(v): problems.append("an uppercase letter")
        if not _HAS_LOWER.search(v): problems.append("a lowercase letter")
        if not _HAS_DIGIT.search(v): problems.append("a number")
        if not _HAS_SYMBOL.search(v): problems.append("a symbol")
        if problems:
            raise ValueError("password must contain " + ", ".join(problems))
        return v


class LoginRequest(BaseModel):
    """`identifier` is either email or username — accept both for convenience."""

    identifier: str
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    username: str
    email: EmailStr


class TokenResponse(BaseModel):
    token: str
    user: UserOut


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)
    new_password_confirm: str

    @field_validator("new_password")
    @classmethod
    def _password_complexity(cls, v: str) -> str:
        problems: list[str] = []
        if not _HAS_UPPER.search(v): problems.append("an uppercase letter")
        if not _HAS_LOWER.search(v): problems.append("a lowercase letter")
        if not _HAS_DIGIT.search(v): problems.append("a number")
        if not _HAS_SYMBOL.search(v): problems.append("a symbol")
        if problems:
            raise ValueError("password must contain " + ", ".join(problems))
        return v


# --- invoice updates ---

class InvoiceUpdate(BaseModel):
    """Fields a user can override on an extracted invoice."""

    extracted: dict[str, Any] | None = None


class BulkIdsRequest(BaseModel):
    ids: list[str] = Field(min_length=1, max_length=200)


class BulkResult(BaseModel):
    succeeded: list[str]
    failed: dict[str, str]  # id -> error message


# --- invoice generation ---

class InvoiceParty(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    email: str | None = None
    address: str | None = None
    city: str | None = None
    phone: str | None = None
    tax_id: str | None = None


class InvoiceLineItem(BaseModel):
    description: str = Field(min_length=1, max_length=500)
    details: str | None = None
    rate: float = Field(ge=0)
    quantity: float = Field(default=1, gt=0)


class InvoiceGenerateRequest(BaseModel):
    """Form payload from the Create-invoice page. The backend renders this to
    a PDF and persists the result as a regular Invoice with status=completed."""

    title: str | None = None       # defaults to "Invoice"
    number: str | None = None
    date: str | None = None        # YYYY-MM-DD
    due_date: str | None = None
    terms: str | None = None
    sender: InvoiceParty
    recipient: InvoiceParty
    items: list[InvoiceLineItem] = Field(min_length=1)
    currency: str = Field(default="USD", max_length=8)
    tax_rate: float | None = Field(default=None, ge=0, le=100)
    tax_label: str | None = None
    tax_type: str | None = None  # "on_total" | "per_item"
    discount_type: str | None = None  # "percentage" | "fixed"
    discount_value: float | None = Field(default=None, ge=0)
    theme: str | None = None  # "modern" | "traditional"
    logo_data_url: str | None = None  # data:image/png;base64,...
    signature_data_url: str | None = None  # signature image (drawn canvas or uploaded)
    footer_image_data_url: str | None = None  # banner image rendered at the bottom
    notes: str | None = None
