"""Registration encounter service implementing state machine, age snapshots, and idempotency."""

from datetime import datetime, timezone
import logging
from pathlib import Path
from typing import List, Optional, Tuple
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import (
    ClinicalValidationException,
    IdempotencyConflictException,
    IllegalStateTransitionException,
    PatientNotFoundException,
    PermissionDeniedException,
    RegistrationNotFoundException,
    RejectionReasonMandatoryException,
)
from app.models.document import UploadedDocument
from app.models.patient import Patient
from app.models.registration import Registration
from app.models.user import User
from app.schemas.registration import (
    RegistrationDraftCreate,
    RegistrationReviewRequest,
    RegistrationUpdate,
)
from app.services.audit_service import log_audit_event
from app.services.permission_service import check_assistant_admin_scope

logger = logging.getLogger("aegis.registration_service")


async def generate_registration_id(db: AsyncSession) -> str:
    """Generate unique intake encounter business identifier (format: AEGIS-YYYY-XXXXX)."""
    year = datetime.now(timezone.utc).year
    prefix = f"AEGIS-{year}-"
    stmt = (
        select(func.count(Registration.id))
        .where(Registration.registration_id.like(f"{prefix}%"))
    )
    count_res = await db.execute(stmt)
    seq = (count_res.scalar() or 0) + 1
    return f"{prefix}{seq:05d}"


def calculate_age_at_registration(dob_str: str) -> int:
    """Calculate biological age from date of birth using exact calendar date arithmetic.
    
    Formula: Age = Current Year - Birth Year - (1 if (Current Month, Day) < (Birth Month, Day) else 0)
    """
    try:
        birth_date = datetime.strptime(dob_str, "%Y-%m-%d").date()
    except Exception as e:
        raise ClinicalValidationException(f"Invalid date of birth format: {dob_str}. Expected YYYY-MM-DD.")

    today = datetime.now(timezone.utc).date()
    age = today.year - birth_date.year - ((today.month, today.day) < (birth_date.month, birth_date.day))
    if age < 0 or age > 125:
        raise ClinicalValidationException(
            detail=f"Calculated age ({age}) outside allowable clinical bounds [0, 125].",
            invalid_params=[{"name": "date_of_birth", "reason": "Age must be between 0 and 125"}],
        )
    return age


