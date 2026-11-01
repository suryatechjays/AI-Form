"""Comprehensive tests for AEGIS Authentication & Authorization Module.

Covers:
1. Password security (Argon2id hashing, verification, complexity rules).
2. Login endpoint (valid, invalid credentials, inactive account, RFC 7807 error format).
3. JWT access tokens (valid, expired, tampered signature, inactive account check).
4. Refresh tokens (cookie handling, rotation, single-use, theft/reuse detection, CSRF protection).
5. Session termination (logout).
6. Password reset workflow (single-use token, session invalidation).
7. Role and scope enforcement (all 4 roles, Assistant Admin live DB checks, instant revocation).
"""

import asyncio
from datetime import datetime, timedelta, timezone
import uuid
import pytest
from fastapi import APIRouter, Depends
import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.exceptions import InvalidPasswordException
from app.core.security import (
    create_access_token,
    create_password_reset_token,
    create_refresh_token,
    decode_access_token,
    hash_password,
    hash_token,
    validate_password_strength,
    verify_password,
)
from app.database import get_db
from app.dependencies import get_current_user, require_role, require_scope
from app.main import app
from app.models.audit import AuditEvent
from app.models.permission import PermissionScope, UserPermission
from app.models.user import RevokedToken, User
from app.services.permission_service import grant_permission_scope, revoke_permission_scope

settings = get_settings()

# Mount test endpoints to verify RBAC and scope dependencies end-to-end
rbac_test_router = APIRouter(prefix="/test-rbac", tags=["Test RBAC"])


@rbac_test_router.get("/super-only")
async def super_user_endpoint(user: User = Depends(require_role("ROLE_SUPER_USER"))):
    return {"access": "granted", "role": user.role}


@rbac_test_router.get("/records-view")
async def records_view_endpoint(user: User = Depends(require_scope("records:view_all"))):
    return {"access": "granted", "username": user.username, "scope": "records:view_all"}


@rbac_test_router.get("/desk-registration")
async def desk_registration_endpoint(user: User = Depends(require_scope("registrations:create_desk"))):
    return {"access": "granted", "username": user.username, "scope": "registrations:create_desk"}


# Include once into application
if not any(r.prefix == "/api/v1/test-rbac" for r in app.routes if hasattr(r, "prefix")):
    app.include_router(rbac_test_router, prefix=settings.API_V1_PREFIX)


def uid() -> str:
    """Generate short unique suffix for test isolation."""
    return uuid.uuid4().hex[:8]


# ==============================================================================
# 1. PASSWORD SECURITY TESTS
# ==============================================================================

def test_password_hashing_and_verification():
    """Verify Argon2id produces valid salted hashes and verifies plaintext accurately."""
    raw_pass = "SecurePass123!"
    hashed = hash_password(raw_pass)

    # Must be valid Argon2id hash format
    assert hashed.startswith("$argon2id$")
    assert hashed != raw_pass

    # Verification must succeed for correct password
    assert verify_password(raw_pass, hashed) is True

    # Verification must fail for incorrect password
    assert verify_password("WrongPassword!", hashed) is False
    assert verify_password("", hashed) is False


def test_password_strength_validation():
    """Verify password complexity rules reject weak passwords."""
    # Too short (< 8 chars)
    with pytest.raises(InvalidPasswordException):
        validate_password_strength("Short1!")

    # Missing uppercase
    with pytest.raises(InvalidPasswordException):
        validate_password_strength("lowercase123!")

    # Missing lowercase
    with pytest.raises(InvalidPasswordException):
        validate_password_strength("UPPERCASE123!")

    # Missing number
    with pytest.raises(InvalidPasswordException):
        validate_password_strength("NoNumbersHere!")

    # Missing special character
    with pytest.raises(InvalidPasswordException):
        validate_password_strength("NoSpecialChar123")

    # Valid password should not raise
    validate_password_strength("ValidPassword99#")


# ==============================================================================
# 2. LOGIN ENDPOINT TESTS
# ==============================================================================

@pytest.mark.asyncio
async def test_login_success(async_client):
    """Verify valid login returns JWT access token, user metadata, and HttpOnly refresh cookie."""
    tag = uid()
    raw_pass = "AlphaPass123!"
    async for db in get_db():
        user = User(
            username=f"user_{tag}",
            email=f"user_{tag}@hospital.org",
            hashed_password=hash_password(raw_pass),
            role="ROLE_RECEPTIONIST",
            is_active=1,
        )
        db.add(user)
        await db.commit()
        break

    # Execute login
    resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/auth/login",
        json={"username_or_email": f"user_{tag}", "password": raw_pass},
    )
    assert resp.status_code == 200
    data = resp.json()

    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["role"] == "ROLE_RECEPTIONIST"
    assert data["username"] == f"user_{tag}"
    assert data["expires_in"] == 900

    # Verify refresh cookie was set
    assert settings.REFRESH_COOKIE_NAME in resp.cookies
    cookie = resp.cookies[settings.REFRESH_COOKIE_NAME]
    assert len(cookie) > 20


