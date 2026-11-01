"""Custom domain exceptions and RFC 7807 Problem Details serialization for AEGIS."""

from typing import Any, Dict, List, Optional
from fastapi import HTTPException, status


class AEGISException(Exception):
    """Base exception for all AEGIS domain-specific errors."""

    def __init__(
        self,
        status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR,
        title: str = "Internal Server Error",
        detail: str = "An unexpected error occurred processing the request.",
        code: str = "INTERNAL_SERVER_ERROR",
        invalid_params: Optional[List[Dict[str, str]]] = None,
    ):
        super().__init__(detail)
        self.status_code = status_code
        self.title = title
        self.detail = detail
        self.code = code
        self.invalid_params = invalid_params or []


class InvalidCredentialsException(AEGISException):
    """Raised when authentication credentials fail validation."""

    def __init__(self, detail: str = "Invalid username or password."):
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            title="Invalid Credentials",
            detail=detail,
            code="INVALID_CREDENTIALS",
        )


class AccountDeactivatedException(AEGISException):
    """Raised when an inactive or soft-deactivated account attempts authentication."""

    def __init__(
        self, detail: str = "Account deactivated. Please contact clinical administration."
    ):
        super().__init__(
            status_code=status.HTTP_403_FORBIDDEN,
            title="Account Deactivated",
            detail=detail,
            code="ACCOUNT_DEACTIVATED",
        )


class TokenRevokedOrExpiredException(AEGISException):
    """Raised when an expired or revoked refresh token is presented."""

    def __init__(self, detail: str = "Your session has expired. Please log in again."):
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            title="Token Expired or Revoked",
            detail=detail,
            code="TOKEN_REVOKED_OR_EXPIRED",
        )


class TokenTheftException(AEGISException):
    """Raised when a previously revoked token is reused (token replay / theft detected)."""

    def __init__(
        self,
        detail: str = "Security alert: Refresh token reuse detected. All active sessions have been terminated.",
    ):
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            title="Security Alert: Token Reused",
            detail=detail,
            code="TOKEN_REUSED_ALERT",
        )


class CSRFValidationException(AEGISException):
    """Raised when anti-CSRF headers are missing or invalid on state-modifying requests."""

    def __init__(self, detail: str = "Cross-Site Request Forgery validation failed."):
        super().__init__(
            status_code=status.HTTP_403_FORBIDDEN,
            title="CSRF Validation Failed",
            detail=detail,
            code="CSRF_VALIDATION_FAILED",
        )


class PermissionDeniedException(AEGISException):
    """Raised when a user lacks the required RBAC role or permission scope."""

    def __init__(
        self,
        detail: str = "You do not possess the required operational scope for this action.",
        code: str = "SCOPE_PERMISSION_DENIED",
    ):
        super().__init__(
            status_code=status.HTTP_403_FORBIDDEN,
            title="Permission Denied",
            detail=detail,
            code=code,
        )


class InvalidTokenException(AEGISException):
    """Raised when an access token is malformed, has invalid signature, or missing claims."""

    def __init__(self, detail: str = "Could not validate authentication credentials."):
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            title="Invalid Authentication Token",
            detail=detail,
            code="INVALID_TOKEN",
        )


class UserAlreadyExistsException(AEGISException):
    """Raised when attempting to create a user account with duplicate username or email."""

    def __init__(self, detail: str = "An account with this username or email already exists."):
        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            title="User Already Exists",
            detail=detail,
            code="USER_ALREADY_EXISTS",
        )


class SelfModificationException(AEGISException):
    """Raised when an administrative user attempts an illegal self-deactivation or self-demotion."""

    def __init__(self, detail: str = "Super Users cannot deactivate or demote their own accounts."):
        super().__init__(
            status_code=status.HTTP_400_BAD_REQUEST,
            title="Self Modification Prohibited",
            detail=detail,
            code="SELF_DEACTIVATION_PROHIBITED",
        )


class InvalidPasswordException(AEGISException):
    """Raised when a submitted password does not meet complexity requirements."""

    def __init__(
        self,
        detail: str = "Password must be at least 8 characters long and contain uppercase, lowercase, number, and special character.",
        invalid_params: Optional[List[Dict[str, str]]] = None,
    ):
        super().__init__(
            status_code=422,
            title="Invalid Password Complexity",
            detail=detail,
            code="INVALID_PASSWORD",
            invalid_params=invalid_params or [{"name": "password", "reason": detail}],
        )


class PatientNotFoundException(AEGISException):
    """Raised when a requested patient record does not exist or is inactive."""

    def __init__(self, detail: str = "The requested patient master record was not found."):
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            title="Patient Not Found",
            detail=detail,
            code="PATIENT_NOT_FOUND",
        )


class RegistrationNotFoundException(AEGISException):
    """Raised when a requested registration dossier does not exist."""

    def __init__(self, detail: str = "The requested registration encounter was not found."):
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            title="Registration Not Found",
            detail=detail,
            code="REGISTRATION_NOT_FOUND",
        )