async def create_registration_draft(
    db: AsyncSession,
    actor: User,
    data: RegistrationDraftCreate,
    idempotency_key: Optional[str] = None,
    client_ip: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> Registration:
    """Instantiate a new encounter registration dossier in DRAFT status."""
    # 1. Idempotency Evaluation: Check if idempotency key was previously submitted
    if idempotency_key and idempotency_key.strip():
        idem_key = idempotency_key.strip()
        idem_stmt = select(Registration).where(Registration.idempotency_key == idem_key)
        idem_res = await db.execute(idem_stmt)
        existing_reg = idem_res.scalar_one_or_none()

        if existing_reg:
            # Check ownership context: only return if caller is the creator/submitter
            if existing_reg.created_by_user_id == actor.id or existing_reg.submitted_by_user_id == actor.id:
                logger.info("Returning cached registration for idempotency_key=%s", idem_key)
                return existing_reg
            # Collision across different actors: strictly reject to prevent cross-account exposure
            raise IdempotencyConflictException(
                detail="Idempotency key collision: The provided key has already been used by a different caller."
            )

    # 2. Resolve Target Patient
    if actor.role == "ROLE_PATIENT":
        # Portal patient self-registration: automatically bind to authenticated user's patient profile
        p_stmt = select(Patient).where(Patient.user_id == actor.id, Patient.is_active == 1)
        p_res = await db.execute(p_stmt)
        patient = p_res.scalar_one_or_none()

        # Fallback 1: If patient_id was passed, check if it can be safely linked or is already owned
        if not patient and data.patient_id:
            cand = (await db.execute(select(Patient).where(Patient.id == data.patient_id, Patient.is_active == 1))).scalar_one_or_none()
            if cand:
                if cand.user_id is None:
                    cand.user_id = actor.id
                    await db.flush()
                    patient = cand
                elif cand.user_id == actor.id:
                    patient = cand
                else:
                    raise PermissionDeniedException("Access denied: You are not authorized to create registrations for another patient.")

        # Fallback 2: Check unlinked patient matching actor email
        if not patient and actor.email:
            unlinked_p = (await db.execute(
                select(Patient).where(
                    func.lower(Patient.email) == actor.email.strip().lower(),
                    Patient.user_id == None,
                    Patient.is_active == 1,
                )
            )).scalars().first()
            if unlinked_p:
                unlinked_p.user_id = actor.id
                await db.flush()
                patient = unlinked_p

        # Fallback 3: Atomically provision/link from patient_data if provided
        if not patient and getattr(data, "patient_data", None):
            from app.services.patient_service import create_patient
            patient = await create_patient(
                db=db,
                actor=actor,
                data=data.patient_data,
                user_id=actor.id,
                client_ip=client_ip,
                user_agent=user_agent,
            )
            await db.flush()

        if not patient:
            raise PatientNotFoundException("No patient profile found for this authenticated user account.")
    else:
        # Staff creating desk intake
        if actor.role == "ROLE_ASSISTANT_ADMIN":
            has_scope = await check_assistant_admin_scope(db, actor.id, "registrations:create_desk")
            if not has_scope:
                raise PermissionDeniedException(
                    detail="Assistant Administrator lacks required permission scope 'registrations:create_desk'.",
                    code="SCOPE_PERMISSION_DENIED",
                )

        if not data.patient_id:
            raise ClinicalValidationException(
                detail="A valid patient_id is required to create a desk registration encounter.",
                invalid_params=[{"name": "patient_id", "reason": "Mandatory for desk registrations"}],
            )

        p_stmt = select(Patient).where(Patient.id == data.patient_id, Patient.is_active == 1)
        p_res = await db.execute(p_stmt)
        patient = p_res.scalar_one_or_none()
        if not patient:
            raise PatientNotFoundException(f"Patient with ID {data.patient_id} does not exist or is inactive.")

    # 3. Calculate frozen age snapshot
    age_snapshot = calculate_age_at_registration(patient.date_of_birth)

    # Fallback contact demographics from patient master if not specified in encounter
    contact_mobile = data.contact_mobile.strip() if data.contact_mobile else patient.primary_mobile
    contact_email = data.contact_email.strip() if data.contact_email else patient.email
    residential_addr = data.residential_address.strip() if data.residential_address else patient.street_address

    new_reg_id = await generate_registration_id(db)
    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    registration = Registration(
        registration_id=new_reg_id,
        patient_id=patient.id,
        created_by_user_id=actor.id,
        submitted_by_user_id=None,
        reviewed_by_user_id=None,
        status="DRAFT",
        rejection_reason=None,
        idempotency_key=idempotency_key.strip() if idempotency_key else None,
        age_at_registration=age_snapshot,
        contact_mobile=contact_mobile,
        contact_email=contact_email,
        residential_address=residential_addr,
        emergency_contact_name=data.emergency_contact_name.strip() if data.emergency_contact_name else None,
        emergency_contact_relationship=data.emergency_contact_relationship.strip() if data.emergency_contact_relationship else None,
        emergency_contact_phone=data.emergency_contact_phone.strip() if data.emergency_contact_phone else None,
        existing_conditions=data.existing_conditions.strip() if data.existing_conditions else "Not Provided",
        previous_surgeries=data.previous_surgeries.strip() if data.previous_surgeries else "None Reported",
        current_medications=data.current_medications.strip() if data.current_medications else "Not Provided",
        allergy_status=data.allergy_status.strip() if data.allergy_status else "Not Provided / Unknown",
        allergies_detail=data.allergies_detail.strip() if data.allergies_detail else None,
        medical_history=data.medical_history.strip() if data.medical_history else "Not Provided",
        disability_accommodations=data.disability_accommodations.strip() if data.disability_accommodations else None,
        has_insurance=data.has_insurance,
        insurance_provider=data.insurance_provider.strip() if data.insurance_provider else None,
        insurance_policy_number=data.insurance_policy_number.strip() if data.insurance_policy_number else None,
        insurance_policy_holder=data.insurance_policy_holder.strip() if data.insurance_policy_holder else None,
        insurance_expiry_date=data.insurance_expiry_date,
        preferred_doctor=data.preferred_doctor.strip() if data.preferred_doctor else None,
        department=data.department.strip() if data.department else None,
        reason_for_visit=data.reason_for_visit.strip() if data.reason_for_visit else None,
        preferred_appointment_date=data.preferred_appointment_date,
        pdf_status="PENDING",
        created_at=now_str,
        updated_at=now_str,
    )
    db.add(registration)
    try:
        await db.flush()
    except IntegrityError:
        # Race condition on idempotency key
        await db.rollback()
        if idempotency_key:
            chk = await db.execute(select(Registration).where(Registration.idempotency_key == idempotency_key))
            coll = chk.scalar_one_or_none()
            if coll and (coll.created_by_user_id == actor.id):
                return coll
            raise IdempotencyConflictException()
        raise

    await log_audit_event(
        db=db,
        actor_user_id=actor.id,
        actor_username=actor.username,
        actor_role=actor.role,
        action_type="REGISTRATION_CREATED",
        target_type="registrations",
        target_id=str(registration.id),
        ip_address=client_ip,
        user_agent=user_agent,
        metadata={"registration_id": registration.registration_id, "patient_id": patient.patient_id},
    )
    return registration


async def get_registration_by_id(
    db: AsyncSession,
    actor: User,
    registration_identifier: str,
) -> Registration:
    """Retrieve registration by surrogate ID or business registration_id with ownership checks."""
    if registration_identifier.isdigit():
        stmt = (
            select(Registration)
            .options(selectinload(Registration.patient))
            .where(Registration.id == int(registration_identifier))
        )
    else:
        stmt = (
            select(Registration)
            .options(selectinload(Registration.patient))
            .where(Registration.registration_id == registration_identifier)
        )

    res = await db.execute(stmt)
    reg = res.scalar_one_or_none()
    if not reg:
        raise RegistrationNotFoundException()

    # Enforce ownership and access restrictions
    if actor.role == "ROLE_PATIENT":
        # Patient can ONLY access their own registration
        if reg.created_by_user_id != actor.id and (not reg.patient or reg.patient.user_id != actor.id):
            raise PermissionDeniedException(
                detail="Access denied: You are not authorized to view this registration dossier.",
                code="PERMISSION_DENIED",
            )
    elif actor.role == "ROLE_ASSISTANT_ADMIN":
        if reg.created_by_user_id != actor.id:
            has_view = await check_assistant_admin_scope(db, actor.id, "records:view_all")
            if not has_view:
                raise PermissionDeniedException(
                    detail="Assistant Administrator lacks required permission scope 'records:view_all'.",
                    code="SCOPE_PERMISSION_DENIED",
                )

    return reg


async def list_registrations(
    db: AsyncSession,
    actor: User,
    page: int = 1,
    limit: int = 20,
    status_filter: Optional[str] = None,
    patient_id: Optional[int] = None,
    department: Optional[str] = None,
    search: Optional[str] = None,
) -> Tuple[List[Registration], int]:
    """List registrations with pagination, role-based scoping, search, and department filtering."""
    base_stmt = select(Registration).options(selectinload(Registration.patient))

    joined_patient = False
    if actor.role == "ROLE_PATIENT":
        # Scoped strictly to authenticated patient
        base_stmt = base_stmt.join(Patient, Registration.patient_id == Patient.id).where(
            or_(
                Registration.created_by_user_id == actor.id,
                Registration.submitted_by_user_id == actor.id,
                Patient.user_id == actor.id,
            )
        )
        joined_patient = True
    elif actor.role == "ROLE_ASSISTANT_ADMIN":
        has_scope = await check_assistant_admin_scope(db, actor.id, "records:view_all")
        if not has_scope:
            raise PermissionDeniedException(
                detail="Assistant Administrator lacks required permission scope 'records:view_all'.",
                code="SCOPE_PERMISSION_DENIED",
            )

    if status_filter and status_filter.strip() and status_filter.strip().upper() not in ("ALL", "ANY"):
        base_stmt = base_stmt.where(Registration.status == status_filter.strip().upper())

    if department and department.strip() and department.strip().upper() not in ("ALL", "ANY"):
        base_stmt = base_stmt.where(Registration.department == department.strip())

    if patient_id:
        base_stmt = base_stmt.where(Registration.patient_id == patient_id)

    if search and search.strip():
        term = f"%{search.strip()}%"
        if not joined_patient:
            base_stmt = base_stmt.outerjoin(Patient, Registration.patient_id == Patient.id)
            joined_patient = True
        base_stmt = base_stmt.where(
            or_(
                Registration.registration_id.ilike(term),
                Registration.contact_mobile.ilike(term),
                Registration.contact_email.ilike(term),
                Patient.full_name.ilike(term),
                Patient.patient_id.ilike(term),
                Patient.primary_mobile.ilike(term),
                Patient.email.ilike(term),
            )
        )

    count_stmt = select(func.count()).select_from(base_stmt.subquery())
    total_count = (await db.execute(count_stmt)).scalar() or 0

    offset = max(0, (page - 1) * limit)
    paged_stmt = base_stmt.order_by(Registration.created_at.desc(), Registration.id.desc()).offset(offset).limit(limit)
    items = list((await db.execute(paged_stmt)).scalars().all())

    return items, total_count


async def update_registration_draft(
    db: AsyncSession,
    actor: User,
    registration_identifier: str,
    data: RegistrationUpdate,
    client_ip: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> Registration:
    """Update registration form fields while in DRAFT status."""
    reg = await get_registration_by_id(db, actor, registration_identifier)

    if reg.status != "DRAFT":
        raise IllegalStateTransitionException(
            f"Cannot update registration encounter in '{reg.status}' status. Only DRAFT records may be modified."
        )

    # Ownership check
    if actor.role == "ROLE_PATIENT" and reg.created_by_user_id != actor.id:
        raise PermissionDeniedException(
            detail="Access denied: You can only edit your own registration drafts.",
            code="PERMISSION_DENIED",
        )
    elif actor.role == "ROLE_ASSISTANT_ADMIN":
        has_scope = await check_assistant_admin_scope(db, actor.id, "registrations:edit")
        if not has_scope:
            raise PermissionDeniedException(
                detail="Assistant Administrator lacks required permission scope 'registrations:edit'.",
                code="SCOPE_PERMISSION_DENIED",
            )

    # Update provided fields
    for field_name, value in data.model_dump(exclude_unset=True).items():
        if value is not None:
            if isinstance(value, str):
                setattr(reg, field_name, value.strip())
            else:
                setattr(reg, field_name, value)

    reg.updated_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    await db.flush()

    await log_audit_event(
        db=db,
        actor_user_id=actor.id,
        actor_username=actor.username,
        actor_role=actor.role,
        action_type="REGISTRATION_UPDATED",
        target_type="registrations",
        target_id=str(reg.id),
        ip_address=client_ip,
        user_agent=user_agent,
    )
    return reg


async def submit_registration(
    db: AsyncSession,
    actor: User,
    registration_identifier: str,
    idempotency_key: Optional[str] = None,
    client_ip: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> Registration:
    """Advance registration lifecycle: DRAFT -> PENDING_REVIEW (Patient) or -> SUBMITTED (Desk Admission)."""
    reg = await get_registration_by_id(db, actor, registration_identifier)

    # Check idempotency
    if idempotency_key and idempotency_key.strip():
        idem_key = idempotency_key.strip()
        idem_stmt = select(Registration).where(Registration.idempotency_key == idem_key)
        existing = (await db.execute(idem_stmt)).scalar_one_or_none()
        if existing:
            if existing.id == reg.id and (existing.created_by_user_id == actor.id or existing.submitted_by_user_id == actor.id):
                return existing
            raise IdempotencyConflictException()

    # Enforce current state must be DRAFT or PENDING_REVIEW
    if reg.status not in ("DRAFT", "PENDING_REVIEW"):
        raise IllegalStateTransitionException(
            f"Registration in '{reg.status}' status cannot be submitted."
        )

    # Clinical validation: Minor (< 18) must have emergency contact
    if reg.age_at_registration < 18:
        if not reg.emergency_contact_name or not reg.emergency_contact_phone:
            raise ClinicalValidationException(
                detail="Section 3 Emergency Contact (Name and Phone) is mandatory for patients under 18 years of age.",
                invalid_params=[
                    {"name": "emergency_contact_name", "reason": "Mandatory for minors (<18)"},
                    {"name": "emergency_contact_phone", "reason": "Mandatory for minors (<18)"},
                ],
            )

    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    if actor.role == "ROLE_PATIENT":
        # If already in PENDING_REVIEW by this patient, return idempotently for retry safety
        if reg.status == "PENDING_REVIEW" and (reg.submitted_by_user_id == actor.id or reg.created_by_user_id == actor.id):
            return reg
        # Patient intake submission advances DRAFT -> PENDING_REVIEW
        if reg.status != "DRAFT":
            raise IllegalStateTransitionException(
                "Patient online intake can only be submitted from DRAFT status."
            )
        reg.status = "PENDING_REVIEW"
        reg.submitted_by_user_id = actor.id
        action_name = "REGISTRATION_SUBMITTED"
    else:
        # Staff one-step desk submission or review advances to SUBMITTED
        if actor.role == "ROLE_ASSISTANT_ADMIN":
            has_scope = await check_assistant_admin_scope(db, actor.id, "registrations:submit")
            if not has_scope:
                raise PermissionDeniedException(
                    detail="Assistant Administrator lacks explicit 'registrations:submit' scope required for final admission.",
                    code="SCOPE_PERMISSION_DENIED",
                )

        reg.status = "SUBMITTED"
        if not reg.submitted_by_user_id:
            reg.submitted_by_user_id = actor.id
        reg.reviewed_by_user_id = actor.id
        action_name = "REGISTRATION_ADMITTED"

    if idempotency_key:
        reg.idempotency_key = idempotency_key.strip()
    reg.updated_at = now_str
    await db.flush()

    await log_audit_event(
        db=db,
        actor_user_id=actor.id,
        actor_username=actor.username,
        actor_role=actor.role,
        action_type=action_name,
        target_type="registrations",
        target_id=str(reg.id),
        ip_address=client_ip,
        user_agent=user_agent,
        metadata={"registration_id": reg.registration_id, "status": reg.status},
    )
    return reg


async def review_registration(
    db: AsyncSession,
    actor: User,
    registration_identifier: str,
    review_req: RegistrationReviewRequest,
    client_ip: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> Registration:
    """Execute clinical staff review: approve (SUBMITTED) or reject (REJECTED with mandatory reason)."""
    if actor.role == "ROLE_PATIENT":
        raise PermissionDeniedException(
            detail="Patient accounts are strictly prohibited from reviewing or approving registrations.",
            code="PERMISSION_DENIED",
        )

    reg = await get_registration_by_id(db, actor, registration_identifier)
    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    if review_req.action == "APPROVE":
        # Approval advances to SUBMITTED
        if reg.status not in ("PENDING_REVIEW", "DRAFT"):
            raise IllegalStateTransitionException(
                f"Cannot approve registration in '{reg.status}' status. Only PENDING_REVIEW or DRAFT can be approved."
            )

        if actor.role == "ROLE_ASSISTANT_ADMIN":
            has_scope = await check_assistant_admin_scope(db, actor.id, "registrations:submit")
            if not has_scope:
                raise PermissionDeniedException(
                    detail="Assistant Administrator lacks explicit 'registrations:submit' scope required for final approval.",
                    code="SCOPE_PERMISSION_DENIED",
                )

        reg.status = "SUBMITTED"
        reg.reviewed_by_user_id = actor.id
        reg.updated_at = now_str
        await db.flush()

        await log_audit_event(
            db=db,
            actor_user_id=actor.id,
            actor_username=actor.username,
            actor_role=actor.role,
            action_type="REGISTRATION_APPROVED",
            target_type="registrations",
            target_id=str(reg.id),
            ip_address=client_ip,
            user_agent=user_agent,
            metadata={"registration_id": reg.registration_id, "new_status": "SUBMITTED"},
        )
        return reg

    elif review_req.action == "REJECT":
        # Rejection marks terminal REJECTED status
        if reg.status == "REJECTED":
            raise IllegalStateTransitionException("Registration is already in terminal REJECTED state.")

        if actor.role == "ROLE_ASSISTANT_ADMIN":
            has_scope = await check_assistant_admin_scope(db, actor.id, "registrations:reject")
            if not has_scope:
                raise PermissionDeniedException(
                    detail="Assistant Administrator lacks explicit 'registrations:reject' scope required for rejection.",
                    code="SCOPE_PERMISSION_DENIED",
                )

        # Enforce mandatory concise administrative reason
        if not review_req.rejection_reason or not review_req.rejection_reason.strip():
            raise RejectionReasonMandatoryException(
                detail="A concise administrative rejection reason (max 255 chars) is mandatory."
            )

        reason = review_req.rejection_reason.strip()[:255]
        reg.status = "REJECTED"
        reg.rejection_reason = reason
        reg.reviewed_by_user_id = actor.id
        reg.updated_at = now_str
        await db.flush()

        await log_audit_event(
            db=db,
            actor_user_id=actor.id,
            actor_username=actor.username,
            actor_role=actor.role,
            action_type="REGISTRATION_REJECTED",
            target_type="registrations",
            target_id=str(reg.id),
            justification=reason,
            ip_address=client_ip,
            user_agent=user_agent,
            metadata={"registration_id": reg.registration_id, "new_status": "REJECTED"},
        )
        return reg

    raise IllegalStateTransitionException(f"Unsupported review action '{review_req.action}'.")


async def delete_registration(
    db: AsyncSession,
    actor: User,
    registration_identifier: str,
    client_ip: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> dict:
    """Permanently delete an admission registration encounter from SQLite.

    1. Restricted to Super Users (or authorized admins).
    2. Removes associated physical PDF dossier from disk if present.
    3. Handles dependent uploaded_documents referencing this registration.
    4. Deletes the Registration row from `registrations`.
    5. If the patient has no other registrations remaining, also removes the orphan patient record.
    6. Logs audit trail with actor details and registration identifier.
    7. Ensures explicit commit/rollback transaction integrity.
    """
    if actor.role != "ROLE_SUPER_USER":
        raise PermissionDeniedException(
            detail="Access denied: Only Super Users have authorization to permanently delete admission records.",
            code="PERMISSION_DENIED",
        )

    # 1. Retrieve the registration by surrogate ID or business registration_id
    if registration_identifier.isdigit():
        stmt = (
            select(Registration)
            .options(
                selectinload(Registration.patient),
                selectinload(Registration.uploaded_documents),
            )
            .where(Registration.id == int(registration_identifier))
        )
    else:
        stmt = (
            select(Registration)
            .options(
                selectinload(Registration.patient),
                selectinload(Registration.uploaded_documents),
            )
            .where(Registration.registration_id == registration_identifier)
        )

    res = await db.execute(stmt)
    reg = res.scalar_one_or_none()
    if not reg:
        raise RegistrationNotFoundException()

    reg_id = reg.id
    reg_code = reg.registration_id
    patient_id = reg.patient_id
    pdf_path = reg.pdf_path

    # 2. Safely remove physical PDF file from disk
    if pdf_path:
        try:
            p_file = Path(pdf_path)
            if p_file.exists():
                p_file.unlink(missing_ok=True)
        except Exception as e:
            logger.warning("Failed to unlink PDF file %s during registration deletion: %s", pdf_path, e)

    # 3. Clean up uploaded documents referencing this registration
    doc_stmt = select(UploadedDocument).where(UploadedDocument.registration_id == reg_id)
    doc_res = await db.execute(doc_stmt)
    docs = doc_res.scalars().all()
    for doc in docs:
        if doc.storage_path:
            try:
                d_file = Path(doc.storage_path)
                if d_file.exists():
                    d_file.unlink(missing_ok=True)
            except Exception as e:
                logger.warning("Failed to unlink document file %s: %s", doc.storage_path, e)
        await db.delete(doc)
    await db.flush()

    # 4. Delete the registration record itself
    await db.delete(reg)
    await db.flush()

    # 5. Check if the patient has any other registrations
    other_regs_stmt = select(func.count(Registration.id)).where(
        Registration.patient_id == patient_id,
        Registration.id != reg_id,
    )
    other_regs_count = (await db.execute(other_regs_stmt)).scalar() or 0

    patient_deleted = False
    if other_regs_count == 0:
        # Patient has no other registrations; remove orphan uploaded documents and patient record
        orphan_docs_stmt = select(UploadedDocument).where(UploadedDocument.patient_id == patient_id)
        orphan_docs = (await db.execute(orphan_docs_stmt)).scalars().all()
        for od in orphan_docs:
            if od.storage_path:
                try:
                    f = Path(od.storage_path)
                    if f.exists():
                        f.unlink(missing_ok=True)
                except Exception:
                    pass
            await db.delete(od)
        await db.flush()

        pat_stmt = select(Patient).where(Patient.id == patient_id)
        pat = (await db.execute(pat_stmt)).scalar_one_or_none()
        if pat:
            await db.delete(pat)
            await db.flush()
            patient_deleted = True

    # 6. Append audit log
    await log_audit_event(
        db=db,
        actor_user_id=actor.id,
        actor_username=actor.username,
        actor_role=actor.role,
        action_type="ADMISSION_DELETED",
        target_type="registrations",
        target_id=str(reg_id),
        justification="Permanent admission removal by Super User",
        ip_address=client_ip,
        user_agent=user_agent,
        metadata={
            "registration_id": reg_code,
            "patient_id": patient_id,
            "patient_deleted": patient_deleted,
        },
    )

    return {
        "success": True,
        "message": f"Admission record {reg_code} successfully deleted.",
        "deleted_registration_id": reg_code,
        "deleted_patient_id": patient_id if patient_deleted else None,
    }

