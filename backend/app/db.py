import logging
import os

from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import settings

logger = logging.getLogger(__name__)


class Base(DeclarativeBase):
    pass


# check_same_thread=False so the same connection can be used across worker tasks.
# We still serialize writes via short-lived sessions; SQLite is fine for a single-node demo.
connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=connect_args, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, future=True)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _sqlite_path() -> str | None:
    """Best-effort parse of `sqlite:///./invoices.db` to a filesystem path."""
    url = settings.database_url
    prefix = "sqlite:///"
    if not url.startswith(prefix):
        return None
    return url[len(prefix):]


def init_db() -> None:
    from . import models  # noqa: F401  (register models on Base)

    # The schema added a `users` table and a `user_id` FK on invoices. Old SQLite files
    # from the pre-auth version don't have these, so we wipe and recreate. SQLite-only —
    # for any other engine we let SQLAlchemy create missing tables and assume migrations
    # are handled out-of-band.
    if settings.database_url.startswith("sqlite"):
        path = _sqlite_path()
        if path and os.path.exists(path):
            inspector = inspect(engine)
            existing_tables = set(inspector.get_table_names())
            stale = False
            if "invoices" in existing_tables and "users" not in existing_tables:
                stale = True  # pre-auth schema
            elif "users" in existing_tables:
                cols = {c["name"] for c in inspector.get_columns("users")}
                if "username" not in cols:
                    stale = True  # pre-username schema
                elif "email_verified" in cols or "verification_codes" in existing_tables:
                    stale = True  # pre email-verification-removal schema
                elif "invoices" in existing_tables:
                    inv_cols = {c["name"] for c in inspector.get_columns("invoices")}
                    if "content_hash" not in inv_cols:
                        stale = True  # pre content-hash schema
            if stale:
                engine.dispose()
                logger.warning("removing legacy SQLite DB at %s (incompatible schema)", path)
                os.remove(path)
    Base.metadata.create_all(engine)