@pytest.mark.asyncio
async def test_login_invalid_credentials(async_client):
    """Verify wrong password or non-existent user returns HTTP 401 with RFC 7807 schema."""
    resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/auth/login",
        json={"username_or_email": "nonexistent_user", "password": "WrongPassword123!"},
    )
    assert resp.status_code == 401
    problem = resp.json()

    assert problem["status"] == 401
    assert problem["code"] == "INVALID_CREDENTIALS"
    assert "Invalid username or password" in problem["detail"]
    assert "correlation_id" in problem
    assert problem["instance"] == f"{settings.API_V1_PREFIX}/auth/login"


@pytest.mark.asyncio
async def test_login_deactivated_account(async_client):
    """Verify deactivated account (is_active == 0) returns HTTP 403 ACCOUNT_DEACTIVATED."""
    tag = uid()
    raw_pass = "AlphaPass123!"
    async for db in get_db():
        user = User(
            username=f"deact_{tag}",
            email=f"deact_{tag}@hospital.org",
            hashed_password=hash_password(raw_pass),
            role="ROLE_PATIENT",
            is_active=0,  # Deactivated
        )
        db.add(user)
        await db.commit()
        break

    resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/auth/login",
        json={"username_or_email": f"deact_{tag}", "password": raw_pass},
    )
    assert resp.status_code == 403
    problem = resp.json()
    assert problem["status"] == 403
    assert problem["code"] == "ACCOUNT_DEACTIVATED"


# ==============================================================================
# 3. JWT ACCESS TOKEN VERIFICATION
# ==============================================================================

