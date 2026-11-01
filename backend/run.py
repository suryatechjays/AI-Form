"""Server runner script for AEGIS backend service.

Guarantees single Uvicorn worker process (workers=1) for deterministic in-process
background task execution and lifespan management.
"""

import sys
from pathlib import Path
import uvicorn

# Ensure the backend directory is in the Python search path
BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.config import get_settings

if __name__ == "__main__":
    settings = get_settings()

    print("=" * 70)
    print(f"Starting {settings.PROJECT_NAME}")
    print(f"Environment:  {settings.ENVIRONMENT}")
    print(f"Database URL: {settings.DATABASE_URL}")
    print(f"Listening on: http://{settings.UVICORN_HOST}:{settings.UVICORN_PORT}")
    print(f"Docs URL:     http://{settings.UVICORN_HOST}:{settings.UVICORN_PORT}/docs")
    print(f"Health Check: http://{settings.UVICORN_HOST}:{settings.UVICORN_PORT}{settings.API_V1_PREFIX}/health")
    print(f"Workers:      {settings.UVICORN_WORKERS} (Single-worker concurrency model)")
    print("=" * 70)

    uvicorn.run(
        "app.main:app",
        host=settings.UVICORN_HOST,
        port=settings.UVICORN_PORT,
        workers=settings.UVICORN_WORKERS,
        reload=False,  # Single-process deterministic run
        log_level="info",
    )

