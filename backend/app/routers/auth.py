from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import (
    create_token,
    get_current_user,
    hash_password,
    new_user_id,
    verify_password,
)
from ..db import get_db
from ..models import User
from ..schemas import (
    ChangePasswordRequest,
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserOut,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _user_by_username(db: Session, username: str) -> User | None:
    return db.execute(
        select(User).where(func.lower(User.username) == username.lower())
    ).scalar_one_or_none()


def _user_by_email(db: Session, email: str) -> User | None:
    return db.execute(
        select(User).where(func.lower(User.email) == email.lower())
    ).scalar_one_or_none()


@router.post("/register", response_model=TokenResponse, status_code=201)
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    if req.password != req.password_confirm:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "passwords do not match")

    username = req.username.strip()
    email = req.email.lower()

    if _user_by_username(db, username) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "username already taken")
    if _user_by_email(db, email) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "email already registered")

    user = User(
        id=new_user_id(),
        username=username,
        email=email,
        password_hash=hash_password(req.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return TokenResponse(token=create_token(user.id), user=UserOut.model_validate(user))


@router.post("/login", response_model=TokenResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    ident = req.identifier.strip()
    user = _user_by_email(db, ident) if "@" in ident else _user_by_username(db, ident)
    if user is None or not verify_password(req.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid credentials")
    return TokenResponse(token=create_token(user.id), user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.patch("/password", status_code=204)
def change_password(
    req: ChangePasswordRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(req.current_password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "current password is incorrect")
    if req.new_password != req.new_password_confirm:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "new passwords do not match")
    if verify_password(req.new_password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "new password must differ from current")
    user.password_hash = hash_password(req.new_password)
    db.commit()
    return None