@pytest.mark.asyncio
async def test_jwt_valid_access_me(async_client):
    """Verify GET /auth/me returns identity and verified permissions using bearer token."""
    tag = uid()
    raw_pass = "AlphaPass123!"
    async for db in get_db():
        user = User(
            username=f"me_{tag}",
            email=f"me_{tag}@hospital.org",
            hashed_password=hash_password(raw_pass),
            role="ROLE_SUPER_USER",
            is_active=1,
        )
        db.add(user)
        await db.commit()
        user_id = user.id
        break

    # Issue access token
    token = create_access_token(user_id=user_id, username=f"me_{tag}", role="ROLE_SUPER_USER")

    resp = await async_client.get(
        f"{settings.API_V1_PREFIX}/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["username"] == f"me_{tag}"
    assert data["role"] == "ROLE_SUPER_USER"
    assert data["is_active"] is True
    # Super User receives all 15 operational scopes
    assert len(data["permissions"]) == 15


@pytest.mark.asyncio
async def test_jwt_expired_token(async_client):
    """Verify expired JWT is rejected with HTTP 401."""
    tag = uid()
    # Create token expired 5 minutes ago
    expired_token = create_access_token(
        user_id=1,
        username=f"exp_{tag}",
        role="ROLE_PATIENT",
        expires_delta=timedelta(minutes=-5),
    )

    resp = await async_client.get(
        f"{settings.API_V1_PREFIX}/auth/me",
        headers={"Authorization": f"Bearer {expired_token}"},
    )
    assert resp.status_code == 401
    problem = resp.json()
    assert problem["code"] == "INVALID_TOKEN"


@pytest.mark.asyncio
async def test_jwt_invalid_signature(async_client):
    """Verify token signed with wrong secret key is rejected with HTTP 401."""
    tampered_token = jwt.encode(
        {"sub": "1", "username": "attacker", "role": "ROLE_SUPER_USER", "type": "access", "exp": datetime.now(timezone.utc) + timedelta(minutes=15)},
        "wrong_secret_key_12345678901234567890",
        algorithm="HS256",
    )

    resp = await async_client.get(
        f"{settings.API_V1_PREFIX}/auth/me",
        headers={"Authorization": f"Bearer {tampered_token}"},
    )
    assert resp.status_code == 401
    problem = resp.json()
    assert problem["code"] == "INVALID_TOKEN"


@pytest.mark.asyncio
async def test_jwt_inactive_account_rejection(async_client):
    """Verify that if an account is soft-deactivated, its existing valid JWT is immediately rejected."""
    tag = uid()
    raw_pass = "AlphaPass123!"
    async for db in get_db():
        user = User(
            username=f"lockout_{tag}",
            email=f"lockout_{tag}@hospital.org",
            hashed_password=hash_password(raw_pass),
            role="ROLE_RECEPTIONIST",
            is_active=1,
        )
        db.add(user)
        await db.commit()
        user_id = user.id
        break

    # Generate token while active
    token = create_access_token(user_id=user_id, username=f"lockout_{tag}", role="ROLE_RECEPTIONIST")

    # Now deactivate account in database (live DB check simulation)
    async for db in get_db():
        target = await db.get(User, user_id)
        target.is_active = 0
        await db.commit()
        break

    # Request with unexpired token must be rejected with 403 ACCOUNT_DEACTIVATED
    resp = await async_client.get(
        f"{settings.API_V1_PREFIX}/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403
    problem = resp.json()
    assert problem["code"] == "ACCOUNT_DEACTIVATED"


# ==============================================================================
# 4. REFRESH TOKEN LIFECYCLE & THEFT DETECTION
# ==============================================================================

@pytest.mark.asyncio
async def test_refresh_token_rotation_and_csrf_defense(async_client):
    """Verify refresh rotation issues new token, old hash is revoked, and CSRF header is required."""
    tag = uid()
    raw_pass = "AlphaPass123!"
    async for db in get_db():
        user = User(
            username=f"rot_{tag}",
            email=f"rot_{tag}@hospital.org",
            hashed_password=hash_password(raw_pass),
            role="ROLE_RECEPTIONIST",
            is_active=1,
        )
        db.add(user)
        await db.commit()
        break

    # 1. Login to get initial refresh cookie
    login_resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/auth/login",
        json={"username_or_email": f"rot_{tag}", "password": raw_pass},
    )
    assert login_resp.status_code == 200
    initial_cookie = login_resp.cookies[settings.REFRESH_COOKIE_NAME]
    csrf_token = login_resp.json()["csrf_token"]
    assert csrf_token is not None

    # 2. Refresh without CSRF header -> Must fail with 403
    csrf_fail_resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/auth/refresh",
        cookies={settings.REFRESH_COOKIE_NAME: initial_cookie},
    )
    assert csrf_fail_resp.status_code == 403
    assert csrf_fail_resp.json()["code"] == "CSRF_VALIDATION_FAILED"

    # 2b. Refresh with invalid CSRF token -> Must fail with 403
    csrf_bad_resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/auth/refresh",
        cookies={settings.REFRESH_COOKIE_NAME: initial_cookie},
        headers={"X-Requested-With": "XMLHttpRequest", "X-CSRF-Token": "invalid_forged_csrf_token_123"},
    )
    assert csrf_bad_resp.status_code == 403
    assert csrf_bad_resp.json()["code"] == "CSRF_VALIDATION_FAILED"

    # 3. Refresh with valid CSRF header and token -> Must succeed with rotated cookie
    refresh_resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/auth/refresh",
        cookies={settings.REFRESH_COOKIE_NAME: initial_cookie},
        headers={"X-Requested-With": "XMLHttpRequest", "X-CSRF-Token": csrf_token},
    )
    assert refresh_resp.status_code == 200
    data = refresh_resp.json()
    assert "access_token" in data
    assert "csrf_token" in data
    assert data["csrf_token"] != csrf_token

    # Rotated cookie must be different from initial cookie
    rotated_cookie = refresh_resp.cookies[settings.REFRESH_COOKIE_NAME]
    assert rotated_cookie != initial_cookie

    # 4. Verify initial token hash is now stored in revoked_tokens table
    async for db in get_db():
        initial_hash = hash_token(initial_cookie)
        chk = (
            await db.execute(select(RevokedToken).where(RevokedToken.token_hash == initial_hash))
        ).scalar_one_or_none()
        assert chk is not None
        break


@pytest.mark.asyncio
async def test_refresh_token_reuse_theft_detection(async_client):
    """Verify presenting an already-revoked refresh token triggers token theft detection and 401."""
    tag = uid()
    raw_pass = "AlphaPass123!"
    async for db in get_db():
        user = User(
            username=f"theft_{tag}",
            email=f"theft_{tag}@hospital.org",
            hashed_password=hash_password(raw_pass),
            role="ROLE_PATIENT",
            is_active=1,
        )
        db.add(user)
        await db.commit()
        break

    # Login
    login_resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/auth/login",
        json={"username_or_email": f"theft_{tag}", "password": raw_pass},
    )
    stolen_token = login_resp.cookies[settings.REFRESH_COOKIE_NAME]
    csrf_token = login_resp.json()["csrf_token"]

    # Legitimate user rotates token
    legit_refresh = await async_client.post(
        f"{settings.API_V1_PREFIX}/auth/refresh",
        cookies={settings.REFRESH_COOKIE_NAME: stolen_token},
        headers={"X-Requested-With": "XMLHttpRequest", "X-CSRF-Token": csrf_token},
    )
    assert legit_refresh.status_code == 200

    # Attacker tries to replay the old stolen_token
    theft_resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/auth/refresh",
        cookies={settings.REFRESH_COOKIE_NAME: stolen_token},
        headers={"X-Requested-With": "XMLHttpRequest", "X-CSRF-Token": csrf_token},
    )
    assert theft_resp.status_code == 401
    problem = theft_resp.json()
    assert problem["code"] == "TOKEN_REUSED_ALERT"
    assert "reuse detected" in problem["detail"].lower()


