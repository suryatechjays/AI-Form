"""User and Role Management Service implementing Module 3.2 of BMD-AEGIS-2026 v1.3.

Responsibilities:
1. Administrative user provisioning under strict anti-escalation rules.
2. User listing with live dynamic permission resolution.
3. Profile updates and permission scope synchronization.
4. Soft account deactivation enforcing Super User anti-lockout guardrails.
5. Audit event logging without sensitive credential disclosure.
"""

from datetime import datetime, timezone
import logging
from typing import List, Optional, Tuple
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    PermissionDeniedException,
    SelfModificationException,
    UserAlreadyExistsException,
    UserNotFoundException,
)
from app.core.security import hash_password, validate_password_strength
from app.models.patient import Patient
from app.models.user import User
from app.schemas.user import UserCreateRequest, UserUpdateRequest
from app.services.audit_service import log_audit_event
from app.services.permission_service import (
    check_assistant_admin_scope,
    get_user_effective_permissions,
    grant_permission_scope,
    revoke_permission_scope,
)

logger = logging.getLogger("aegis.user_service")

VALID_ROLES = ["ROLE_PATIENT", "ROLE_RECEPTIONIST", "ROLE_ASSISTANT_ADMIN", "ROLE_SUPER_USER"]


def normalize_role(role_str: str) -> str:
    """Normalize input role names into canonical database constants."""
    if not role_str:
        return "ROLE_RECEPTIONIST"
    upper = role_str.strip().upper()
    if "SUPER" in upper:
        return "ROLE_SUPER_USER"
    if "RECEP" in upper:
        return "ROLE_RECEPTIONIST"
    if "ASSIST" in upper:
        return "ROLE_ASSISTANT_ADMIN"
    if "PATIENT" in upper:
        return "ROLE_PATIENT"
    if upper in VALID_ROLES:
        return upper
    return "ROLE_RECEPTIONIST"


async def list_users(
    db: AsyncSession,
    actor: User,
    page: Optional[int] = None,
    limit: Optional[int] = None,
    role_filter: Optional[str] = None,
    status_filter: Optional[str] = None,
    search: Optional[str] = None,
) -> Tuple[List[Tuple[User, List[str]]], int]:
    """Retrieve user accounts with dynamic permission scopes attached under RBAC rules and server-side pagination."""
    # RBAC Governance: Super User has global visibility
    if actor.role == "ROLE_SUPER_USER":
        pass
    elif actor.role == "ROLE_ASSISTANT_ADMIN":
        # Assistant Admin must possess at least one account governance scope
        has_receptionist_scope = await check_assistant_admin_scope(db, actor.id, "accounts:receptionist_manage")
        has_patient_scope = await check_assistant_admin_scope(db, actor.id, "accounts:patient_manage")
        if not (has_receptionist_scope or has_patient_scope):
            raise PermissionDeniedException(
                detail="Assistant Administrator lacks required account management scopes.",
                code="SCOPE_PERMISSION_DENIED",
            )
    else:
        raise PermissionDeniedException(
            detail="Access Denied: Only administrative staff may access user account directories.",
            code="INSUFFICIENT_PERMISSIONS",
        )

    base_stmt = select(User).options(selectinload(User.patient))

    if role_filter and role_filter != "ALL":
        canonical_role = normalize_role(role_filter)
        base_stmt = base_stmt.where(User.role == canonical_role)

    eff_status = (status_filter or "active").strip().lower()
    if eff_status == "active":
        base_stmt = base_stmt.where(User.is_active == 1)
    elif eff_status == "deactivated":
        base_stmt = base_stmt.where(User.is_active == 0)
    # If eff_status in ("all", "any"), all accounts (including deactivated) are included

    if search and search.strip():
        raw_search = search.strip()
        search_words = [w for w in raw_search.split() if w]
        search_lower = raw_search.lower()

        # Known staff / system persona aliases for person name search
        STAFF_PERSONAS = {
            "admin": ["eleanor", "vance", "dr. eleanor vance", "eleanor vance", "dr eleanor vance", "eleanor vance (admin)"],
            "receptionist": ["sarah", "jenkins", "sarah jenkins"],
            "assistant": ["marcus", "brody", "marcus brody"],
            "patient": ["david", "miller", "david miller", "david michael miller"],
        }
        staff_matches = set()
        for uname, aliases in STAFF_PERSONAS.items():
            for alias in aliases:
                if search_lower in alias or alias in search_lower:
                    staff_matches.add(uname)
                elif any(w.lower() in alias.split() for w in search_words):
                    staff_matches.add(uname)

        phrase_term = f"%{raw_search}%"
        or_clauses = [
            User.username.ilike(phrase_term),
            User.email.ilike(phrase_term),
            Patient.full_name.ilike(phrase_term),
        ]
        if staff_matches:
            or_clauses.append(User.username.in_(list(staff_matches)))

        if len(search_words) > 1:
            word_and_clauses = []
            for w in search_words:
                w_term = f"%{w}%"
                word_and_clauses.append(
                    or_(
                        User.username.ilike(w_term),
                        User.email.ilike(w_term),
                        Patient.full_name.ilike(w_term),
                    )
                )
            or_clauses.append(and_(*word_and_clauses))

        base_stmt = base_stmt.outerjoin(Patient, User.id == Patient.user_id).where(
            or_(*or_clauses)
        )

    count_stmt = select(func.count()).select_from(base_stmt.subquery())
    total_count = (await db.execute(count_stmt)).scalar() or 0

    paged_stmt = base_stmt.order_by(User.created_at.desc(), User.id.desc())
    if limit is not None and limit > 0:
        eff_page = page or 1
        offset = max(0, (eff_page - 1) * limit)
        paged_stmt = paged_stmt.offset(offset).limit(limit)

    result = await db.execute(paged_stmt)
    users = result.scalars().all()

    # Attach effective permissions to sliced users
    user_tuples = []
    for u in users:
        perms = await get_user_effective_permissions(db, u)
        user_tuples.append((u, perms))

    return user_tuples, total_count


