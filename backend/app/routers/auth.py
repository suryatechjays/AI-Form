"""FastAPI Router implementing AEGIS authentication, token rotation, and password reset endpoints."""

from typing import Optional
from fastapi import APIRouter, Cookie, Depends, Header, Request, Response, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.exceptions import TokenRevokedOrExpiredException, TokenTheftException
from app.database import get_db
from app.dependencies import (
    get_correlation_id,
    get_current_user,
    verify_csrf_refresh,
)
from app.models.user import User
from app.schemas.auth import (
    LoginRequest,
    MessageResponse,
    PasswordResetConfirmRequest,
    PasswordResetRequest,
    RegisterPatientRequest,
    TokenResponse,
    UserMeResponse,
)
from app.services.auth_service import (
    authenticate_user,
    confirm_password_reset,
    initiate_password_reset,
    issue_tokens,
    logout_user,
    register_patient_account,
    rotate_refresh_token,
)
from app.services.permission_service import get_user_effective_permissions

router = APIRouter(prefix="/auth", tags=["Authentication"])
settings = get_settings()


@router.post(
    "/login",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
    summary="User Login",
    description="Authenticates credentials and returns a short-lived JWT access token while setting a secure refresh cookie.",
)
async def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("User-Agent")

    user = await authenticate_user(
        db=db,
        username_or_email=payload.username_or_email,
        password=payload.password,
        client_ip=client_ip,
        user_agent=user_agent,
    )
    token_resp, raw_refresh = await issue_tokens(user)

    # Set HttpOnly, SameSite=Strict cookie for refresh token
    response.set_cookie(
        key=settings.REFRESH_COOKIE_NAME,
        value=raw_refresh,
        httponly=True,
        secure=settings.REFRESH_COOKIE_SECURE,
        samesite=settings.REFRESH_COOKIE_SAMESITE,
        path=settings.REFRESH_COOKIE_PATH,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
    )
    await db.commit()
    return token_resp


@router.post(
    "/refresh",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
    summary="Access Token Refresh with Rotation",
    description="Rotates the single-use refresh token from cookie and issues a brand-new access token and rotated refresh cookie.",
    dependencies=[Depends(verify_csrf_refresh)],
)
async def refresh_token(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("User-Agent")
    csrf_token = request.headers.get(settings.CSRF_TOKEN_HEADER_NAME)

    # Read refresh cookie
    cookie_token = request.cookies.get(settings.REFRESH_COOKIE_NAME)
    if not cookie_token:
        # Fallback to alternate cookie name if configured
        cookie_token = request.cookies.get("__Host-aegis-refresh")

    if not cookie_token:
        raise TokenRevokedOrExpiredException("Refresh token cookie is missing.")

    try:
        new_token_resp, new_raw_refresh = await rotate_refresh_token(
            db=db,
            raw_token=cookie_token,
            csrf_token=csrf_token,
            client_ip=client_ip,
            user_agent=user_agent,
        )

        # Commit rotation
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise TokenTheftException("Concurrent duplicate token presentation detected.")

    # Re-issue rotated cookie
    response.set_cookie(
        key=settings.REFRESH_COOKIE_NAME,
        value=new_raw_refresh,
        httponly=True,
        secure=settings.REFRESH_COOKIE_SECURE,
        samesite=settings.REFRESH_COOKIE_SAMESITE,
        path=settings.REFRESH_COOKIE_PATH,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
    )
    return new_token_resp


@router.post(
    "/logout",
    response_model=MessageResponse,
    status_code=status.HTTP_200_OK,
    summary="Session Termination (Logout)",
    description="Revokes current refresh token, terminates session in database, and clears refresh cookie.",
)
async def logout(
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("User-Agent")
    cookie_token = request.cookies.get(settings.REFRESH_COOKIE_NAME) or request.cookies.get(
        "__Host-aegis-refresh"
    )

    await logout_user(
        db=db,
        raw_token=cookie_token,
        current_user=current_user,
        client_ip=client_ip,
        user_agent=user_agent,
    )

    # Clear cookie
    response.delete_cookie(
        key=settings.REFRESH_COOKIE_NAME,
        path=settings.REFRESH_COOKIE_PATH,
    )
    await db.commit()
    return MessageResponse(message="Successfully logged out. Session terminated.")


@router.get(
    "/me",
    response_model=UserMeResponse,
    status_code=status.HTTP_200_OK,
    summary="Current Authenticated User Profile",
    description="Returns authenticated user identity and dynamically verified active permission scopes from live database.",
)
async def get_current_user_profile(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserMeResponse:
    permissions = await get_user_effective_permissions(db, current_user)
    return UserMeResponse(
        id=current_user.id,
        username=current_user.username,
        email=current_user.email,
        role=current_user.role,
        is_active=bool(current_user.is_active == 1),
        created_at=current_user.created_at,
        permissions=permissions,
    )


@router.post(
    "/password-reset-request",
    response_model=MessageResponse,
    status_code=status.HTTP_200_OK,
    summary="Initiate Password Reset",
    description="Generates a single-use 15-minute password reset token.",
)
async def request_password_reset(
    payload: PasswordResetRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("User-Agent")

    await initiate_password_reset(
        db=db,
        email=str(payload.email),
        client_ip=client_ip,
        user_agent=user_agent,
    )
    await db.commit()

    return MessageResponse(
        message="If the email is registered, a password reset token has been issued.",
        detail=None,
    )


@router.post(
    "/password-reset-confirm",
    response_model=MessageResponse,
    status_code=status.HTTP_200_OK,
    summary="Confirm Password Reset",
    description="Validates single-use token, updates password hash in database, and invalidates reset token.",
)
async def confirm_reset(
    payload: PasswordResetConfirmRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("User-Agent")

    await confirm_password_reset(
        db=db,
        token=payload.token,
        new_password=payload.new_password,
        client_ip=client_ip,
        user_agent=user_agent,
    )
    await db.commit()
    return MessageResponse(
        message="Password has been reset successfully. All active sessions have been invalidated."
    )


@router.post(
    "/register",
    response_model=MessageResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Patient Self-Registration",
    description="Registers a new patient account with coupled login user and master clinical profile.",
)
async def register_patient(
    payload: RegisterPatientRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("User-Agent")

    user, patient = await register_patient_account(
        db=db,
        req=payload,
        client_ip=client_ip,
        user_agent=user_agent,
    )
    await db.commit()
    return MessageResponse(
        message=f"Patient account '{user.username}' created successfully with identifier '{patient.patient_id}'."
    )