class DuplicatePatientException(AEGISException):
    """Raised when duplicate patient demographics match an existing record."""

    def __init__(
        self,
        detail: str = "Potential duplicate patient detected with matching demographic identifiers.",
        invalid_params: Optional[List[Dict[str, str]]] = None,
    ):
        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            title="Duplicate Patient Detected",
            detail=detail,
            code="DUPLICATE_PATIENT_DETECTED",
            invalid_params=invalid_params,
        )


class IllegalStateTransitionException(AEGISException):
    """Raised when an illegal lifecycle status transition or regression is attempted."""

    def __init__(self, detail: str = "Illegal registration lifecycle state transition attempted."):
        super().__init__(
            status_code=status.HTTP_400_BAD_REQUEST,
            title="Illegal State Transition",
            detail=detail,
            code="ILLEGAL_STATE_TRANSITION",
        )


class RejectionReasonMandatoryException(AEGISException):
    """Raised when a registration is rejected without a mandatory administrative justification."""

    def __init__(
        self,
        detail: str = "A concise administrative rejection reason (max 255 chars) is mandatory.",
    ):
        super().__init__(
            status_code=422,
            title="Rejection Reason Mandatory",
            detail=detail,
            code="REJECTION_REASON_MANDATORY",
        )


class IdempotencyConflictException(AEGISException):
    """Raised when an idempotency key collision occurs across different actors or payloads."""

    def __init__(
        self,
        detail: str = "Idempotency key collision detected. The provided key was used by a different caller.",
    ):
        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            title="Idempotency Key Collision",
            detail=detail,
            code="IDEMPOTENCY_KEY_COLLISION",
        )


class ClinicalValidationException(AEGISException):
    """Raised when clinical intake rules or demographic age constraints are violated."""

    def __init__(
        self,
        detail: str = "Clinical intake validation failed.",
        invalid_params: Optional[List[Dict[str, str]]] = None,
    ):
        super().__init__(
            status_code=422,
            title="Clinical Validation Failed",
            detail=detail,
            code="CLINICAL_VALIDATION_FAILED",
            invalid_params=invalid_params,
        )


class JustificationRequiredException(AEGISException):
    """Raised when an administrative or clinical override is attempted without justification."""

    def __init__(
        self,
        detail: str = "A concise administrative justification is mandatory to execute this override.",
    ):
        super().__init__(
            status_code=status.HTTP_400_BAD_REQUEST,
            title="Justification Required",
            detail=detail,
            code="JUSTIFICATION_REQUIRED",
        )


class UnsupportedMediaTypeException(AEGISException):
    """Raised when an uploaded file fails MIME type or magic byte validation."""

    def __init__(
        self,
        detail: str = "Invalid file type. Only PDF, PNG, and JPG/JPEG files with authentic magic bytes are permitted.",
        code: str = "INVALID_FILE_SIGNATURE",
    ):
        super().__init__(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            title="Unsupported Media Type",
            detail=detail,
            code=code,
        )


class PayloadTooLargeException(AEGISException):
    """Raised when an uploaded file exceeds the 10 MB limit."""

    def __init__(
        self,
        detail: str = "File size exceeds the allowable limit of 10 MB (10,485,760 bytes).",
    ):
        super().__init__(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            title="Payload Too Large",
            detail=detail,
            code="FILE_SIZE_LIMIT_EXCEEDED",
        )


class DocumentNotFoundException(AEGISException):
    """Raised when an uploaded document record is not found."""

    def __init__(self, detail: str = "The requested medical document was not found."):
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            title="Document Not Found",
            detail=detail,
            code="DOCUMENT_NOT_FOUND",
        )


class GroqConfigurationException(AEGISException):
    """Raised when Groq AI extraction is requested but Groq API key is unconfigured."""

    def __init__(
        self,
        detail: str = "Groq Cloud API is not configured on this server. GROQ_API_KEY environment variable is missing.",
    ):
        super().__init__(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            title="Groq AI Service Unavailable",
            detail=detail,
            code="GROQ_NOT_CONFIGURED",
        )


class DocumentExtractionException(AEGISException):
    """Raised when vector PDF text extraction or optical OCR fails or document is corrupted."""

    def __init__(
        self,
        detail: str = "Failed to extract text from document. File may be malformed or password-protected.",
        code: str = "EXTRACTION_FAILED",
    ):
        super().__init__(
            status_code=422,
            title="Document Extraction Failed",
            detail=detail,
            code=code,
        )


class PDFNotFoundException(AEGISException):
    """Raised when a compiled registration PDF dossier does not exist on disk or has not been generated."""

    def __init__(self, detail: str = "Authoritative PDF dossier for this registration has not been generated yet or was not found."):
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            title="PDF Not Found",
            detail=detail,
            code="PDF_NOT_FOUND",
        )


class PDFGenerationInProgressException(AEGISException):
    """Raised when PDF compilation is already in progress and duplicate regeneration is requested."""

    def __init__(self, detail: str = "PDF compilation is currently pending or in progress for this registration encounter."):
        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            title="PDF Generation in Progress",
            detail=detail,
            code="PDF_GENERATION_IN_PROGRESS",
        )


class UserNotFoundException(AEGISException):
    """Raised when a requested user account does not exist in SQLite."""

    def __init__(self, detail: str = "The requested user account was not found."):
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            title="User Not Found",
            detail=detail,
            code="USER_NOT_FOUND",
        )

