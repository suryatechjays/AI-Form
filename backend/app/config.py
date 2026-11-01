"""Application configuration management for AEGIS backend."""

from functools import lru_cache
from pathlib import Path
from typing import List, Optional

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Base directory for backend (backend/)
BACKEND_DIR = Path(__file__).resolve().parent.parent
DEFAULT_DATA_DIR = BACKEND_DIR / "data"
DEFAULT_DB_PATH = DEFAULT_DATA_DIR / "patient_registration.db"


class Settings(BaseSettings):
    """Application settings with environment variable loading."""

    # Application Information
    PROJECT_NAME: str = "AEGIS - AI-Powered Smart Patient Registration System"
    VERSION: str = "1.0.0"
    API_V1_PREFIX: str = "/api/v1"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True

    # Server Configuration
    UVICORN_HOST: str = "127.0.0.1"
    UVICORN_PORT: int = 8000
    UVICORN_WORKERS: int = 1  # Single-worker baseline as approved in BMD-AEGIS-2026 v1.3

    # Database Configuration (SQLite + aiosqlite)
    # Uses forward slashes for SQLite URI path compatibility across OS platforms
    DATABASE_URL: str = Field(
        default_factory=lambda: f"sqlite+aiosqlite:///{DEFAULT_DB_PATH.as_posix()}"
    )
    DB_POOL_SIZE: int = 5          # Conservative pool size to limit SQLite lock contention
    DB_MAX_OVERFLOW: int = 0       # Zero overflow to prevent writer contention
    DB_POOL_TIMEOUT: float = 30.0  # Application connection checkout timeout in seconds
    DB_BUSY_TIMEOUT: int = 5000    # SQLite internal lock wait ceiling in milliseconds

    # Authentication & JWT Security Settings (BMD-AEGIS-2026 v1.3 Section 5 & DEC-02, DEC-03, DEC-09)
    # High-entropy 256-bit secret key baseline (must be supplied via environment or backend/.env)
    SECRET_KEY: str = Field(
        default="",
        description="High-entropy 256-bit secret key baseline for JWT cryptographic signatures",
    )
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15   # 15-minute access token lifespan
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7      # 7-day sliding refresh token lifespan
    PASSWORD_RESET_TOKEN_EXPIRE_MINUTES: int = 15  # Single-use 15-minute reset token

    # Refresh Cookie Governance
    REFRESH_COOKIE_NAME: str = "aegis_refresh_token"
    REFRESH_COOKIE_PATH: str = "/api/v1/auth/refresh"
    REFRESH_COOKIE_SECURE: bool = False     # True in production HTTPS, False for localhost dev
    REFRESH_COOKIE_SAMESITE: str = "strict" # SameSite=Strict CSRF defense
    CSRF_HEADER_NAME: str = "X-Requested-With"
    CSRF_HEADER_EXPECTED_VALUE: str = "XMLHttpRequest"
    CSRF_TOKEN_HEADER_NAME: str = "X-CSRF-Token"

    # Storage Directories
    DATA_DIR: Path = DEFAULT_DATA_DIR
    UPLOAD_DIR: Path = DEFAULT_DATA_DIR / "uploads"
    PDF_DIR: Path = DEFAULT_DATA_DIR / "generated_pdfs"

    # Document Upload & Storage Governance (BMD-AEGIS-2026 v1.3 Section 3.5 & 7.1)
    MAX_FILE_SIZE: int = 10 * 1024 * 1024  # 10 MB per individual file upload
    ALLOWED_MIME_TYPES: List[str] = ["application/pdf", "image/jpeg", "image/png"]
    ALLOWED_EXTENSIONS: List[str] = [".pdf", ".jpg", ".jpeg", ".png"]

    # Groq AI Engine Configuration (BMD-AEGIS-2026 v1.3 Section 3.8 & 7.3)
    GROQ_API_KEY: Optional[str] = None
    GROQ_MODEL: str = "openai/gpt-oss-20b"
    TESSERACT_CMD: Optional[str] = None

    # CORS Configuration
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @model_validator(mode="after")
    def validate_security_configuration(self) -> "Settings":
        """Enforce strict cryptographic and environment security invariants."""
        # 1. Enforce strong, explicit SECRET_KEY
        key = (self.SECRET_KEY or "").strip()
        if not key:
            raise ValueError(
                "CRITICAL SECURITY CONFIGURATION ERROR: SECRET_KEY is missing. "
                "A cryptographically secure key of at least 32 characters (256-bit) must be provided "
                "via the SECRET_KEY environment variable or backend/.env file."
            )
        if len(key) < 32:
            raise ValueError(
                "CRITICAL SECURITY CONFIGURATION ERROR: SECRET_KEY is too short (minimum 32 characters required). "
                "Provide a high-entropy 256-bit key in SECRET_KEY."
            )
        insecure_keys = {
            "aegis_super_secret_jwt_signing_key_2026_at_least_32_bytes_long_for_security_compliance",
            "replace_with_your_secure_256_bit_secret_key_here",
            "your-secret-key-at-least-32-chars-long",
        }
        if key.lower() in insecure_keys:
            raise ValueError(
                "CRITICAL SECURITY CONFIGURATION ERROR: Insecure or default placeholder SECRET_KEY detected. "
                "Generate and configure a unique high-entropy 256-bit secret key."
            )

        # 2. Production Security Enforcement
        env = (self.ENVIRONMENT or "").strip().lower()
        if env in ("production", "prod"):
            # Enforce DEBUG=False and secure cookie flags in production
            self.DEBUG = False
            self.REFRESH_COOKIE_SECURE = True

        return self

    def setup_directories(self) -> None:
        """Ensure all required runtime directories exist."""
        self.DATA_DIR.mkdir(parents=True, exist_ok=True)
        self.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        self.PDF_DIR.mkdir(parents=True, exist_ok=True)


@lru_cache()
def get_settings() -> Settings:
    """Return cached singleton instance of application settings."""
    settings = Settings()
    settings.setup_directories()
    return settings
