"""Authentication and authorization dependencies for FastAPI endpoints."""

from typing import Callable, List, Optional
import uuid

from fastapi import Depends, Header, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.exceptions import (
    AccountDeactivatedException,
    CSRFValidationException,
    InvalidTokenException,
    PermissionDeniedException,
)
from app.core.security import decode_access_token
from app.database import get_db
from app.models.user import User
from app.services.permission_service import check_assistant_admin_scope

settings = get_settings()
bearer_scheme = HTTPBearer(auto_error=False)


def get_correlation_id(request: Request) -> str:
    """Retrieve or generate X-Correlation-ID for the request context."""
    cid = request.headers.get("X-Correlation-ID")
    if not cid:
        cid = str(uuid.uuid4())
    request.state.correlation_id = cid
    return cid


async def get_current_user(
    request: Request,
    auth: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Authenticate bearer JWT token, verify integrity, and query live user active status."""
    if not auth or not auth.credentials:
        raise InvalidTokenException("Authorization credentials missing.")

    payload = decode_access_token(auth.credentials)
    user_id = int(payload["sub"])

    # Query live User from database (do NOT trust role or active status from stale JWT claims alone)
    stmt = select(User).where(User.id == user_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        raise InvalidTokenException("User account associated with token does not exist.")

    if user.is_active != 1:
        raise AccountDeactivatedException()

    # Bind user to request state
    request.state.current_user = user
    return user


def require_role(*allowed_roles: str) -> Callable:
    """Dependency factory enforcing that the authenticated user possesses one of the allowed roles."""

    async def role_checker(
        current_user: User = Depends(get_current_user),
    ) -> User:
        if current_user.role not in allowed_roles:
            raise PermissionDeniedException(
                detail=f"Access restricted. Requires one of roles: {', '.join(allowed_roles)}.",
                code="INSUFFICIENT_PERMISSIONS",
            )
        return current_user

    return role_checker


def require_scope(required_scope: str) -> Callable:
    """Dependency factory enforcing dynamic live-database scope verification.
    
    Rules (BMD-AEGIS-2026 v1.3 Section 3.3 & 5.4):
    - Super User: Automatically permitted for all scopes.
    - Assistant Administrator: Queries user_permissions on EVERY request. Denied by default if not granted.
    - Receptionist: Checked against baseline clinical triage scopes.
    - Patient: Denied administrative scopes.
    """

    async def scope_checker(
        current_user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> User:
        # 1. Super User possesses all operational scopes
        if current_user.role == "ROLE_SUPER_USER":
            return current_user

        # 2. Assistant Administrator must be verified dynamically against live DB
        if current_user.role == "ROLE_ASSISTANT_ADMIN":
            has_scope = await check_assistant_admin_scope(db, current_user.id, required_scope)
            if not has_scope:
                raise PermissionDeniedException(
                    detail=f"Assistant Administrator lacks required permission scope '{required_scope}'.",
                    code="SCOPE_PERMISSION_DENIED",
                )
            return current_user

        # 3. Receptionist default triage scopes
        if current_user.role == "ROLE_RECEPTIONIST":
            receptionist_scopes = {
                "records:view_all",
                "registrations:create_desk",
                "registrations:edit",
                "duplicates:resolve",
                "documents:upload_all",
                "documents:ocr_extract",
                "pdf:download_all",
                "pdf:regenerate",
                "voice:access",
            }
            if required_scope in receptionist_scopes:
                return current_user
            raise PermissionDeniedException(
                detail=f"Role '{current_user.role}' lacks permission scope '{required_scope}'.",
                code="SCOPE_PERMISSION_DENIED",
            )

        # 4. Patient default scopes
        if current_user.role == "ROLE_PATIENT":
            patient_scopes = {"voice:access"}
            if required_scope in patient_scopes:
                return current_user
            raise PermissionDeniedException(
                detail=f"Patient accounts cannot access administrative scope '{required_scope}'.",
                code="SCOPE_PERMISSION_DENIED",
            )

        raise PermissionDeniedException(code="INSUFFICIENT_PERMISSIONS")

    return scope_checker


def verify_csrf_refresh(
    request: Request,
    x_requested_with: Optional[str] = Header(None, alias="X-Requested-With"),
    x_csrf_token: Optional[str] = Header(None, alias="X-CSRF-Token"),
) -> None:
    """CSRF Defense: Validates custom header and unpredictable CSRF token on refresh requests (DEC-09)."""
    if not x_requested_with or x_requested_with != settings.CSRF_HEADER_EXPECTED_VALUE:
        raise CSRFValidationException(
            detail="Missing or invalid 'X-Requested-With' anti-CSRF request header."
        )
    if not x_csrf_token or len(x_csrf_token.strip()) < 16:
        raise CSRFValidationException(
            detail="Missing or invalid 'X-CSRF-Token' anti-CSRF request header."
        )

