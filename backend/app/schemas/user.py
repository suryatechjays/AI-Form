"""Schemas for user account management, administrative provisioning, and anti-escalation governance."""

from typing import List, Optional
from pydantic import BaseModel, Field


class UserCreateRequest(BaseModel):
    """Payload to administratively provision a new user account."""
    username: str = Field(..., min_length=3, max_length=50, description="Unique account login handle")
    email: str = Field(..., min_length=3, max_length=255, description="Canonical contact email address")
    role: str = Field(..., description="Assigned RBAC role (ROLE_RECEPTIONIST, ROLE_ASSISTANT_ADMIN, ROLE_PATIENT, ROLE_SUPER_USER)")
    password: Optional[str] = Field(default=None, description="Initial account password")
    is_active: int = Field(default=1, ge=0, le=1, description="Account active status (1=active, 0=deactivated)")
    permissions: Optional[List[str]] = Field(default=None, description="Optional catalog permission scopes to grant (for Assistant Admin)")


class UserUpdateRequest(BaseModel):
    """Payload to update an existing user account."""
    email: Optional[str] = Field(default=None, min_length=3, max_length=255)
    role: Optional[str] = None
    is_active: Optional[int] = Field(default=None, ge=0, le=1)
    permissions: Optional[List[str]] = None


class UserResponse(BaseModel):
    """Public representation of a user account (never exposes password hashes)."""
    id: int
    username: str
    email: str
    role: str
    is_active: int
    created_at: str
    updated_at: str
    last_login_at: Optional[str] = None
    permissions: List[str] = Field(default_factory=list, description="Effective active permission scopes")
    full_name: Optional[str] = None

    model_config = {"from_attributes": True}


class UserListResponse(BaseModel):
    """Collection of user accounts with pagination metadata."""
    items: List[UserResponse]
    total: int
    page: int = 1
    limit: int = 20
    total_pages: int = 1
