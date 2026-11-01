"""FastAPI routers package."""

from app.routers import auth, documents, health, patients, registrations

__all__ = ["auth", "documents", "health", "patients", "registrations"]
