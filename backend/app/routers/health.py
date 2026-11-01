"""Health check router for verifying application and database readiness."""

import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.schemas.health import AppInfo, DatabaseHealth, HealthResponse

logger = logging.getLogger("aegis.health")
router = APIRouter(tags=["Health"])


@router.get(
    "/health",
    response_model=HealthResponse,
    status_code=status.HTTP_200_OK,
    summary="Service Health & Database Connectivity Check",
    description=(
        "Returns application operational state, asynchronous SQLite connectivity, "
        "and connection PRAGMA governance metrics (WAL mode, foreign keys, busy timeout)."
    ),
)
async def check_health(db: AsyncSession = Depends(get_db)) -> HealthResponse:
    """Execute live database query and PRAGMA status inspection."""
    settings = get_settings()

    try:
        # Perform live database probe
        select_result = await db.execute(text("SELECT 1;"))
        select_val = select_result.scalar()

        journal_result = await db.execute(text("PRAGMA journal_mode;"))
        journal_mode = journal_result.scalar()

        fk_result = await db.execute(text("PRAGMA foreign_keys;"))
        foreign_keys = fk_result.scalar()

        timeout_result = await db.execute(text("PRAGMA busy_timeout;"))
        busy_timeout = timeout_result.scalar()

        db_connected = select_val == 1
        db_status = "connected" if db_connected else "degraded"
        overall_status = "healthy" if db_connected else "unhealthy"

        return HealthResponse(
            status=overall_status,
            app=AppInfo(
                name=settings.PROJECT_NAME,
                version=settings.VERSION,
                environment=settings.ENVIRONMENT,
            ),
            database=DatabaseHealth(
                status=db_status,
                driver="sqlite+aiosqlite",
                journal_mode=str(journal_mode).lower(),
                foreign_keys=int(foreign_keys) if foreign_keys is not None else 0,
                busy_timeout=int(busy_timeout) if busy_timeout is not None else 0,
            ),
        )
    except Exception as exc:
        logger.error("Health check failed on database inspection: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Database connectivity check failed: {str(exc)}",
        )

