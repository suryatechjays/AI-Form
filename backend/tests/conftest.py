"""Test configuration and fixtures for AEGIS backend tests."""

import os
import sys
from pathlib import Path
from typing import AsyncGenerator
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

# Ensure backend directory is in path
BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# Isolate test database from runtime database (fixes test pollution of runtime data)
TEST_DB_PATH = BACKEND_DIR / "data" / "patient_registration_test.db"
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{TEST_DB_PATH.as_posix()}"

from app.config import get_settings
from app.database import close_db, init_db_schema, init_db_wal
from app.main import app


@pytest_asyncio.fixture(autouse=True)
async def ensure_db_initialized():
    """Ensure runtime directories, SQLite WAL mode, and schema are initialized before tests."""
    settings = get_settings()
    settings.setup_directories()
    await init_db_wal()
    await init_db_schema()

    # Ensure patient test persona exists in the isolated test database for test assertions
    from app.database import engine
    from sqlalchemy import text
    async with engine.begin() as conn:
        demo_pw = "$argon2id$v=19$m=65536,t=3,p=4$zOSQdriEOR3p6h6/S0g2nA$szOz3SGTISzyK+cXWdOIfaNfwRm8TX0nLwvZupcqoes"
        await conn.execute(
            text(
                "INSERT OR IGNORE INTO users (username, email, hashed_password, role, is_active) "
                "VALUES ('patient', 'patient@aegishealth.org', :pw, 'ROLE_PATIENT', 1);"
            ),
            {"pw": demo_pw},
        )
    yield


@pytest_asyncio.fixture
async def async_client() -> AsyncGenerator[AsyncClient, None]:
    """Provide an asynchronous HTTP client for testing the FastAPI application."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client
