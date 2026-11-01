"""Authentication service implementing login, token rotation, session termination, and password reset."""

from datetime import datetime, timedelta, timezone
import logging
import secrets
from typing import Optional, Tuple
import uuid
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.exceptions import (
    AccountDeactivatedException,
    CSRFValidationException,
    InvalidCredentialsException,
    InvalidTokenException,
    TokenRevokedOrExpiredException,
    TokenTheftException,
    UserAlreadyExistsException,
)
from app.core.security import (
    create_access_token,
    create_password_reset_token,
    create_refresh_token,
    decode_password_reset_token,
    decode_refresh_token,
    hash_password,
    hash_token,
    validate_password_strength,
    verify_password,
)
from app.models.patient import Patient
from app.models.user import RevokedToken, User
from app.schemas.auth import RegisterPatientRequest, TokenResponse
from app.services.audit_service import log_audit_event

logger = logging.getLogger("aegis.auth_service")
settings = get_settings()


async def authenticate_user(
    db: AsyncSession,
    username_or_email: str,
    password: str,
    client_ip: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> User:
    """Authenticate credentials against salted Argon2id hashes and verify account active status."""
    stmt = select(User).where(
        or_(
            User.username == username_or_email,
            User.email == username_or_email,
        )
    )
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        await log_audit_event(
            db=db,
            actor_user_id=None,
            actor_username=username_or_email,
            actor_role="ANONYMOUS",
            action_type="LOGIN_FAILED",
            ip_address=client_ip,
            user_agent=user_agent,
            justification="Authentication failed: user does not exist",
        )
        raise InvalidCredentialsException()

    if not verify_password(password, user.hashed_password):
        await log_audit_event(
            db=db,
            actor_user_id=user.id,
            actor_username=user.username,
            actor_role=user.role,
            action_type="LOGIN_FAILED",
            ip_address=client_ip,
            user_agent=user_agent,
            justification="Authentication failed: invalid password",
        )
        raise InvalidCredentialsException()

    if user.is_active != 1:
        await log_audit_event(
            db=db,
            actor_user_id=user.id,
            actor_username=user.username,
            actor_role=user.role,
            action_type="LOGIN_FAILED",
            ip_address=client_ip,
            user_agent=user_agent,
            justification="Authentication denied: account deactivated",
        )
        raise AccountDeactivatedException()

    # Update last login timestamp
    user.last_login_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    await db.flush()

    await log_audit_event(
        db=db,
        actor_user_id=user.id,
        actor_username=user.username,
        actor_role=user.role,
        action_type="LOGIN_SUCCESS",
        ip_address=client_ip,
        user_agent=user_agent,
        target_type="users",
        target_id=str(user.id),
    )
    return user


async def invalidate_all_user_sessions(
    db: AsyncSession,
    user_id: int,
    reason: str = "SESSION_TERMINATION",
) -> None:
    """Invalidate all outstanding refresh sessions for a user within the existing database schema.
    
    Inserts a user-scoped session invalidation marker into revoked_tokens with the current UTC timestamp.
    Any refresh token presented whose issued-at timestamp (iat) is prior to or at this invalidation timestamp
    is rejected during rotate_refresh_token.
    """
    now = datetime.now(timezone.utc)
    now_str = now.strftime("%Y-%m-%dT%H:%M:%SZ")
    expiry_str = (now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)).strftime("%Y-%m-%dT%H:%M:%SZ")
    marker_hash = f"ALL_SESSIONS_REVOKED:{user_id}:{uuid.uuid4().hex}"
    revocation = RevokedToken(
        token_hash=marker_hash,
        user_id=user_id,
        revoked_at=now_str,
        expires_at=expiry_str,
    )
    db.add(revocation)
    await db.flush()


async def issue_tokens(
    user: User,
) -> Tuple[TokenResponse, str]:
    """Issue a 15-minute JWT access token, a 7-day sliding refresh token, and a cryptographic CSRF token."""
    csrf_token = secrets.token_urlsafe(32)
    access_token = create_access_token(
        user_id=user.id,
        username=user.username,
        role=user.role,
    )
    raw_refresh_token = create_refresh_token(user_id=user.id, csrf_token=csrf_token)

    token_resp = TokenResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user_id=user.id,
        username=user.username,
        role=user.role,
        csrf_token=csrf_token,
    )
    return token_resp, raw_refresh_token


