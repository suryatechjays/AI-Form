"""Tests for AEGIS Backend Foundation: Health, PRAGMAs, and SQLite WAL Configuration."""

import pytest
from sqlalchemy import text
from app.config import get_settings
from app.database import get_db


@pytest.mark.asyncio
async def test_root_endpoint(async_client):
    """Verify root endpoint returns operational info."""
    response = await async_client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "operational"
    assert "AEGIS" in data["service"]
    assert data["documentation"] == "/docs"
    assert data["health"] == "/api/v1/health"


@pytest.mark.asyncio
async def test_health_endpoint_success(async_client):
    """Verify GET /api/v1/health returns HTTP 200 and correct database metrics."""
    response = await async_client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()

    # Overall Status
    assert data["status"] == "healthy"

    # App Info
    assert "AEGIS" in data["app"]["name"]
    assert data["app"]["version"] == "1.0.0"
    assert data["app"]["environment"] == "development"

    # Database Verification
    db_metrics = data["database"]
    assert db_metrics["status"] == "connected"
    assert db_metrics["driver"] == "sqlite+aiosqlite"
    assert db_metrics["journal_mode"] == "wal"
    assert db_metrics["foreign_keys"] == 1
    assert db_metrics["busy_timeout"] == 5000


@pytest.mark.asyncio
async def test_sqlite_connection_pragmas_direct():
    """Verify directly that every checked-out connection enforces the required PRAGMAs."""
    async for session in get_db():
        # Check foreign_keys = ON (1)
        fk_res = await session.execute(text("PRAGMA foreign_keys;"))
        assert fk_res.scalar() == 1

        # Check busy_timeout = 5000 ms
        timeout_res = await session.execute(text("PRAGMA busy_timeout;"))
        assert timeout_res.scalar() == 5000

        # Check synchronous = NORMAL (1 in SQLite)
        sync_res = await session.execute(text("PRAGMA synchronous;"))
        assert sync_res.scalar() == 1

        # Check journal_mode = WAL
        jm_res = await session.execute(text("PRAGMA journal_mode;"))
        assert str(jm_res.scalar()).lower() == "wal"
        break


def test_settings_single_worker_and_concurrency_guardrails():
    """Verify environment configuration conforms to BMD-AEGIS-2026 v1.3 architectural decisions."""
    settings = get_settings()

    # DEC-08: Single Uvicorn Worker topology
    assert settings.UVICORN_WORKERS == 1

    # DEC-07: Tailored SQLite connection pool to avoid lock contention
    assert settings.DB_POOL_SIZE == 5
    assert settings.DB_MAX_OVERFLOW == 0
    assert settings.DB_POOL_TIMEOUT == 30.0
    assert settings.DB_BUSY_TIMEOUT == 5000

    # Runtime directories exist
    assert settings.DATA_DIR.exists()
    assert settings.UPLOAD_DIR.exists()
    assert settings.PDF_DIR.exists()