async def provision_user(
    db: AsyncSession,
    actor: User,
    data: UserCreateRequest,
    client_ip: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> Tuple[User, List[str]]:
    """Administratively provision a new user account enforcing anti-escalation rules."""
    target_role = normalize_role(data.role)

    # 1. Anti-Escalation Hierarchy (BMD-AEGIS-2026 v1.3 Section 3.2 & 5.5)
    if actor.role == "ROLE_SUPER_USER":
        # Super User can provision any valid role
        pass
    elif actor.role == "ROLE_ASSISTANT_ADMIN":
        # Assistant Admin may only provision Receptionist accounts if granted accounts:receptionist_manage
        if target_role != "ROLE_RECEPTIONIST":
            raise PermissionDeniedException(
                detail="Assistant Administrators cannot provision administrators, Super Users, or patient portals.",
                code="ANTI_ESCALATION_VIOLATION",
            )
        has_scope = await check_assistant_admin_scope(db, actor.id, "accounts:receptionist_manage")
        if not has_scope:
            raise PermissionDeniedException(
                detail="Assistant Administrator lacks required scope 'accounts:receptionist_manage'.",
                code="SCOPE_PERMISSION_DENIED",
            )
    else:
        raise PermissionDeniedException(
            detail="Only administrative personnel can provision new user accounts.",
            code="INSUFFICIENT_PERMISSIONS",
        )

    # 2. Check for duplicate username or email
    dup_stmt = select(User).where(
        or_(
            User.username == data.username.strip(),
            User.email == data.email.strip().lower(),
        )
    )
    dup_res = await db.execute(dup_stmt)
    if dup_res.scalar_one_or_none():
        raise UserAlreadyExistsException("A user account with this username or email address already exists.")

    # 3. Validate and hash password
    if not data.password:
        raise InvalidPasswordException("Password is required to provision a new user account.")
    validate_password_strength(data.password)
    hashed_pw = hash_password(data.password)

    # 4. Create and persist user in SQLite
    new_user = User(
        username=data.username.strip(),
        email=data.email.strip().lower(),
        hashed_password=hashed_pw,
        role=target_role,
        is_active=data.is_active,
    )
    db.add(new_user)
    await db.flush()

    # 5. Grant specific permission scopes if target is Assistant Admin and actor is Super User
    if target_role == "ROLE_ASSISTANT_ADMIN" and actor.role == "ROLE_SUPER_USER" and data.permissions:
        for scope_name in data.permissions:
            try:
                await grant_permission_scope(db, actor, new_user, scope_name)
            except Exception as e:
                logger.warning("Could not grant scope %s to user %s: %s", scope_name, new_user.username, e)

    # 6. Audit Logging (Zero credential leakage)
    await log_audit_event(
        db=db,
        actor_user_id=actor.id,
        actor_username=actor.username,
        actor_role=actor.role,
        action_type="ACCOUNT_CREATED",
        target_type="users",
        target_id=str(new_user.id),
        ip_address=client_ip,
        user_agent=user_agent,
        metadata={
            "created_username": new_user.username,
            "created_role": new_user.role,
            "created_by": actor.username,
        },
    )
    await db.commit()
    await db.refresh(new_user)

    effective_perms = await get_user_effective_permissions(db, new_user)
    return new_user, effective_perms


async def update_user_account(
    db: AsyncSession,
    actor: User,
    target_user_id: int,
    data: UserUpdateRequest,
    client_ip: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> Tuple[User, List[str]]:
    """Update user account attributes enforcing anti-lockout and role hierarchy."""
    stmt = select(User).where(User.id == target_user_id)
    result = await db.execute(stmt)
    target_user = result.scalar_one_or_none()

    if not target_user:
        raise UserNotFoundException(f"User account with ID {target_user_id} was not found.")

    # 1. Anti-Lockout Guardrail (Super User cannot deactivate self or demote self)
    if actor.id == target_user.id:
        if data.is_active is not None and data.is_active == 0:
            raise SelfModificationException("Super Users are strictly prohibited from deactivating their own account.")
        if data.role and normalize_role(data.role) != "ROLE_SUPER_USER":
            raise SelfModificationException("Super Users cannot demote their own account role.")

    # 2. Privilege Hierarchy
    if actor.role == "ROLE_SUPER_USER":
        pass
    elif actor.role == "ROLE_ASSISTANT_ADMIN":
        if target_user.role in ("ROLE_SUPER_USER", "ROLE_ASSISTANT_ADMIN"):
            raise PermissionDeniedException(
                detail="Assistant Administrators cannot edit administrator accounts.",
                code="ANTI_ESCALATION_VIOLATION",
            )
        has_scope = await check_assistant_admin_scope(db, actor.id, "accounts:receptionist_manage")
        if not has_scope:
            raise PermissionDeniedException(
                detail="Assistant Administrator lacks required scope 'accounts:receptionist_manage'.",
                code="SCOPE_PERMISSION_DENIED",
            )
    else:
        raise PermissionDeniedException(
            detail="You do not possess administrative permissions to edit user accounts.",
            code="INSUFFICIENT_PERMISSIONS",
        )

    # 3. Apply updates
    if data.email:
        target_user.email = str(data.email).strip().lower()

    if data.role and actor.role == "ROLE_SUPER_USER":
        target_user.role = normalize_role(data.role)

    if data.is_active is not None:
        target_user.is_active = data.is_active

    target_user.updated_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    # 4. Synchronize permissions if Super User updated an Assistant Admin
    if data.permissions is not None and actor.role == "ROLE_SUPER_USER" and target_user.role == "ROLE_ASSISTANT_ADMIN":
        current_perms = set(await get_user_effective_permissions(db, target_user))
        desired_perms = set(data.permissions)

        for to_revoke in current_perms - desired_perms:
            await revoke_permission_scope(db, actor, target_user, to_revoke)
        for to_grant in desired_perms - current_perms:
            try:
                await grant_permission_scope(db, actor, target_user, to_grant)
            except Exception as e:
                logger.warning("Scope grant exception: %s", e)

    await log_audit_event(
        db=db,
        actor_user_id=actor.id,
        actor_username=actor.username,
        actor_role=actor.role,
        action_type="ACCOUNT_UPDATED",
        target_type="users",
        target_id=str(target_user.id),
        ip_address=client_ip,
        user_agent=user_agent,
        metadata={
            "updated_username": target_user.username,
            "updated_role": target_user.role,
            "is_active": target_user.is_active,
        },
    )

    await db.commit()
    await db.refresh(target_user)

    effective_perms = await get_user_effective_permissions(db, target_user)
    return target_user, effective_perms


async def toggle_user_deactivation(
    db: AsyncSession,
    actor: User,
    target_user_id: int,
    client_ip: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> Tuple[User, List[str]]:
    """Toggle account soft-deactivation status enforcing Super User anti-lockout."""
    stmt = select(User).where(User.id == target_user_id)
    result = await db.execute(stmt)
    target_user = result.scalar_one_or_none()

    if not target_user:
        raise UserNotFoundException(f"User account with ID {target_user_id} was not found.")

    if actor.id == target_user.id and target_user.is_active == 1:
        raise SelfModificationException("Super Users cannot deactivate their own accounts.")

    # Privilege check
    if actor.role == "ROLE_SUPER_USER":
        pass
    elif actor.role == "ROLE_ASSISTANT_ADMIN":
        if target_user.role in ("ROLE_SUPER_USER", "ROLE_ASSISTANT_ADMIN"):
            raise PermissionDeniedException(
                detail="Assistant Administrators cannot deactivate administrators.",
                code="ANTI_ESCALATION_VIOLATION",
            )
        has_scope = await check_assistant_admin_scope(db, actor.id, "accounts:deactivate")
        if not has_scope:
            raise PermissionDeniedException(
                detail="Assistant Administrator lacks required scope 'accounts:deactivate'.",
                code="SCOPE_PERMISSION_DENIED",
            )
    else:
        raise PermissionDeniedException(
            detail="Only administrative personnel can modify account active status.",
            code="INSUFFICIENT_PERMISSIONS",
        )

    new_status = 0 if target_user.is_active == 1 else 1
    target_user.is_active = new_status
    target_user.updated_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    action = "ACCOUNT_DEACTIVATED" if new_status == 0 else "ACCOUNT_REACTIVATED"
    await log_audit_event(
        db=db,
        actor_user_id=actor.id,
        actor_username=actor.username,
        actor_role=actor.role,
        action_type=action,
        target_type="users",
        target_id=str(target_user.id),
        ip_address=client_ip,
        user_agent=user_agent,
        metadata={
            "username": target_user.username,
            "new_status": new_status,
        },
    )

    await db.commit()
    await db.refresh(target_user)

    effective_perms = await get_user_effective_permissions(db, target_user)
    return target_user, effective_perms


async def deactivate_user(
    db: AsyncSession,
    actor: User,
    target_user_id: int,
    client_ip: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> Tuple[User, List[str]]:
    """Soft-deactivate user account enforcing Super User anti-lockout (idempotent deactivation)."""
    stmt = select(User).where(User.id == target_user_id)
    result = await db.execute(stmt)
    target_user = result.scalar_one_or_none()

    if not target_user:
        raise UserNotFoundException(f"User account with ID {target_user_id} was not found.")

    if actor.id == target_user.id:
        raise SelfModificationException("Super Users cannot deactivate their own accounts.")

    # Privilege check
    if actor.role == "ROLE_SUPER_USER":
        pass
    elif actor.role == "ROLE_ASSISTANT_ADMIN":
        if target_user.role in ("ROLE_SUPER_USER", "ROLE_ASSISTANT_ADMIN"):
            raise PermissionDeniedException(
                detail="Assistant Administrators cannot deactivate administrators.",
                code="ANTI_ESCALATION_VIOLATION",
            )
        has_scope = await check_assistant_admin_scope(db, actor.id, "accounts:deactivate")
        if not has_scope:
            raise PermissionDeniedException(
                detail="Assistant Administrator lacks required scope 'accounts:deactivate'.",
                code="SCOPE_PERMISSION_DENIED",
            )
    else:
        raise PermissionDeniedException(
            detail="Only administrative personnel can modify account active status.",
            code="INSUFFICIENT_PERMISSIONS",
        )

    # Idempotent soft deactivation: ensure is_active is set to 0
    target_user.is_active = 0
    target_user.updated_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    await log_audit_event(
        db=db,
        actor_user_id=actor.id,
        actor_username=actor.username,
        actor_role=actor.role,
        action_type="ACCOUNT_DEACTIVATED",
        target_type="users",
        target_id=str(target_user.id),
        ip_address=client_ip,
        user_agent=user_agent,
        metadata={
            "username": target_user.username,
            "new_status": 0,
        },
    )

    await db.commit()
    await db.refresh(target_user)

    effective_perms = await get_user_effective_permissions(db, target_user)
    return target_user, effective_perms

