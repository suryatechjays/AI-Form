"""Permission and dynamic RBAC service verifying scopes against live database."""

from typing import List, Optional
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import PermissionDeniedException, SelfModificationException
from app.models.permission import PermissionScope, UserPermission
from app.models.user import User

ALL_SCOPES = [
    "records:view_all",
    "registrations:create_desk",
    "registrations:edit",
    "registrations:submit",
    "registrations:reject",
    "duplicates:resolve",
    "documents:upload_all",
    "documents:ocr_extract",
    "pdf:download_all",
    "pdf:regenerate",
    "accounts:patient_manage",
    "accounts:receptionist_manage",
    "accounts:deactivate",
    "audit:view_logs",
    "voice:access",
]


async def check_assistant_admin_scope(
    db: AsyncSession, user_id: int, required_scope: str
) -> bool:
    """Query user_permissions JOIN permission_scopes live from database.
    
    Ensures that permission revocations take immediate effect without waiting for JWT expiration.
    """
    stmt = (
        select(UserPermission.id)
        .join(PermissionScope, UserPermission.permission_scope_id == PermissionScope.id)
        .where(
            UserPermission.user_id == user_id,
            PermissionScope.scope_name == required_scope,
        )
    )
    result = await db.execute(stmt)
    return result.scalar() is not None


async def get_user_effective_permissions(
    db: AsyncSession, user: User
) -> List[str]:
    """Retrieve list of active verified permission scopes for the given user."""
    if user.role == "ROLE_SUPER_USER":
        return ALL_SCOPES.copy()

    if user.role == "ROLE_ASSISTANT_ADMIN":
        stmt = (
            select(PermissionScope.scope_name)
            .join(UserPermission, UserPermission.permission_scope_id == PermissionScope.id)
            .where(UserPermission.user_id == user.id)
            .order_by(PermissionScope.scope_name)
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())

    if user.role == "ROLE_RECEPTIONIST":
        return [
            "records:view_all",
            "registrations:create_desk",
            "registrations:edit",
            "duplicates:resolve",
            "documents:upload_all",
            "documents:ocr_extract",
            "pdf:download_all",
            "pdf:regenerate",
            "voice:access",
        ]

    if user.role == "ROLE_PATIENT":
        return ["voice:access"]

    return []


async def grant_permission_scope(
    db: AsyncSession,
    super_user: User,
    target_user: User,
    scope_name: str,
) -> UserPermission:
    """Grant a permission scope to an Assistant Administrator. Strictly callable by Super User."""
    if super_user.role != "ROLE_SUPER_USER":
        raise PermissionDeniedException(
            detail="Only Super Users are authorized to grant permission scopes.",
            code="INSUFFICIENT_PERMISSIONS",
        )

    if target_user.role != "ROLE_ASSISTANT_ADMIN":
        raise PermissionDeniedException(
            detail="Permissions can only be granted to Assistant Administrators.",
            code="INVALID_TARGET_ROLE",
        )

    # Find the permission scope
    scope_stmt = select(PermissionScope).where(PermissionScope.scope_name == scope_name)
    scope_res = await db.execute(scope_stmt)
    scope = scope_res.scalar_one_or_none()
    if not scope:
        raise PermissionDeniedException(
            detail=f"Permission scope '{scope_name}' does not exist in the catalog.",
            code="SCOPE_NOT_FOUND",
        )

    # Check if already granted
    existing_stmt = select(UserPermission).where(
        UserPermission.user_id == target_user.id,
        UserPermission.permission_scope_id == scope.id,
    )
    existing_res = await db.execute(existing_stmt)
    existing = existing_res.scalar_one_or_none()
    if existing:
        return existing

    up = UserPermission(
        user_id=target_user.id,
        permission_scope_id=scope.id,
        granted_by_user_id=super_user.id,
    )
    db.add(up)
    await db.flush()
    return up


async def revoke_permission_scope(
    db: AsyncSession,
    super_user: User,
    target_user: User,
    scope_name: str,
) -> bool:
    """Revoke a permission scope from an Assistant Administrator. Strictly callable by Super User."""
    if super_user.role != "ROLE_SUPER_USER":
        raise PermissionDeniedException(
            detail="Only Super Users are authorized to revoke permission scopes.",
            code="INSUFFICIENT_PERMISSIONS",
        )

    scope_stmt = select(PermissionScope.id).where(PermissionScope.scope_name == scope_name)
    scope_res = await db.execute(scope_stmt)
    scope_id = scope_res.scalar_one_or_none()
    if not scope_id:
        return False

    del_stmt = delete(UserPermission).where(
        UserPermission.user_id == target_user.id,
        UserPermission.permission_scope_id == scope_id,
    )
    res = await db.execute(del_stmt)
    await db.flush()
    return res.rowcount > 0

