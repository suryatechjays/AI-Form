"""Pydantic schemas for the AEGIS backend."""

from app.schemas.auth import (
    LoginRequest,
    MessageResponse,
    PasswordResetConfirmRequest,
    PasswordResetRequest,
    RegisterPatientRequest,
    TokenResponse,
    UserMeResponse,
)
from app.schemas.document import (
    AIExtractionResponse,
    DocumentListResponse,
    DocumentResponse,
    DocumentUploadResponse,
    ExtractedClinicalFields,
)
from app.schemas.duplicate import (
    DuplicateCheckResponse,
    DuplicateLinkRequest,
    DuplicateMatch,
    DuplicateOverrideRequest,
)
from app.schemas.error import InvalidParam, ProblemDetails
from app.schemas.health import AppInfo, DatabaseHealth, HealthResponse
from app.schemas.patient import (
    PatientCreate,
    PatientListResponse,
    PatientResponse,
    PatientUpdate,
)
from app.schemas.registration import (
    RegistrationDraftCreate,
    RegistrationListResponse,
    RegistrationResponse,
    RegistrationReviewRequest,
    RegistrationUpdate,
)

__all__ = [
    "LoginRequest",
    "TokenResponse",
    "UserMeResponse",
    "PasswordResetRequest",
    "PasswordResetConfirmRequest",
    "RegisterPatientRequest",
    "MessageResponse",
    "ProblemDetails",
    "InvalidParam",
    "AppInfo",
    "DatabaseHealth",
    "HealthResponse",
    "PatientCreate",
    "PatientUpdate",
    "PatientResponse",
    "PatientListResponse",
    "RegistrationDraftCreate",
    "RegistrationUpdate",
    "RegistrationReviewRequest",
    "RegistrationResponse",
    "RegistrationListResponse",
    "DuplicateMatch",
    "DuplicateCheckResponse",
    "DuplicateOverrideRequest",
    "DuplicateLinkRequest",
    "DocumentUploadResponse",
    "DocumentResponse",
    "DocumentListResponse",
    "ExtractedClinicalFields",
    "AIExtractionResponse",
]
