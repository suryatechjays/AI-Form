"""FastAPI Router implementing AEGIS Registration Lifecycle and Intake Encounter APIs."""

import math
from typing import Optional
from fastapi import APIRouter, BackgroundTasks, Depends, Header, Query, Request, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.registration import (
    RegistrationDraftCreate,
    RegistrationListResponse,
    RegistrationResponse,
    RegistrationReviewRequest,
    RegistrationUpdate,
)
from app.services.pdf_service import (
    compile_registration_pdf_task,
    get_registration_pdf_file,
    regenerate_registration_pdf,
)
from app.services.registration_service import (
    create_registration_draft,
    delete_registration,
    get_registration_by_id,
    list_registrations,
    review_registration,
    submit_registration,
    update_registration_draft,
)

router = APIRouter(prefix="/registrations", tags=["Registration Encounters"])


@router.post(
    "",
    response_model=RegistrationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create Registration Draft",
    description="Instantiates a new intake encounter dossier in DRAFT status with biological age snapshot.",
)
async def create_registration(
    payload: RegistrationDraftCreate,
    request: Request,
    idempotency_key: Optional[str] = Header(None, alias="X-Idempotency-Key"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RegistrationResponse:
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("User-Agent")

    reg = await create_registration_draft(
        db=db,
        actor=current_user,
        data=payload,
        idempotency_key=idempotency_key,
        client_ip=client_ip,
        user_agent=user_agent,
    )
    await db.commit()
    await db.refresh(reg)
    return RegistrationResponse.model_validate(reg, from_attributes=True)


@router.get(
    "/{registration_id}",
    response_model=RegistrationResponse,
    status_code=status.HTTP_200_OK,
    summary="Retrieve Registration Details",
    description="Retrieves a registration encounter by surrogate ID or business registration ID with ownership checks.",
)
async def retrieve_registration(
    registration_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RegistrationResponse:
    reg = await get_registration_by_id(db, current_user, registration_id)
    return RegistrationResponse.model_validate(reg, from_attributes=True)


@router.get(
    "",
    response_model=RegistrationListResponse,
    status_code=status.HTTP_200_OK,
    summary="List Registrations with Scoping",
    description="Returns a paginated collection of registrations. Scoped strictly to own records for patients.",
)
async def query_registrations(
    page: int = Query(default=1, ge=1, description="Page number"),
    limit: Optional[int] = Query(default=20, ge=1, le=100, description="Items per page"),
    page_size: Optional[int] = Query(default=None, ge=1, le=100, description="Alias for limit"),
    status: Optional[str] = Query(default=None, description="Filter by status (DRAFT, PENDING_REVIEW, SUBMITTED, REJECTED)"),
    status_filter: Optional[str] = Query(default=None, description="Alias for status"),
    search: Optional[str] = Query(default=None, description="Search across registration ID, mobile, email, or patient demographics"),
    department: Optional[str] = Query(default=None, description="Filter by clinical department"),
    patient_id: Optional[int] = Query(default=None, description="Filter by patient internal ID"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RegistrationListResponse:
    eff_limit = page_size if page_size is not None else (limit or 20)
    eff_status = status_filter if status_filter is not None else status

    items, total = await list_registrations(
        db=db,
        actor=current_user,
        page=page,
        limit=eff_limit,
        status_filter=eff_status,
        patient_id=patient_id,
        department=department,
        search=search,
    )
    total_pages = math.ceil(total / eff_limit) if total > 0 else 0
    item_responses = [RegistrationResponse.model_validate(r, from_attributes=True) for r in items]

    return RegistrationListResponse(
        items=item_responses,
        total=total,
        page=page,
        limit=eff_limit,
        total_pages=total_pages,
    )


@router.put(
    "/{registration_id}",
    response_model=RegistrationResponse,
    status_code=status.HTTP_200_OK,
    summary="Update Draft Registration",
    description="Updates registration fields while in DRAFT status. Rejected once advanced to reviewed or submitted states.",
)
async def update_draft(
    registration_id: str,
    payload: RegistrationUpdate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RegistrationResponse:
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("User-Agent")

    updated = await update_registration_draft(
        db=db,
        actor=current_user,
        registration_identifier=registration_id,
        data=payload,
        client_ip=client_ip,
        user_agent=user_agent,
    )
    await db.commit()
    await db.refresh(updated)
    return RegistrationResponse.model_validate(updated, from_attributes=True)


@router.post(
    "/{registration_id}/submit",
    response_model=RegistrationResponse,
    status_code=status.HTTP_200_OK,
    summary="Submit Registration for Review or Admission",
    description="Advances DRAFT to PENDING_REVIEW (Patient) or SUBMITTED (Desk staff with approved permissions).",
)
async def submit_intake(
    registration_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    idempotency_key: Optional[str] = Header(None, alias="X-Idempotency-Key"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RegistrationResponse:
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("User-Agent")

    submitted = await submit_registration(
        db=db,
        actor=current_user,
        registration_identifier=registration_id,
        idempotency_key=idempotency_key,
        client_ip=client_ip,
        user_agent=user_agent,
    )
    await db.commit()
    await db.refresh(submitted)

    # In-process decoupled PDF compilation for finalized submissions
    if submitted.status in ("SUBMITTED", "PENDING_REVIEW"):
        background_tasks.add_task(compile_registration_pdf_task, submitted.id)

    return RegistrationResponse.model_validate(submitted, from_attributes=True)


@router.post(
    "/{registration_id}/review",
    response_model=RegistrationResponse,
    status_code=status.HTTP_200_OK,
    summary="Review Registration (Approve or Reject)",
    description="Staff review endpoint. Approves (SUBMITTED) or rejects (REJECTED) with mandatory administrative reason.",
)
async def clinical_review(
    registration_id: str,
    payload: RegistrationReviewRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RegistrationResponse:
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("User-Agent")

    reviewed = await review_registration(
        db=db,
        actor=current_user,
        registration_identifier=registration_id,
        review_req=payload,
        client_ip=client_ip,
        user_agent=user_agent,
    )
    await db.commit()
    await db.refresh(reviewed)

    # In-process decoupled PDF compilation upon approval
    if reviewed.status == "SUBMITTED":
        background_tasks.add_task(compile_registration_pdf_task, reviewed.id)

    return RegistrationResponse.model_validate(reviewed, from_attributes=True)


@router.post(
    "/{registration_id}/pdf/regenerate",
    response_model=RegistrationResponse,
    status_code=status.HTTP_200_OK,
    summary="Regenerate Registration PDF Dossier",
    description="Authorized clerical workflow to trigger in-process re-compilation of failed or stale PDFs.",
)
async def trigger_pdf_regeneration(
    registration_id: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RegistrationResponse:
    reg = await regenerate_registration_pdf(
        db=db,
        actor=current_user,
        registration_identifier=registration_id,
    )
    await db.commit()
    await db.refresh(reg)
    background_tasks.add_task(compile_registration_pdf_task, reg.id)
    return RegistrationResponse.model_validate(reg, from_attributes=True)


@router.get(
    "/{registration_id}/pdf",
    status_code=status.HTTP_200_OK,
    summary="Download Authoritative Registration PDF Dossier",
    description="Downloads the finalized A4 PDF dossier with patient ownership and staff permission checks.",
)
async def download_registration_pdf(
    registration_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    pdf_path, filename, media_type = await get_registration_pdf_file(
        db=db,
        actor=current_user,
        registration_identifier=registration_id,
    )
    return FileResponse(
        path=pdf_path,
        media_type=media_type,
        filename=filename,
    )


@router.delete(
    "/{registration_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete Registration Encounter",
    description="Permanently removes an admission registration dossier and associated files from the active database. Super User authorization required.",
)
async def remove_registration(
    registration_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("User-Agent")

    result = await delete_registration(
        db=db,
        actor=current_user,
        registration_identifier=registration_id,
        client_ip=client_ip,
        user_agent=user_agent,
    )
    await db.commit()
    return result

