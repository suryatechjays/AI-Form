"""FastAPI Router implementing AEGIS Patient Master Record management APIs."""

import math
from typing import Optional
from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.patient import (
    PatientCreate,
    PatientListResponse,
    PatientResponse,
    PatientUpdate,
)
from app.services.patient_service import (
    create_patient,
    delete_patient,
    get_patient_by_id,
    get_patient_for_user,
    list_patients,
    update_patient,
)

router = APIRouter(prefix="/patients", tags=["Patient Master Records"])


@router.post(
    "",
    response_model=PatientResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create Patient Master Record",
    description="Provisions a new authoritative Patient record. Enforces pre-commit duplicate checks and override policies.",
)
async def create_patient_record(
    payload: PatientCreate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PatientResponse:
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("User-Agent")

    # Authenticated patient accounts safely link to their own user ID; staff desk creation has no linked user_id
    target_user_id = current_user.id if current_user.role == "ROLE_PATIENT" else None

    patient = await create_patient(
        db=db,
        actor=current_user,
        data=payload,
        user_id=target_user_id,
        client_ip=client_ip,
        user_agent=user_agent,
    )
    await db.commit()
    await db.refresh(patient)
    return PatientResponse.model_validate(patient, from_attributes=True)


@router.get(
    "/me",
    response_model=PatientResponse,
    status_code=status.HTTP_200_OK,
    summary="Retrieve Authenticated Patient Profile",
    description="Returns the patient clinical master profile linked to the authenticated portal user account.",
)
async def get_my_patient_profile(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PatientResponse:
    patient = await get_patient_for_user(db, current_user.id)
    return PatientResponse.model_validate(patient, from_attributes=True)


@router.get(
    "/{patient_id}",
    response_model=PatientResponse,
    status_code=status.HTTP_200_OK,
    summary="Retrieve Patient by ID",
    description="Retrieves a patient record by surrogate ID or business PID string with ownership verification.",
)
async def retrieve_patient(
    patient_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PatientResponse:
    patient = await get_patient_by_id(db, current_user, patient_id)
    return PatientResponse.model_validate(patient, from_attributes=True)


@router.get(
    "",
    response_model=PatientListResponse,
    status_code=status.HTTP_200_OK,
    summary="List and Search Patients",
    description="Returns a paginated list of patient master records. Restricted to authorized clinical staff.",
)
async def search_patients(
    page: int = Query(default=1, ge=1, description="Page number"),
    limit: int = Query(default=20, ge=1, le=100, description="Items per page"),
    query: Optional[str] = Query(default=None, description="Search text (name, mobile, email, PID)"),
    is_active: int = Query(default=1, ge=0, le=1, description="Active status filter"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PatientListResponse:
    items, total = await list_patients(
        db=db,
        actor=current_user,
        page=page,
        limit=limit,
        query=query,
        is_active=is_active,
    )
    total_pages = math.ceil(total / limit) if total > 0 else 0
    item_responses = [PatientResponse.model_validate(p, from_attributes=True) for p in items]

    return PatientListResponse(
        items=item_responses,
        total=total,
        page=page,
        limit=limit,
        total_pages=total_pages,
    )


@router.put(
    "/{patient_id}",
    response_model=PatientResponse,
    status_code=status.HTTP_200_OK,
    summary="Update Patient Information",
    description="Updates demographics for an existing patient master record with ownership verification.",
)
async def update_patient_demographics(
    patient_id: str,
    payload: PatientUpdate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PatientResponse:
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("User-Agent")

    updated = await update_patient(
        db=db,
        actor=current_user,
        patient_identifier=patient_id,
        data=payload,
        client_ip=client_ip,
        user_agent=user_agent,
    )
    await db.commit()
    await db.refresh(updated)
    return PatientResponse.model_validate(updated, from_attributes=True)


@router.delete(
    "/{patient_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete Patient Master Record",
    description="Permanently removes a patient master record and dependent registrations/documents. Super User authorization required.",
)
async def remove_patient(
    patient_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("User-Agent")

    result = await delete_patient(
        db=db,
        actor=current_user,
        patient_identifier=patient_id,
        client_ip=client_ip,
        user_agent=user_agent,
    )
    await db.commit()
    return result