@pytest.mark.asyncio
async def test_logout_revokes_token_and_clears_cookie(async_client):
    """Verify logout persists token hash in revoked_tokens and clears cookie."""
    tag = uid()
    raw_pass = "AlphaPass123!"
    async for db in get_db():
        user = User(
            username=f"logout_{tag}",
            email=f"logout_{tag}@hospital.org",
            hashed_password=hash_password(raw_pass),
            role="ROLE_PATIENT",
            is_active=1,
        )
        db.add(user)
        await db.commit()
        break

    # Login
    login_resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/auth/login",
        json={"username_or_email": f"logout_{tag}", "password": raw_pass},
    )
    access_token = login_resp.json()["access_token"]
    cookie_token = login_resp.cookies[settings.REFRESH_COOKIE_NAME]
    csrf_token = login_resp.json()["csrf_token"]

    # Logout
    logout_resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/auth/logout",
        headers={"Authorization": f"Bearer {access_token}"},
        cookies={settings.REFRESH_COOKIE_NAME: cookie_token},
    )
    assert logout_resp.status_code == 200

    # Subsequent refresh with that cookie must fail as revoked
    refresh_fail = await async_client.post(
        f"{settings.API_V1_PREFIX}/auth/refresh",
        cookies={settings.REFRESH_COOKIE_NAME: cookie_token},
        headers={"X-Requested-With": "XMLHttpRequest", "X-CSRF-Token": csrf_token},
    )
    assert refresh_fail.status_code == 401


# ==============================================================================
# 5. PASSWORD RESET WORKFLOW TESTS
# ==============================================================================

@pytest.mark.asyncio
async def test_password_reset_workflow(async_client):
    """Verify single-use reset token updates password and cannot be reused."""
    tag = uid()
    raw_pass = "OldPassword123!"
    new_pass = "NewPassword456#"
    user_email = f"reset_{tag}@hospital.org"

    async for db in get_db():
        user = User(
            username=f"reset_{tag}",
            email=user_email,
            hashed_password=hash_password(raw_pass),
            role="ROLE_PATIENT",
            is_active=1,
        )
        db.add(user)
        await db.commit()
        user_id = user.id
        break

    # Request reset token - MUST NOT leak token in public response
    req_resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/auth/password-reset-request",
        json={"email": user_email},
    )
    assert req_resp.status_code == 200
    assert req_resp.json()["detail"] is None

    # Generate valid reset token out-of-band for confirmation test
    token_str = create_password_reset_token(user_id)

    # Confirm password reset with new password
    conf_resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/auth/password-reset-confirm",
        json={"token": token_str, "new_password": new_pass},
    )
    assert conf_resp.status_code == 200

    # Reusing the reset token must be rejected
    reuse_resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/auth/password-reset-confirm",
        json={"token": token_str, "new_password": "AnotherPassword789!"},
    )
    assert reuse_resp.status_code == 401

    # Login with old password must fail
    old_login = await async_client.post(
        f"{settings.API_V1_PREFIX}/auth/login",
        json={"username_or_email": f"reset_{tag}", "password": raw_pass},
    )
    assert old_login.status_code == 401

    # Login with new password must succeed
    new_login = await async_client.post(
        f"{settings.API_V1_PREFIX}/auth/login",
        json={"username_or_email": f"reset_{tag}", "password": new_pass},
    )
    assert new_login.status_code == 200


# ==============================================================================
# 6. ROLE AND DYNAMIC SCOPE ENFORCEMENT TESTS
# ==============================================================================

