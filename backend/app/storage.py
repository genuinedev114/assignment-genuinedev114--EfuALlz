"""Local file storage. Swap with an S3 client in production."""
from __future__ import annotations

import hashlib
import uuid
from pathlib import Path
from typing import BinaryIO

from .config import settings


def save_upload(file_obj: BinaryIO, original_name: str) -> tuple[str, str, int, str]:
    """Persist an uploaded file under a UUID-prefixed name.

    Returns (invoice_id, absolute_path, size_bytes, sha256_hex). The hash lets us
    detect duplicates: if a user uploads the same file twice we can short-circuit
    to the existing invoice instead of re-processing.
    """
    invoice_id = str(uuid.uuid4())
    suffix = Path(original_name).suffix.lower()
    dest = settings.upload_path / f"{invoice_id}{suffix}"

    hasher = hashlib.sha256()
    size = 0
    with dest.open("wb") as out:
        # copyfileobj streams in chunks so we don't load big PDFs into memory.
        while chunk := file_obj.read(64 * 1024):
            size += len(chunk)
            hasher.update(chunk)
            out.write(chunk)
    return invoice_id, str(dest), size, hasher.hexdigest()


def delete_file(path: str) -> None:
    p = Path(path)
    if p.exists():
        p.unlink()


def read_bytes(path: str) -> bytes:
    return Path(path).read_bytes()


__all__ = ["save_upload", "delete_file", "read_bytes"]
