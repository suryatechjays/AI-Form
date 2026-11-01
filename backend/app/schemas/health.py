"""Health check response schemas."""

from pydantic import BaseModel, Field


class AppInfo(BaseModel):
    """Application metadata."""
    name: str = Field(..., description="Application name")
    version: str = Field(..., description="Application version")
    environment: str = Field(..., description="Deployment environment")


class DatabaseHealth(BaseModel):
    """Database connectivity and PRAGMA status."""
    status: str = Field(..., description="Database connection status ('connected' or 'degraded')")
    driver: str = Field(..., description="Database driver and protocol")
    journal_mode: str = Field(..., description="Active SQLite journal mode (e.g. 'wal')")
    foreign_keys: int = Field(..., description="Foreign key enforcement status (1=ON, 0=OFF)")
    busy_timeout: int = Field(..., description="Busy timeout in milliseconds")


class HealthResponse(BaseModel):
    """System health check response."""
    status: str = Field(..., description="Overall service status ('healthy' or 'unhealthy')")
    app: AppInfo = Field(..., description="Application details")
    database: DatabaseHealth = Field(..., description="Database health metrics")