@pytest.mark.asyncio
async def test_super_user_access_all(async_client):
    """Verify Super User possesses unrestricted operational access."""
    tag = uid()
    async for db in get_db():
        su = User(
            username=f"su_{tag}",
            email=f"su_{tag}@hospital.org",
            hashed_password=hash_password("SuperSecret123!"),
            role="ROLE_SUPER_USER",
            is_active=1,
        )
        db.add(su)
        await db.commit()
        su_id = su.id
        break

    token = create_access_token(user_id=su_id, username=f"su_{tag}", role="ROLE_SUPER_USER")

    # Super-only endpoint
    r1 = await async_client.get(
        f"{settings.API_V1_PREFIX}/test-rbac/super-only",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r1.status_code == 200

    # Scope-protected endpoint
    r2 = await async_client.get(
        f"{settings.API_V1_PREFIX}/test-rbac/records-view",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r2.status_code == 200


@pytest.mark.asyncio
async def test_assistant_admin_denied_by_default_and_live_grant_revocation(async_client):
    """Verify Assistant Admin is denied by default until granted, and revocation takes immediate effect."""
    tag = uid()
    async for db in get_db():
        su = User(
            username=f"su_mgr_{tag}",
            email=f"su_mgr_{tag}@hospital.org",
            hashed_password=hash_password("SuperPass123!"),
            role="ROLE_SUPER_USER",
            is_active=1,
        )
        aa = User(
            username=f"aa_{tag}",
            email=f"aa_{tag}@hospital.org",
            hashed_password=hash_password("AsstPass123!"),
            role="ROLE_ASSISTANT_ADMIN",
            is_active=1,
        )
        db.add_all([su, aa])
        await db.commit()
        su_user, aa_user = su, aa
        aa_id = aa.id
        break

    aa_token = create_access_token(user_id=aa_id, username=f"aa_{tag}", role="ROLE_ASSISTANT_ADMIN")

    # 1. Initially NOT granted 'records:view_all' -> Must be DENIED (HTTP 403)
    denied_resp = await async_client.get(
        f"{settings.API_V1_PREFIX}/test-rbac/records-view",
        headers={"Authorization": f"Bearer {aa_token}"},
    )
    assert denied_resp.status_code == 403
    assert denied_resp.json()["code"] == "SCOPE_PERMISSION_DENIED"

    # 2. Super User grants 'records:view_all' in database
    async for db in get_db():
        su_ref = await db.get(User, su_user.id)
        aa_ref = await db.get(User, aa_id)
        await grant_permission_scope(db, su_ref, aa_ref, "records:view_all")
        await db.commit()
        break

    # 3. Same token now immediately SUCCEEDS without requiring a new token
    granted_resp = await async_client.get(
        f"{settings.API_V1_PREFIX}/test-rbac/records-view",
        headers={"Authorization": f"Bearer {aa_token}"},
    )
    assert granted_resp.status_code == 200

    # 4. Super User revokes 'records:view_all' in database
    async for db in get_db():
        su_ref = await db.get(User, su_user.id)
        aa_ref = await db.get(User, aa_id)
        await revoke_permission_scope(db, su_ref, aa_ref, "records:view_all")
        await db.commit()
        break

    # 5. Same token is now IMMEDIATELY DENIED again (proving live DB verification)
    revoked_resp = await async_client.get(
        f"{settings.API_V1_PREFIX}/test-rbac/records-view",
        headers={"Authorization": f"Bearer {aa_token}"},
    )
    assert revoked_resp.status_code == 403
    assert revoked_resp.json()["code"] == "SCOPE_PERMISSION_DENIED"


@pytest.mark.asyncio
async def test_patient_and_receptionist_role_boundaries(async_client):
    """Verify Patient cannot access staff endpoints and Receptionist cannot access super-only endpoints."""
    tag = uid()
    async for db in get_db():
        pat = User(
            username=f"p_{tag}",
            email=f"p_{tag}@hospital.org",
            hashed_password=hash_password("PassWord123!"),
            role="ROLE_PATIENT",
            is_active=1,
        )
        rec = User(
            username=f"r_{tag}",
            email=f"r_{tag}@hospital.org",
            hashed_password=hash_password("PassWord123!"),
            role="ROLE_RECEPTIONIST",
            is_active=1,
        )
        db.add_all([pat, rec])
        await db.commit()
        pat_id, rec_id = pat.id, rec.id
        break

    pat_token = create_access_token(user_id=pat_id, username=f"p_{tag}", role="ROLE_PATIENT")
    rec_token = create_access_token(user_id=rec_id, username=f"r_{tag}", role="ROLE_RECEPTIONIST")

    # Patient accessing staff scope -> 403
    pat_denied = await async_client.get(
        f"{settings.API_V1_PREFIX}/test-rbac/desk-registration",
        headers={"Authorization": f"Bearer {pat_token}"},
    )
    assert pat_denied.status_code == 403

    # Receptionist accessing desk registration -> 200 (Default Receptionist scope)
    rec_allowed = await async_client.get(
        f"{settings.API_V1_PREFIX}/test-rbac/desk-registration",
        headers={"Authorization": f"Bearer {rec_token}"},
    )
    assert rec_allowed.status_code == 200

    # Receptionist accessing Super User only endpoint -> 403
    rec_denied = await async_client.get(
        f"{settings.API_V1_PREFIX}/test-rbac/super-only",
        headers={"Authorization": f"Bearer {rec_token}"},
    )
    assert rec_denied.status_code == 403


# ==============================================================================
# 8. TASK 3 SECURITY AUDIT & VERIFICATION TESTS
# ==============================================================================

@pytest.mark.asyncio
async def test_patient_self_registration_workflow(async_client):
    """Verify patient self-registration endpoint, duplicate prevention, and subsequent login."""
    tag = uid()
    reg_payload = {
        "username": f"self_{tag}",
        "email": f"self_{tag}@example.com",
        "password": "Password123!",
        "full_name": f"Jane Doe {tag}",
        "date_of_birth": "1992-06-15",
        "gender": "Female",
        "primary_mobile": "+15551234567",
        "blood_group": "A+",
    }

    # 1. Successful patient registration
    resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/auth/register",
        json=reg_payload,
    )
    assert resp.status_code == 201
    assert "created successfully" in resp.json()["message"]

    # 2. Duplicate registration attempt -> 409 Conflict
    dup_resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/auth/register",
        json=reg_payload,
    )
    assert dup_resp.status_code == 409
    assert dup_resp.json()["code"] == "USER_ALREADY_EXISTS"

    # 3. Authenticate with the newly registered credentials
    login_resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/auth/login",
        json={
            "username_or_email": f"self_{tag}",
            "password": "Password123!",
        },
    )
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]
    assert login_resp.json()["role"] == "ROLE_PATIENT"

    # 4. Access /me profile
    me_resp = await async_client.get(
        f"{settings.API_V1_PREFIX}/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert me_resp.status_code == 200
    assert me_resp.json()["username"] == f"self_{tag}"
    assert me_resp.json()["role"] == "ROLE_PATIENT"


@pytest.mark.asyncio
async def test_concurrent_refresh_requests_same_token(async_client):
    """Verify concurrent refresh requests using the exact same refresh token handle race conditions gracefully."""
    tag = uid()
    raw_pass = "SecurePass123!"
    async for db in get_db():
        user = User(
            username=f"race_{tag}",
            email=f"race_{tag}@hospital.org",
            hashed_password=hash_password(raw_pass),
            role="ROLE_RECEPTIONIST",
            is_active=1,
        )
        db.add(user)
        await db.commit()
        break

    login_resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/auth/login",
        json={"username_or_email": f"race_{tag}", "password": raw_pass},
    )
    assert login_resp.status_code == 200
    cookie_token = login_resp.cookies[settings.REFRESH_COOKIE_NAME]
    csrf_token = login_resp.json()["csrf_token"]

    # Launch two simultaneous refresh requests presenting the identical token and CSRF secret
    res1, res2 = await asyncio.gather(
        async_client.post(
            f"{settings.API_V1_PREFIX}/auth/refresh",
            cookies={settings.REFRESH_COOKIE_NAME: cookie_token},
            headers={"X-Requested-With": "XMLHttpRequest", "X-CSRF-Token": csrf_token},
        ),
        async_client.post(
            f"{settings.API_V1_PREFIX}/auth/refresh",
            cookies={settings.REFRESH_COOKIE_NAME: cookie_token},
            headers={"X-Requested-With": "XMLHttpRequest", "X-CSRF-Token": csrf_token},
        ),
    )

    statuses = {res1.status_code, res2.status_code}
    # One request must succeed (200), and the concurrent duplicate must be rejected (401)
    assert 200 in statuses
    assert 401 in statuses


