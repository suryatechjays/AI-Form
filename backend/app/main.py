"""AEGIS FastAPI Application Entrypoint, Middleware, and RFC 7807 Exception Handlers."""

from contextlib import asynccontextmanager
import logging
import uuid
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.core.exceptions import AEGISException
from app.database import close_db, init_db_schema, init_db_wal
from app.routers import auth, documents, health, patients, registrations, users

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("aegis.main")

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan context manager: handles startup bootstrap and graceful teardown."""
    logger.info("Initializing AEGIS backend service (single-worker baseline)...")

    # Step 1: Ensure runtime directories are created
    settings.setup_directories()
    logger.info(
        "Runtime directories verified: data=%s, uploads=%s, pdfs=%s",
        settings.DATA_DIR,
        settings.UPLOAD_DIR,
        settings.PDF_DIR,
    )

    # Step 2: Initialize SQLite WAL mode deliberately once during startup
    wal_mode = await init_db_wal()
    logger.info("SQLite storage initialized with journal_mode=%s", wal_mode)

    # Step 3: Safe schema initialization for development/testing environment
    await init_db_schema()

    # Step 4: Startup lifespan sweep identifying interrupted PENDING jobs (BMD-AEGIS-2026 v1.3 Section 3.11 & 8.3)
    from app.database import engine
    from app.services.pdf_service import sweep_stale_pending_pdf_jobs
    await sweep_stale_pending_pdf_jobs(engine)

    yield

    # Teardown: Cleanly close and dispose of database pools
    logger.info("Shutting down AEGIS backend service...")
    await close_db()
    logger.info("AEGIS backend shutdown complete.")


# FastAPI Application Instance
app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Backend REST API for AI-Powered Smart Patient Registration System (AEGIS).",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# Cross-Origin Resource Sharing (CORS) Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Request Correlation ID Middleware (BMD-AEGIS-2026 v1.3 Section 1.2)
@app.middleware("http")
async def correlation_id_middleware(request: Request, call_next):
    """Injects or extracts X-Correlation-ID for unified end-to-end tracing."""
    cid = request.headers.get("X-Correlation-ID") or str(uuid.uuid4())
    request.state.correlation_id = cid
    response = await call_next(request)
    response.headers["X-Correlation-ID"] = cid
    return response


@app.middleware("http")
async def no_cache_api_middleware(request: Request, call_next):
    """Enforces no-cache headers on all API responses to prevent stale browser state."""
    response = await call_next(request)
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response


# --- RFC 7807 Problem Details Global Exception Handlers ---

@app.exception_handler(AEGISException)
async def aegis_exception_handler(request: Request, exc: AEGISException):
    """Handle custom AEGIS domain exceptions with RFC 7807 Problem Details envelope."""
    cid = getattr(request.state, "correlation_id", None) or request.headers.get("X-Correlation-ID")
    content = {
        "type": f"https://api.aegis.local/errors/{exc.code.lower().replace('_', '-')}",
        "title": exc.title,
        "status": exc.status_code,
        "detail": exc.detail,
        "instance": str(request.url.path),
        "code": exc.code,
        "correlation_id": cid,
        "invalid_params": exc.invalid_params if exc.invalid_params else None,
    }
    return JSONResponse(
        status_code=exc.status_code,
        content={k: v for k, v in content.items() if v is not None},
        headers={"Content-Type": "application/problem+json"},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Serialize Pydantic payload validation errors to RFC 7807 Problem Details."""
    cid = getattr(request.state, "correlation_id", None) or request.headers.get("X-Correlation-ID")
    invalid_params = [
        {
            "name": ".".join(str(loc) for loc in err["loc"] if loc != "body"),
            "reason": err["msg"],
        }
        for err in exc.errors()
    ]
    content = {
        "type": "https://api.aegis.local/errors/request-validation-failed",
        "title": "Unprocessable Entity",
        "status": status.HTTP_422_UNPROCESSABLE_ENTITY,
        "detail": "One or more request parameters failed validation constraints.",
        "instance": str(request.url.path),
        "code": "REQUEST_VALIDATION_FAILED",
        "correlation_id": cid,
        "invalid_params": invalid_params,
    }
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content=content,
        headers={"Content-Type": "application/problem+json"},
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Convert standard FastAPI HTTPExceptions into RFC 7807 Problem Details."""
    cid = getattr(request.state, "correlation_id", None) or request.headers.get("X-Correlation-ID")
    detail_str = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
    content = {
        "type": "about:blank",
        "title": detail_str,
        "status": exc.status_code,
        "detail": detail_str,
        "instance": str(request.url.path),
        "code": f"HTTP_{exc.status_code}",
        "correlation_id": cid,
    }
    return JSONResponse(
        status_code=exc.status_code,
        content=content,
        headers={"Content-Type": "application/problem+json"},
    )


# Mount Routers
app.include_router(health.router, prefix=settings.API_V1_PREFIX)
app.include_router(auth.router, prefix=settings.API_V1_PREFIX)
app.include_router(patients.router, prefix=settings.API_V1_PREFIX)
app.include_router(registrations.router, prefix=settings.API_V1_PREFIX)
app.include_router(documents.router, prefix=settings.API_V1_PREFIX)
app.include_router(users.router, prefix=settings.API_V1_PREFIX)


@app.get("/", include_in_schema=False)
async def root():
    """Root redirect / information endpoint."""
    return JSONResponse(
        content={
            "service": settings.PROJECT_NAME,
            "version": settings.VERSION,
            "status": "operational",
            "documentation": "/docs",
            "health": f"{settings.API_V1_PREFIX}/health",
            "auth": f"{settings.API_V1_PREFIX}/auth",
        }
    )
