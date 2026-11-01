"""SQLAlchemy 2.0 Asynchronous Database Setup with SQLite WAL & PRAGMA Governance."""

from typing import AsyncGenerator, List, Tuple
import logging
from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import AsyncAdaptedQueuePool

from app.config import get_settings
from app.models.base import Base

logger = logging.getLogger("aegis.database")
settings = get_settings()

# Create asynchronous engine with conservative queue pooling tailored for SQLite single-writer WAL behavior
engine: AsyncEngine = create_async_engine(
    settings.DATABASE_URL,
    poolclass=AsyncAdaptedQueuePool,
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
    pool_timeout=settings.DB_POOL_TIMEOUT,
    connect_args={"timeout": settings.DB_BUSY_TIMEOUT / 1000.0},
    echo=settings.DEBUG and False,  # Set True if detailed SQL logging is desired
)


# Connection-Level PRAGMA Listener enforced on every checked out SQLite connection
@event.listens_for(engine.sync_engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    """Enforce connection-level SQLite PRAGMAs: busy_timeout, foreign_keys, and synchronous."""
    cursor = dbapi_connection.cursor()
    cursor.execute(f"PRAGMA busy_timeout = {settings.DB_BUSY_TIMEOUT};")  # Lock wait ceiling (5s)
    cursor.execute("PRAGMA foreign_keys = ON;")                          # Mandatory foreign key enforcement
    cursor.execute("PRAGMA synchronous = NORMAL;")                       # Optimal durability/performance for WAL
    cursor.close()


# Native SQLite Triggers for Append-Only Audit Trail (DB-AEGIS-2026 v1.2 Section 9.3)
AUDIT_NO_UPDATE_TRIGGER = """
CREATE TRIGGER IF NOT EXISTS trg_audit_events_no_update
BEFORE UPDATE ON audit_events
BEGIN
    SELECT RAISE(ABORT, 'SECURITY VIOLATION: Existing audit events are append-only and cannot be modified.');
END;
"""

AUDIT_NO_DELETE_TRIGGER = """
CREATE TRIGGER IF NOT EXISTS trg_audit_events_no_delete
BEFORE DELETE ON audit_events
BEGIN
    SELECT RAISE(ABORT, 'SECURITY VIOLATION: Audit events cannot be deleted under regulatory compliance retention rules.');
END;
"""

# The 15 verified permission scopes catalog (DB-AEGIS-2026 v1.2 Section 6.4)
SCOPES_CATALOG: List[Tuple[str, str, str]] = [
    ("records:view_all", "Records", "View all patient records across admissions roster"),
    ("registrations:create_desk", "Registrations", "Create new registrations on behalf of walk-in patients"),
    ("registrations:edit", "Registrations", "Edit uncommitted registration intake details"),
    ("registrations:submit", "Registrations", "Authorize status transition from Draft/Pending to Submitted"),
    ("registrations:reject", "Registrations", "Reject registrations with mandatory documented justification"),
    ("duplicates:resolve", "Duplicates", "Access duplicate resolution drawer and execute Link/Override"),
    ("documents:upload_all", "Documents", "Upload medical documents on behalf of other patients"),
    ("documents:ocr_extract", "Documents", "Trigger PyMuPDF / Tesseract OCR and Groq AI extractions"),
    ("pdf:download_all", "PDF", "Download generated PDF dossiers for any patient"),
    ("pdf:regenerate", "PDF", "Trigger re-compilation of finalized WeasyPrint PDFs"),
    ("accounts:patient_manage", "Accounts", "Manage patient accounts (profile edits, resets)"),
    ("accounts:receptionist_manage", "Accounts", "Create, update, or deactivate Receptionist accounts"),
    ("accounts:deactivate", "Accounts", "Execute soft deactivation of patient or receptionist accounts"),
    ("audit:view_logs", "Audit", "Access and inspect system activity and audit logs"),
    ("voice:access", "Voice", "Enable voice STT dictation and TTS read-aloud controls"),
]


async def init_db_wal() -> str:
    """Initialize SQLite WAL mode deliberately once during startup / database bootstrap.
    
    Returns the active journal_mode string reported by the database.
    """
    async with engine.connect() as conn:
        # Deliberate WAL mode configuration
        await conn.execute(text("PRAGMA journal_mode = WAL;"))
        await conn.commit()
        
        # Verify active journal mode
        result = await conn.execute(text("PRAGMA journal_mode;"))
        active_journal_mode = result.scalar()
        logger.info("SQLite journal_mode initialized to: %s", active_journal_mode)
        return str(active_journal_mode)


async def init_db_schema() -> None:
    """Safely initialize database tables, append-only triggers, and catalog scopes."""
    # Ensure all models are imported so their metadata is attached to Base
    import app.models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(text(AUDIT_NO_UPDATE_TRIGGER))
        await conn.execute(text(AUDIT_NO_DELETE_TRIGGER))

        # Seed standard 15 permission scopes if missing
        for scope_name, category, desc in SCOPES_CATALOG:
            await conn.execute(
                text(
                    "INSERT OR IGNORE INTO permission_scopes (scope_name, category, description) "
                    "VALUES (:name, :cat, :desc);"
                ),
                {"name": scope_name, "cat": category, "desc": desc},
            )

        # Seed baseline demonstration accounts if missing (Pass123!)
        demo_pw = "$argon2id$v=19$m=65536,t=3,p=4$zOSQdriEOR3p6h6/S0g2nA$szOz3SGTISzyK+cXWdOIfaNfwRm8TX0nLwvZupcqoes"
        demo_users = [
            ("admin", "admin@aegishealth.org", demo_pw, "ROLE_SUPER_USER"),
            ("receptionist", "receptionist@aegishealth.org", demo_pw, "ROLE_RECEPTIONIST"),
            ("receptionist_admit", "admissions.reception@aegishealth.org", demo_pw, "ROLE_RECEPTIONIST"),
        ]
        for uname, uemail, upw, urole in demo_users:
            await conn.execute(
                text(
                    "INSERT OR IGNORE INTO users (username, email, hashed_password, role, is_active) "
                    "VALUES (:uname, :uemail, :upw, :urole, 1);"
                ),
                {"uname": uname, "uemail": uemail, "upw": upw, "urole": urole},
            )
    logger.info("Database schema across 8 approved tables, audit triggers, and scopes catalog initialized successfully.")


async def check_db_health() -> dict:
    """Verify live connectivity and query SQLite PRAGMA status."""
    async with engine.connect() as conn:
        select_result = await conn.execute(text("SELECT 1;"))
        select_val = select_result.scalar()

        journal_result = await conn.execute(text("PRAGMA journal_mode;"))
        journal_mode = journal_result.scalar()

        fk_result = await conn.execute(text("PRAGMA foreign_keys;"))
        foreign_keys = fk_result.scalar()

        timeout_result = await conn.execute(text("PRAGMA busy_timeout;"))
        busy_timeout = timeout_result.scalar()

        return {
            "status": "connected" if select_val == 1 else "degraded",
            "driver": "sqlite+aiosqlite",
            "journal_mode": str(journal_mode).lower(),
            "foreign_keys": int(foreign_keys) if foreign_keys is not None else 0,
            "busy_timeout": int(busy_timeout) if busy_timeout is not None else 0,
        }


# Scoped Async Sessionmaker
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency yielding an asynchronous database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def close_db() -> None:
    """Cleanly dispose of database connection pools on shutdown."""
    await engine.dispose()
    logger.info("Database connection pool disposed.")