@pytest.mark.asyncio
async def test_refresh_token_reuse_after_rotation(async_client):
    """Verify presenting a consumed token after successful rotation is detected as replay theft."""
    tag = uid()
    raw_pass = "SecurePass123!"
    async for db in get_db():
        user = User(
            username=f"replay_{tag}",
            email=f"replay_{tag}@hospital.org",
            hashed_password=hash_password(raw_pass),
            role="ROLE_PATIENT",
            is_active=1,
        )
        db.add(user)
        await db.commit()
        break

    login_resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/auth/login",
        json={"username_or_email": f"replay_{tag}", "password": raw_pass},
    )
    first_cookie = login_resp.cookies[settings.REFRESH_COOKIE_NAME]
    first_csrf = login_resp.json()["csrf_token"]

    # 1. Rotate first time -> 200
    rot_resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/auth/refresh",
        cookies={settings.REFRESH_COOKIE_NAME: first_cookie},
        headers={"X-Requested-With": "XMLHttpRequest", "X-CSRF-Token": first_csrf},
    )
    assert rot_resp.status_code == 200
    second_cookie = rot_resp.cookies[settings.REFRESH_COOKIE_NAME]
    second_csrf = rot_resp.json()["csrf_token"]

    # 2. Replay first (now revoked) token -> 401 TOKEN_REUSED_ALERT
    replay_resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/auth/refresh",
        cookies={settings.REFRESH_COOKIE_NAME: first_cookie},
        headers={"X-Requested-With": "XMLHttpRequest", "X-CSRF-Token": first_csrf},
    )
    assert replay_resp.status_code == 401
    assert replay_resp.json()["code"] == "TOKEN_REUSED_ALERT"

    # 3. Because theft was detected, the second (active) session is also invalidated
    theft_inval_resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/auth/refresh",
        cookies={settings.REFRESH_COOKIE_NAME: second_cookie},
        headers={"X-Requested-With": "XMLHttpRequest", "X-CSRF-Token": second_csrf},
    )
    assert theft_inval_resp.status_code == 401


