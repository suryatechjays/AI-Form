"""FastAPI Router implementing AEGIS User and Role Management APIs (Module 3.2)."""

import math
from typing import List, Optional
from fastapi import APIRouter, Depends, Query, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.user import UserCreateRequest, UserListResponse, UserResponse, UserUpdateRequest
from app.services.user_service import (
    deactivate_user,
    list_users,
    provision_user,
    toggle_user_deactivation,
    update_user_account,
)

router = APIRouter(prefix="/users", tags=["User & Role Management"])


@router.get(
    "",
    response_model=UserListResponse,
    status_code=status.HTTP_200_OK,
    summary="List User Accounts",
    description="Lists system user accounts with effective permissions under RBAC governance and server-side pagination.",
)
async def get_users(
    response: Response,
    page: Optional[int] = Query(None, ge=1, description="Page number (1-based)"),
    limit: Optional[int] = Query(None, ge=1, le=100, description="Items per page"),
    page_size: Optional[int] = Query(None, ge=1, le=100, description="Alias for limit"),
    role: Optional[str] = Query(None, description="Optional role filter (ROLE_RECEPTIONIST, etc.)"),
    status: Optional[str] = Query("active", description="Optional account status filter: 'active' (default), 'deactivated', or 'ALL'"),
    search: Optional[str] = Query(None, description="Optional search by username or email"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserListResponse:
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    eff_limit = page_size if page_size is not None else limit
    users_with_perms, total = await list_users(
        db=db,
        actor=current_user,
        page=page,
        limit=eff_limit,
        role_filter=role,
        status_filter=status,
        search=search,
    )
    items = []
    for u, perms in users_with_perms:
        p_name = None
        if hasattr(u, "patient") and u.patient and u.patient.full_name:
            p_name = u.patient.full_name
        elif u.username == "admin":
            p_name = "Dr. Eleanor Vance (Admin)"
        elif u.username == "receptionist":
            p_name = "Sarah Jenkins"
        elif u.username == "assistant":
            p_name = "Marcus Brody"
        elif u.username == "patient":
            p_name = "David Michael Miller"

        item = UserResponse(
            id=u.id,
            username=u.username,
            email=u.email,
            role=u.role,
            is_active=u.is_active,
            created_at=u.created_at,
            updated_at=u.updated_at,
            last_login_at=u.last_login_at,
            permissions=perms,
            full_name=p_name,
        )
        items.append(item)

    if eff_limit is not None and eff_limit > 0:
        total_pages = math.ceil(total / eff_limit) if total > 0 else 0
        return_page = page or 1
        return_limit = eff_limit
    else:
        total_pages = 1
        return_page = 1
        return_limit = total

    return UserListResponse(
        items=items,
        total=total,
        page=return_page,
        limit=return_limit,
        total_pages=total_pages,
    )


@router.post(
    "",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Provision New User Account",
    description="Administratively provisions a new staff or user account enforcing anti-escalation rules.",
)
async def create_user(
    payload: UserCreateRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("User-Agent")

    new_user, perms = await provision_user(
        db=db,
        actor=current_user,
        data=payload,
        client_ip=client_ip,
        user_agent=user_agent,
    )

    return UserResponse(
        id=new_user.id,
        username=new_user.username,
        email=new_user.email,
        role=new_user.role,
        is_active=new_user.is_active,
        created_at=new_user.created_at,
        updated_at=new_user.updated_at,
        last_login_at=new_user.last_login_at,
        permissions=perms,
    )


@router.patch(
    "/{user_id}",
    response_model=UserResponse,
    status_code=status.HTTP_200_OK,
    summary="Update User Account",
    description="Updates user attributes and synchronizes scopes enforcing anti-lockout rules.",
)
async def update_user(
    user_id: int,
    payload: UserUpdateRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("User-Agent")

    updated_user, perms = await update_user_account(
        db=db,
        actor=current_user,
        target_user_id=user_id,
        data=payload,
        client_ip=client_ip,
        user_agent=user_agent,
    )

    return UserResponse(
        id=updated_user.id,
        username=updated_user.username,
        email=updated_user.email,
        role=updated_user.role,
        is_active=updated_user.is_active,
        created_at=updated_user.created_at,
        updated_at=updated_user.updated_at,
        last_login_at=updated_user.last_login_at,
        permissions=perms,
    )


@router.patch(
    "/{user_id}/deactivate",
    response_model=UserResponse,
    status_code=status.HTTP_200_OK,
    summary="Toggle User Deactivation",
    description="Toggles soft deactivation status (is_active: 1 <-> 0).",
)
async def toggle_deactivate_user(
    user_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("User-Agent")

    target_user, perms = await toggle_user_deactivation(
        db=db,
        actor=current_user,
        target_user_id=user_id,
        client_ip=client_ip,
        user_agent=user_agent,
    )

    return UserResponse(
        id=target_user.id,
        username=target_user.username,
        email=target_user.email,
        role=target_user.role,
        is_active=target_user.is_active,
        created_at=target_user.created_at,
        updated_at=target_user.updated_at,
        last_login_at=target_user.last_login_at,
        permissions=perms,
    )


@router.delete(
    "/{user_id}",
    response_model=UserResponse,
    status_code=status.HTTP_200_OK,
    summary="Soft Delete User Account",
    description="Executes regulatory-compliant soft deactivation in lieu of hard deletion.",
)
async def delete_user(
    user_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("User-Agent")

    # Hard deletion is prohibited under HIPAA; execute soft deactivation
    target_user, perms = await deactivate_user(
        db=db,
        actor=current_user,
        target_user_id=user_id,
        client_ip=client_ip,
        user_agent=user_agent,
    )

    return UserResponse(
        id=target_user.id,
        username=target_user.username,
        email=target_user.email,
        role=target_user.role,
        is_active=target_user.is_active,
        created_at=target_user.created_at,
        updated_at=target_user.updated_at,
        last_login_at=target_user.last_login_at,
        permissions=perms,
    )