async def rotate_refresh_token(
    db: AsyncSession,
    raw_token: str,
    csrf_token: Optional[str] = None,
    client_ip: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> Tuple[TokenResponse, str]:
    """Execute mandatory refresh token rotation with single-use enforcement, theft detection, and CSRF defense."""
    # 1. Decode token to extract payload and claims
    try:
        payload = decode_refresh_token(raw_token)
    except InvalidTokenException:
        raise TokenRevokedOrExpiredException()

    user_id = int(payload["sub"])
    token_digest = hash_token(raw_token)

    # 1b. Cryptographic CSRF validation: If token was issued with embedded CSRF claim, verify header
    expected_csrf_hash = payload.get("csrf")
    if expected_csrf_hash:
        if not csrf_token or hash_token(csrf_token) != expected_csrf_hash:
            raise CSRFValidationException(
                detail="Anti-CSRF token is missing or does not match refresh session."
            )

    # 2. Check if token hash is already in revoked_tokens (Replay / Theft Detection)
    revoked_stmt = select(RevokedToken).where(RevokedToken.token_hash == token_digest)
    revoked_res = await db.execute(revoked_stmt)
    already_revoked = revoked_res.scalar_one_or_none()

    if already_revoked:
        # THEFT DETECTED: A previously consumed token was re-submitted!
        logger.critical(
            "SECURITY ALERT: Refresh token reuse detected for user_id=%d! Possible token theft.",
            user_id,
        )
        await invalidate_all_user_sessions(db, user_id=user_id, reason="TOKEN_REUSE_DETECTED")
        await log_audit_event(
            db=db,
            actor_user_id=user_id,
            actor_username=f"user_{user_id}",
            actor_role="UNKNOWN",
            action_type="TOKEN_REUSE_DETECTED",
            ip_address=client_ip,
            user_agent=user_agent,
            justification="Critical: Consumed refresh token re-submitted. Immediate session invalidation executed.",
            metadata={"token_hash": token_digest[:16] + "..."},
        )
        await db.commit()
        raise TokenTheftException()

    # 2b. Check if user-wide session invalidation occurred after token issuance
    token_iat_ts = payload.get("iat")
    if token_iat_ts:
        token_iat_str = datetime.fromtimestamp(token_iat_ts, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        user_revoked_stmt = (
            select(RevokedToken.id)
            .where(
                RevokedToken.user_id == user_id,
                RevokedToken.token_hash.startswith("ALL_SESSIONS_REVOKED:"),
                RevokedToken.revoked_at >= token_iat_str,
            )
        )
        user_revoked_res = await db.execute(user_revoked_stmt)
        if user_revoked_res.scalar_one_or_none():
            raise TokenRevokedOrExpiredException("Session has been terminated. Please log in again.")

    # 3. Query User record and verify account active status
    user_stmt = select(User).where(User.id == user_id)
    user_res = await db.execute(user_stmt)
    user = user_res.scalar_one_or_none()

    if not user:
        raise TokenRevokedOrExpiredException("User account associated with token does not exist.")

    if user.is_active != 1:
        raise AccountDeactivatedException()

    # Capture primitive attributes prior to any flush/rollback to prevent MissingGreenlet errors
    u_id = int(user.id)
    u_username = str(user.username)
    u_role = str(user.role)

    # 4. Mark submitted token as revoked (single-use consumption)
    expires_dt = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
    revocation_entry = RevokedToken(
        token_hash=token_digest,
        user_id=u_id,
        expires_at=expires_dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
    )
    db.add(revocation_entry)
    try:
        await db.flush()
    except IntegrityError:
        # Concurrent race condition: identical refresh token submitted simultaneously
        await db.rollback()
        await invalidate_all_user_sessions(db, user_id=u_id, reason="CONCURRENT_TOKEN_REUSE_THEFT")
        await log_audit_event(
            db=db,
            actor_user_id=u_id,
            actor_username=u_username,
            actor_role=u_role,
            action_type="TOKEN_REUSE_DETECTED",
            ip_address=client_ip,
            user_agent=user_agent,
            justification="Concurrent presentation of identical refresh token detected.",
        )
        await db.commit()
        raise TokenTheftException("Concurrent duplicate token presentation detected.")

    # 5. Issue new access token and rotated refresh token
    new_token_resp, new_raw_refresh = await issue_tokens(user)

    await log_audit_event(
        db=db,
        actor_user_id=user.id,
        actor_username=user.username,
        actor_role=user.role,
        action_type="TOKEN_REFRESH",
        ip_address=client_ip,
        user_agent=user_agent,
    )
    return new_token_resp, new_raw_refresh


async def logout_user(
    db: AsyncSession,
    raw_token: Optional[str],
    current_user: User,
    client_ip: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> None:
    """Terminate session: record refresh token in revoked_tokens and log event."""
    if raw_token:
        try:
            payload = decode_refresh_token(raw_token)
            token_digest = hash_token(raw_token)
            expires_dt = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)

            # Avoid duplicate primary key insertion if already logged
            chk_stmt = select(RevokedToken.id).where(RevokedToken.token_hash == token_digest)
            chk_res = await db.execute(chk_stmt)
            if not chk_res.scalar_one_or_none():
                revocation_entry = RevokedToken(
                    token_hash=token_digest,
                    user_id=current_user.id,
                    expires_at=expires_dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
                )
                db.add(revocation_entry)
                await db.flush()
        except Exception as e:
            logger.warning("Error revoking refresh token on logout: %s", e)

    await log_audit_event(
        db=db,
        actor_user_id=current_user.id,
        actor_username=current_user.username,
        actor_role=current_user.role,
        action_type="LOGOUT",
        ip_address=client_ip,
        user_agent=user_agent,
    )


async def initiate_password_reset(
    db: AsyncSession,
    email: str,
    client_ip: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> Optional[str]:
    """Generate a single-use 15-minute cryptographic password reset token."""
    stmt = select(User).where(User.email == email)
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()

    if not user or user.is_active != 1:
        # Return None silently to prevent user enumeration attacks
        return None

    reset_token = create_password_reset_token(user.id)

    await log_audit_event(
        db=db,
        actor_user_id=user.id,
        actor_username=user.username,
        actor_role=user.role,
        action_type="PASSWORD_RESET_REQUESTED",
        ip_address=client_ip,
        user_agent=user_agent,
    )
    return reset_token


async def confirm_password_reset(
    db: AsyncSession,
    token: str,
    new_password: str,
    client_ip: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> None:
    """Validate reset token, update user password hash, and invalidate token."""
    # 1. Decode reset token
    payload = decode_password_reset_token(token)
    user_id = int(payload["sub"])
    token_digest = hash_token(token)

    # 2. Check if already used
    chk_stmt = select(RevokedToken.id).where(RevokedToken.token_hash == token_digest)
    chk_res = await db.execute(chk_stmt)
    if chk_res.scalar_one_or_none():
        raise InvalidTokenException("This password reset token has already been used.")

    # 3. Validate password complexity
    validate_password_strength(new_password)

    # 4. Fetch user
    user_stmt = select(User).where(User.id == user_id)
    user_res = await db.execute(user_stmt)
    user = user_res.scalar_one_or_none()
    if not user or user.is_active != 1:
        raise AccountDeactivatedException()

    # 5. Update password
    user.hashed_password = hash_password(new_password)
    user.updated_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    # 6. Mark reset token as consumed
    expires_dt = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
    revocation = RevokedToken(
        token_hash=token_digest,
        user_id=user.id,
        expires_at=expires_dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
    )
    db.add(revocation)
    await db.flush()

    # 7. Invalidate all active sessions for this user upon password reset (FR-AUTH-06)
    await invalidate_all_user_sessions(db, user_id=user.id, reason="PASSWORD_RESET")

    await log_audit_event(
        db=db,
        actor_user_id=user.id,
        actor_username=user.username,
        actor_role=user.role,
        action_type="PASSWORD_RESET_COMPLETED",
        ip_address=client_ip,
        user_agent=user_agent,
        target_type="users",
        target_id=str(user.id),
    )


async def register_patient_account(
    db: AsyncSession,
    req: RegisterPatientRequest,
    client_ip: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> Tuple[User, Patient]:
    """Self-register a new patient account with coupled User and Patient records."""
    # Check duplicate username or email
    dup_stmt = select(User).where(
        or_(
            User.username == req.username,
            User.email == str(req.email),
        )
    )
    dup_res = await db.execute(dup_stmt)
    if dup_res.scalar_one_or_none():
        raise UserAlreadyExistsException("An account with this username or email already exists.")

    validate_password_strength(req.password)

    # Generate permanent business patient_id PID-YYYY-XXXXX
    import secrets
    pid = f"PID-{datetime.now(timezone.utc).year}-{secrets.token_hex(3).upper()}"

    user = User(
        username=req.username,
        email=str(req.email),
        hashed_password=hash_password(req.password),
        role="ROLE_PATIENT",
        is_active=1,
    )
    db.add(user)
    await db.flush()

    patient = Patient(
        patient_id=pid,
        user_id=user.id,
        full_name=req.full_name,
        date_of_birth=req.date_of_birth,
        gender=req.gender,
        blood_group=req.blood_group or "Unknown",
        primary_mobile=req.primary_mobile,
        email=str(req.email),
    )
    db.add(patient)
    await db.flush()

    await log_audit_event(
        db=db,
        actor_user_id=user.id,
        actor_username=user.username,
        actor_role="ROLE_PATIENT",
        action_type="ACCOUNT_CREATED",
        ip_address=client_ip,
        user_agent=user_agent,
        target_type="users",
        target_id=str(user.id),
        metadata={"patient_id": pid},
    )
    return user, patient