@pytest.mark.asyncio
async def test_password_reset_token_reuse(async_client):
    """Verify single-use password reset token cannot be reused a second time."""
    tag = uid()
    raw_pass = "InitialPass123!"
    async for db in get_db():
        user = User(
            username=f"pr_reuse_{tag}",
            email=f"pr_reuse_{tag}@hospital.org",
            hashed_password=hash_password(raw_pass),
            role="ROLE_PATIENT",
            is_active=1,
        )
        db.add(user)
        await db.commit()
        user_id = user.id
        break

    reset_token = create_password_reset_token(user_id)

    # First reset succeeds
    resp1 = await async_client.post(
        f"{settings.API_V1_PREFIX}/auth/password-reset-confirm",
        json={"token": reset_token, "new_password": "NewValidPass456#"},
    )
    assert resp1.status_code == 200

    # Second reset with identical token fails
    resp2 = await async_client.post(
        f"{settings.API_V1_PREFIX}/auth/password-reset-confirm",
        json={"token": reset_token, "new_password": "AnotherValidPass789$"},
    )
    assert resp2.status_code == 401
    assert resp2.json()["code"] == "INVALID_TOKEN"
    assert "already been used" in resp2.json()["detail"].lower()


@pytest.mark.asyncio
async def test_password_reset_invalidating_all_sessions(async_client):
    """Verify that completing a password reset invalidates all outstanding active refresh sessions."""
    tag = uid()
    old_pass = "OldSessionPass123!"
    new_pass = "NewSessionPass456#"
    async for db in get_db():
        user = User(
            username=f"pr_inval_{tag}",
            email=f"pr_inval_{tag}@hospital.org",
            hashed_password=hash_password(old_pass),
            role="ROLE_PATIENT",
            is_active=1,
        )
        db.add(user)
        await db.commit()
        user_id = user.id
        break

    # Login to obtain an active refresh session
    login_resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/auth/login",
        json={"username_or_email": f"pr_inval_{tag}", "password": old_pass},
    )
    assert login_resp.status_code == 200
    active_refresh = login_resp.cookies[settings.REFRESH_COOKIE_NAME]
    csrf_token = login_resp.json()["csrf_token"]

    # Execute password reset
    reset_token = create_password_reset_token(user_id)
    conf_resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/auth/password-reset-confirm",
        json={"token": reset_token, "new_password": new_pass},
    )
    assert conf_resp.status_code == 200

    # The active refresh session issued before password reset MUST now be rejected
    stale_refresh = await async_client.post(
        f"{settings.API_V1_PREFIX}/auth/refresh",
        cookies={settings.REFRESH_COOKIE_NAME: active_refresh},
        headers={"X-Requested-With": "XMLHttpRequest", "X-CSRF-Token": csrf_token},
    )
    assert stale_refresh.status_code == 401
    assert "terminated" in stale_refresh.json()["detail"].lower() or "revoked" in stale_refresh.json()["detail"].lower()


@pytest.mark.asyncio
async def test_refresh_session_revocation_survives_restart(async_client):
    """Verify token revocation persists in the SQLite database and survives new sessions."""
    tag = uid()
    raw_pass = "RestartPass123!"
    async for db in get_db():
        user = User(
            username=f"restart_{tag}",
            email=f"restart_{tag}@hospital.org",
            hashed_password=hash_password(raw_pass),
            role="ROLE_PATIENT",
            is_active=1,
        )
        db.add(user)
        await db.commit()
        break

    login_resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/auth/login",
        json={"username_or_email": f"restart_{tag}", "password": raw_pass},
    )
    access_token = login_resp.json()["access_token"]
    cookie_token = login_resp.cookies[settings.REFRESH_COOKIE_NAME]
    csrf_token = login_resp.json()["csrf_token"]

    # Logout to revoke
    logout_resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/auth/logout",
        headers={"Authorization": f"Bearer {access_token}"},
        cookies={settings.REFRESH_COOKIE_NAME: cookie_token},
    )
    assert logout_resp.status_code == 200

    # Query directly in a brand new isolated DB session to verify disk persistence
    async for db in get_db():
        token_hash = hash_token(cookie_token)
        stmt = select(RevokedToken).where(RevokedToken.token_hash == token_hash)
        row = (await db.execute(stmt)).scalar_one_or_none()
        assert row is not None
        assert row.token_hash == token_hash
        break

    # Subsequent refresh in client fails
    fail_resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/auth/refresh",
        cookies={settings.REFRESH_COOKIE_NAME: cookie_token},
        headers={"X-Requested-With": "XMLHttpRequest", "X-CSRF-Token": csrf_token},
    )
    assert fail_resp.status_code == 401


