"""Authentication and authorization request/response schemas."""

from typing import List, Optional
from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    """User login request payload."""
    username_or_email: str = Field(..., min_length=1, max_length=255, description="Username or canonical RFC 5322 email address")
    password: str = Field(..., min_length=1, description="Plaintext password for verification")


class TokenResponse(BaseModel):
    """Successful authentication response with JWT access token."""
    access_token: str = Field(..., description="Signed short-lived JWT access token")
    token_type: str = Field(default="bearer", description="Token type specification")
    expires_in: int = Field(default=900, description="Access token lifespan in seconds (15 minutes)")
    user_id: int = Field(..., description="Internal surrogate ID of authenticated user")
    username: str = Field(..., description="User login handle")
    role: str = Field(..., description="Baseline RBAC role classification")
    csrf_token: Optional[str] = Field(default=None, description="Cryptographic Anti-CSRF token for refresh requests")


class UserMeResponse(BaseModel):
    """Profile details and live permissions of currently authenticated user."""
    id: int
    username: str
    email: str
    role: str
    is_active: bool
    created_at: str
    permissions: List[str] = Field(
        default_factory=list, description="Active permission scopes (live DB verified)"
    )


class PasswordResetRequest(BaseModel):
    """Request payload to initiate a password reset token."""
    email: str = Field(..., min_length=3, max_length=255, description="Registered canonical user email address")


class PasswordResetConfirmRequest(BaseModel):
    """Payload to confirm password reset using token and provide new password."""
    token: str = Field(..., description="Cryptographically signed single-use reset token")
    new_password: str = Field(..., min_length=8, max_length=128, description="New password adhering to complexity policy")


class RegisterPatientRequest(BaseModel):
    """Patient self-registration request creating user and clinical master profile."""
    username: str = Field(..., min_length=3, max_length=50, description="Unique login handle")
    email: str = Field(..., min_length=3, max_length=255, description="Canonical RFC 5322 email address")
    password: str = Field(..., min_length=8, max_length=128, description="Account password")
    full_name: str = Field(..., min_length=2, max_length=100, description="Patient legal full name")
    date_of_birth: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$", description="Birth date YYYY-MM-DD")
    gender: str = Field(..., description="Demographic gender identity")
    primary_mobile: str = Field(..., description="Primary mobile phone string (ITU-T E.164)")
    blood_group: Optional[str] = Field(default="Unknown", description="Clinical blood group")


class MessageResponse(BaseModel):
    """Generic status and confirmation message response."""
    message: str = Field(..., description="Human-readable operational status message")
    detail: Optional[str] = Field(default=None, description="Additional context or guidance")
