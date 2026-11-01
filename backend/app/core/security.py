"""Cryptographic security utilities: Argon2id hashing, JWT access/refresh tokens, and token hashing."""

from datetime import datetime, timedelta, timezone
import hashlib
import re
import secrets
from typing import Any, Dict, List, Optional
import uuid

import argon2
from argon2 import PasswordHasher
import jwt

from app.config import get_settings
from app.core.exceptions import InvalidPasswordException, InvalidTokenException

settings = get_settings()

# Initialize Argon2id Password Hasher with statutory parameters (memory: 64MB, iterations: 3, parallelism: 4)
ph = PasswordHasher(
    time_cost=3,
    memory_cost=65536,  # 64 MB
    parallelism=4,
    hash_len=32,
    type=argon2.Type.ID,
)


def validate_password_strength(password: str) -> None:
    """Validate password complexity according to AEGIS security baseline.
    
    Rules:
    - Length between 8 and 128 characters.
    - At least one uppercase letter (A-Z).
    - At least one lowercase letter (a-z).
    - At least one numeric digit (0-9).
    - At least one special symbol.
    """
    reasons: List[str] = []
    if len(password) < 8:
        reasons.append("Password must be at least 8 characters long.")
    if len(password) > 128:
        reasons.append("Password must not exceed 128 characters.")
    if not re.search(r"[A-Z]", password):
        reasons.append("Password must contain at least one uppercase letter.")
    if not re.search(r"[a-z]", password):
        reasons.append("Password must contain at least one lowercase letter.")
    if not re.search(r"[0-9]", password):
        reasons.append("Password must contain at least one numeric digit.")
    if not re.search(r"[!@#$%^&*()_+\-=\[\]{};':\"\\|,.<>\/?]", password):
        reasons.append("Password must contain at least one special symbol.")

    if reasons:
        raise InvalidPasswordException(
            detail=" ".join(reasons),
            invalid_params=[{"name": "password", "reason": r} for r in reasons],
        )


def hash_password(password: str) -> str:
    """Hash password using Argon2id with random salt."""
    validate_password_strength(password)
    return ph.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify plaintext password against an Argon2id hash string."""
    try:
        return ph.verify(hashed_password, plain_password)
    except (argon2.exceptions.VerifyMismatchError,
            argon2.exceptions.VerificationError,
            argon2.exceptions.InvalidHashError):
        return False


def hash_token(raw_token: str) -> str:
    """Compute SHA-256 cryptographic digest of a token string for safe database persistence."""
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def create_access_token(
    user_id: int,
    username: str,
    role: str,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Generate cryptographically signed short-lived JWT access token."""
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))

    payload: Dict[str, Any] = {
        "sub": str(user_id),
        "username": username,
        "role": role,
        "type": "access",
        "exp": expire,
        "iat": now,
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> Dict[str, Any]:
    """Decode and validate a JWT access token.
    
    Raises:
        InvalidTokenException: On expired, malformed, or inappropriate token type.
    """
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
            options={"require": ["exp", "iat", "sub", "role"]},
        )
        if payload.get("type") != "access":
            raise InvalidTokenException("Invalid token type: expected access token.")
        return payload
    except jwt.ExpiredSignatureError:
        raise InvalidTokenException("Authentication token has expired.")
    except (jwt.InvalidTokenError, Exception) as exc:
        raise InvalidTokenException(f"Invalid authentication token: {str(exc)}")


def create_refresh_token(
    user_id: int,
    expires_delta: Optional[timedelta] = None,
    csrf_token: Optional[str] = None,
) -> str:
    """Generate high-entropy, cryptographically signed refresh token."""
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS))

    # Injects high-entropy random entropy along with verifiable claims
    random_entropy = secrets.token_hex(32)
    payload: Dict[str, Any] = {
        "sub": str(user_id),
        "type": "refresh",
        "entropy": random_entropy,
        "exp": expire,
        "iat": now,
        "jti": str(uuid.uuid4()),
    }
    if csrf_token:
        payload["csrf"] = hash_token(csrf_token)
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_refresh_token(token: str) -> Dict[str, Any]:
    """Decode and validate a refresh token."""
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
            options={"require": ["exp", "sub"]},
        )
        if payload.get("type") != "refresh":
            raise InvalidTokenException("Invalid token type: expected refresh token.")
        return payload
    except jwt.ExpiredSignatureError:
        raise InvalidTokenException("Refresh token has expired.")
    except (jwt.InvalidTokenError, Exception) as exc:
        raise InvalidTokenException(f"Invalid refresh token: {str(exc)}")


def create_password_reset_token(user_id: int) -> str:
    """Generate single-use 15-minute cryptographically signed password reset token."""
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES)

    payload: Dict[str, Any] = {
        "sub": str(user_id),
        "type": "password_reset",
        "exp": expire,
        "iat": now,
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_password_reset_token(token: str) -> Dict[str, Any]:
    """Decode and validate a password reset token."""
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
            options={"require": ["exp", "sub"]},
        )
        if payload.get("type") != "password_reset":
            raise InvalidTokenException("Invalid token type: expected password reset token.")
        return payload
    except jwt.ExpiredSignatureError:
        raise InvalidTokenException("Password reset token has expired.")
    except (jwt.InvalidTokenError, Exception) as exc:
        raise InvalidTokenException(f"Invalid password reset token: {str(exc)}")