@pytest.mark.asyncio
async def test_assistant_admin_self_permission_escalation_blocked(async_client):
    """Verify Assistant Administrators cannot grant permissions to themselves or anyone else."""
    tag = uid()
    raw_pass = "Pass123!Safe"
    async for db in get_db():
        aa = User(
            username=f"aa_esc_{tag}",
            email=f"aa_esc_{tag}@hospital.org",
            hashed_password=hash_password(raw_pass),
            role="ROLE_ASSISTANT_ADMIN",
            is_active=1,
        )
        db.add(aa)
        await db.commit()

        # Attempt to grant permission as Assistant Administrator (acting actor)
        with pytest.raises(Exception) as exc_info:
            await grant_permission_scope(
                db=db,
                super_user=aa,  # Non-super user
                target_user=aa,
                scope_name="audit:view_logs",
            )
        assert "Only Super Users are authorized" in str(exc_info.value)
        break


@pytest.mark.asyncio
async def test_csrf_token_failure_cases(async_client):
    """Verify missing, invalid, and mismatched CSRF tokens are rejected."""
    tag = uid()
    raw_pass = "CsrfPass123!"
    async for db in get_db():
        user = User(
            username=f"csrf_test_{tag}",
            email=f"csrf_test_{tag}@hospital.org",
            hashed_password=hash_password(raw_pass),
            role="ROLE_PATIENT",
            is_active=1,
        )
        db.add(user)
        await db.commit()
        break

    login_resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/auth/login",
        json={"username_or_email": f"csrf_test_{tag}", "password": raw_pass},
    )
    cookie_token = login_resp.cookies[settings.REFRESH_COOKIE_NAME]
    valid_csrf = login_resp.json()["csrf_token"]

    # Case 1: Missing X-Requested-With
    res1 = await async_client.post(
        f"{settings.API_V1_PREFIX}/auth/refresh",
        cookies={settings.REFRESH_COOKIE_NAME: cookie_token},
        headers={"X-CSRF-Token": valid_csrf},
    )
    assert res1.status_code == 403
    assert res1.json()["code"] == "CSRF_VALIDATION_FAILED"

    # Case 2: Missing X-CSRF-Token
    res2 = await async_client.post(
        f"{settings.API_V1_PREFIX}/auth/refresh",
        cookies={settings.REFRESH_COOKIE_NAME: cookie_token},
        headers={"X-Requested-With": "XMLHttpRequest"},
    )
    assert res2.status_code == 403
    assert res2.json()["code"] == "CSRF_VALIDATION_FAILED"

    # Case 3: Mismatched / forged X-CSRF-Token
    res3 = await async_client.post(
        f"{settings.API_V1_PREFIX}/auth/refresh",
        cookies={settings.REFRESH_COOKIE_NAME: cookie_token},
        headers={"X-Requested-With": "XMLHttpRequest", "X-CSRF-Token": "forged_random_csrf_token_value_32_bytes"},
    )
    assert res3.status_code == 403
    assert res3.json()["code"] == "CSRF_VALIDATION_FAILED"

    # Case 4: Valid headers match -> Success
    res4 = await async_client.post(
        f"{settings.API_V1_PREFIX}/auth/refresh",
        cookies={settings.REFRESH_COOKIE_NAME: cookie_token},
        headers={"X-Requested-With": "XMLHttpRequest", "X-CSRF-Token": valid_csrf},
    )
    assert res4.status_code == 200


@pytest.mark.asyncio
async def test_password_reset_response_and_log_redaction(async_client):
    """Verify password reset never leaks tokens in responses and audit logs strictly redact credentials."""
    tag = uid()
    raw_pass = "RedactPass123!"
    user_email = f"redact_{tag}@hospital.org"

    async for db in get_db():
        user = User(
            username=f"redact_{tag}",
            email=user_email,
            hashed_password=hash_password(raw_pass),
            role="ROLE_PATIENT",
            is_active=1,
        )
        db.add(user)
        await db.commit()
        user_id = user.id
        break

    # 1. Existing user: response detail MUST be None (no token leaked in public response)
    res_exist = await async_client.post(
        f"{settings.API_V1_PREFIX}/auth/password-reset-request",
        json={"email": user_email},
    )
    assert res_exist.status_code == 200
    assert res_exist.json()["detail"] is None
    assert "If the email is registered" in res_exist.json()["message"]

    # 2. Non-existent user: response MUST be indistinguishable (no account enumeration)
    res_nonexist = await async_client.post(
        f"{settings.API_V1_PREFIX}/auth/password-reset-request",
        json={"email": f"nonexistent_{tag}@hospital.org"},
    )
    assert res_nonexist.status_code == 200
    assert res_nonexist.json()["detail"] is None
    assert res_nonexist.json()["message"] == res_exist.json()["message"]

    # 3. Check audit log in DB: ensure no plaintext passwords or raw tokens are stored
    async for db in get_db():
        stmt = (
            select(AuditEvent)
            .where(
                AuditEvent.actor_user_id == user_id,
                AuditEvent.action_type == "PASSWORD_RESET_REQUESTED",
            )
        )
        event = (await db.execute(stmt)).scalar_one_or_none()
        assert event is not None
        if event.metadata_json:
            assert raw_pass not in event.metadata_json
            assert "eyJ" not in event.metadata_json  # No JWT prefix
        break

