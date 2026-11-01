"""Patient service managing clinical master records, demographics, and duplicate detection."""

from datetime import datetime, timezone
import logging
from pathlib import Path
from typing import List, Optional, Tuple
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    DuplicatePatientException,
    JustificationRequiredException,
    PatientNotFoundException,
    PermissionDeniedException,
)
from app.models.document import UploadedDocument
from app.models.patient import Patient
from app.models.registration import Registration
from app.models.user import User
from app.schemas.duplicate import DuplicateMatch
from app.schemas.patient import PatientCreate, PatientUpdate
from app.services.audit_service import log_audit_event
from app.services.permission_service import check_assistant_admin_scope

logger = logging.getLogger("aegis.patient_service")


async def generate_patient_id(db: AsyncSession) -> str:
    """Generate business patient identifier matching PID-YYYY-XXXXX format."""
    year = datetime.now(timezone.utc).year
    prefix = f"PID-{year}-"
    stmt = (
        select(func.count(Patient.id))
        .where(Patient.patient_id.like(f"{prefix}%"))
    )
    count_res = await db.execute(stmt)
    seq = (count_res.scalar() or 0) + 1
    return f"{prefix}{seq:05d}"


async def check_patient_duplicates(
    db: AsyncSession,
    mobile: str,
    email: Optional[str],
    full_name: str,
    dob: str,
    exclude_patient_id: Optional[int] = None,
) -> List[DuplicateMatch]:
    """Execute pre-commit duplicate queries across primary mobile, email, and composite Name+DOB."""
    matches: List[DuplicateMatch] = []

    # 1. Exact primary mobile check
    mobile_stmt = select(Patient).where(
        Patient.primary_mobile == mobile.strip(),
        Patient.is_active == 1,
    )
    if exclude_patient_id:
        mobile_stmt = mobile_stmt.where(Patient.id != exclude_patient_id)

    mobile_res = await db.execute(mobile_stmt)
    for p in mobile_res.scalars().all():
        matches.append(
            DuplicateMatch(
                matched_patient_id=p.patient_id,
                matched_field="primary_mobile",
                match_type="EXACT",
            )
        )

    # 2. Case-insensitive email check (if email is provided)
    if email and email.strip():
        email_clean = email.strip().lower()
        email_stmt = select(Patient).where(
            func.lower(Patient.email) == email_clean,
            Patient.is_active == 1,
        )
        if exclude_patient_id:
            email_stmt = email_stmt.where(Patient.id != exclude_patient_id)

        email_res = await db.execute(email_stmt)
        for p in email_res.scalars().all():
            if not any(m.matched_patient_id == p.patient_id and m.matched_field == "email" for m in matches):
                matches.append(
                    DuplicateMatch(
                        matched_patient_id=p.patient_id,
                        matched_field="email",
                        match_type="EXACT",
                    )
                )

    # 3. Composite Full Name + Date of Birth check
    name_clean = full_name.strip().lower()
    comp_stmt = select(Patient).where(
        func.lower(Patient.full_name) == name_clean,
        Patient.date_of_birth == dob.strip(),
        Patient.is_active == 1,
    )
    if exclude_patient_id:
        comp_stmt = comp_stmt.where(Patient.id != exclude_patient_id)

    comp_res = await db.execute(comp_stmt)
    for p in comp_res.scalars().all():
        if not any(m.matched_patient_id == p.patient_id and m.matched_field == "composite_name_dob" for m in matches):
            matches.append(
                DuplicateMatch(
                    matched_patient_id=p.patient_id,
                    matched_field="composite_name_dob",
                    match_type="COMPOSITE",
                )
            )

    return matches


async def create_patient(
    db: AsyncSession,
    actor: User,
    data: PatientCreate,
    user_id: Optional[int] = None,
    client_ip: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> Patient:
    """Create a new authoritative Patient master record with duplicate validation and audit logging."""
    # 0. If caller is an authenticated patient, verify whether they already have an active linked profile
    if actor.role == "ROLE_PATIENT":
        existing_stmt = select(Patient).where(Patient.user_id == actor.id, Patient.is_active == 1)
        existing_patient = (await db.execute(existing_stmt)).scalar_one_or_none()
        if existing_patient:
            # Safely update and reuse caller's existing linked patient record (retry-safe)
            existing_patient.full_name = data.full_name.strip()
            existing_patient.date_of_birth = data.date_of_birth.strip()
            existing_patient.gender = data.gender.strip()
            if data.blood_group:
                existing_patient.blood_group = data.blood_group.strip()
            existing_patient.primary_mobile = data.primary_mobile.strip()
            if data.email:
                existing_patient.email = data.email.strip()
            if data.street_address:
                existing_patient.street_address = data.street_address.strip()
            if data.city:
                existing_patient.city = data.city.strip()
            if data.state:
                existing_patient.state = data.state.strip()
            if data.country:
                existing_patient.country = data.country.strip()
            if data.postal_code:
                existing_patient.postal_code = data.postal_code.strip()
            existing_patient.updated_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            await db.flush()
            return existing_patient

    # Pre-commit duplicate validation
    duplicates = await check_patient_duplicates(
        db=db,
        mobile=data.primary_mobile,
        email=data.email,
        full_name=data.full_name,
        dob=data.date_of_birth,
    )

    if duplicates:
        if actor.role == "ROLE_PATIENT":
            # Check if the duplicate match is an unlinked patient profile that this patient can safely claim
            matched_pids = [d.matched_patient_id for d in duplicates]
            matched_stmt = select(Patient).where(Patient.patient_id.in_(matched_pids), Patient.is_active == 1)
            matched_patients = list((await db.execute(matched_stmt)).scalars().all())

            # If any matched patient is already linked to ANOTHER user account, strictly deny
            other_user_conflict = any(p.user_id is not None and p.user_id != actor.id for p in matched_patients)
            if other_user_conflict:
                invalid_params = [
                    {"name": d.matched_field, "reason": f"Matches existing patient record ({d.match_type})"}
                    for d in duplicates
                ]
                raise DuplicatePatientException(
                    detail="A patient with matching demographic identifiers already exists in the master index.",
                    invalid_params=invalid_params,
                )

            # If matched record(s) have user_id is None (or match actor.id), safely link to this authenticated patient
            unlinked_match = next((p for p in matched_patients if p.user_id is None or p.user_id == actor.id), None)
            if unlinked_match:
                unlinked_match.user_id = actor.id
                unlinked_match.full_name = data.full_name.strip()
                unlinked_match.date_of_birth = data.date_of_birth.strip()
                unlinked_match.gender = data.gender.strip()
                if data.blood_group:
                    unlinked_match.blood_group = data.blood_group.strip()
                unlinked_match.primary_mobile = data.primary_mobile.strip()
                if data.email:
                    unlinked_match.email = data.email.strip()
                if data.street_address:
                    unlinked_match.street_address = data.street_address.strip()
                if data.city:
                    unlinked_match.city = data.city.strip()
                if data.state:
                    unlinked_match.state = data.state.strip()
                if data.country:
                    unlinked_match.country = data.country.strip()
                if data.postal_code:
                    unlinked_match.postal_code = data.postal_code.strip()
                unlinked_match.updated_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
                await db.flush()

                await log_audit_event(
                    db=db,
                    actor_user_id=actor.id,
                    actor_username=actor.username,
                    actor_role=actor.role,
                    action_type="PATIENT_LINKED",
                    target_type="patients",
                    target_id=str(unlinked_match.id),
                    ip_address=client_ip,
                    user_agent=user_agent,
                    metadata={"patient_id": unlinked_match.patient_id, "linked_user_id": actor.id},
                )
                return unlinked_match

        if not data.override_duplicate:
            # Return duplicate conflict without leaking PHI details
            invalid_params = [
                {"name": d.matched_field, "reason": f"Matches existing patient record ({d.match_type})"}
                for d in duplicates
            ]
            raise DuplicatePatientException(
                detail="A patient with matching demographic identifiers already exists in the master index.",
                invalid_params=invalid_params,
            )

        # Override requested: Verify actor authorization
        if actor.role == "ROLE_PATIENT":
            raise PermissionDeniedException(
                detail="Patients are strictly prohibited from overriding duplicate demographic warnings.",
                code="DUPLICATE_RESOLUTION_DENIED",
            )

        if actor.role == "ROLE_ASSISTANT_ADMIN":
            has_scope = await check_assistant_admin_scope(db, actor.id, "duplicates:resolve")
            if not has_scope:
                raise PermissionDeniedException(
                    detail="Assistant Administrator lacks required permission scope 'duplicates:resolve'.",
                    code="SCOPE_PERMISSION_DENIED",
                )

        # Mandate concise administrative justification
        if not data.justification or not data.justification.strip():
            raise JustificationRequiredException(
                detail="A concise administrative justification note is mandatory to execute a duplicate override."
            )

        # Log override audit event
        await log_audit_event(
            db=db,
            actor_user_id=actor.id,
            actor_username=actor.username,
            actor_role=actor.role,
            action_type="OVERRIDE_DUPLICATE_WARNING",
            target_type="patients",
            justification=data.justification.strip()[:255],
            ip_address=client_ip,
            user_agent=user_agent,
            metadata={"matched_fields": [d.matched_field for d in duplicates]},
        )

    # Generate business PID
    new_pid = await generate_patient_id(db)
    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    patient = Patient(
        patient_id=new_pid,
        user_id=user_id,
        full_name=data.full_name.strip(),
        date_of_birth=data.date_of_birth.strip(),
        gender=data.gender.strip(),
        blood_group=data.blood_group.strip() if data.blood_group else "Unknown",
        primary_mobile=data.primary_mobile.strip(),
        email=data.email.strip() if data.email else None,
        street_address=data.street_address.strip() if data.street_address else None,
        city=data.city.strip() if data.city else None,
        state=data.state.strip() if data.state else None,
        country=data.country.strip() if data.country else "India",
        postal_code=data.postal_code.strip() if data.postal_code else None,
        is_active=1,
        created_at=now_str,
        updated_at=now_str,
    )
    db.add(patient)
    await db.flush()

    await log_audit_event(
        db=db,
        actor_user_id=actor.id,
        actor_username=actor.username,
        actor_role=actor.role,
        action_type="PATIENT_CREATED",
        target_type="patients",
        target_id=str(patient.id),
        ip_address=client_ip,
        user_agent=user_agent,
        metadata={"patient_id": patient.patient_id},
    )
    return patient


async def get_patient_by_id(
    db: AsyncSession,
    actor: User,
    patient_identifier: str,
) -> Patient:
    """Retrieve patient master record by surrogate ID or business PID with ownership enforcement."""
    # Find patient by surrogate integer ID or business PID string
    if patient_identifier.isdigit():
        stmt = select(Patient).where(Patient.id == int(patient_identifier), Patient.is_active == 1)
    else:
        stmt = select(Patient).where(Patient.patient_id == patient_identifier, Patient.is_active == 1)

    result = await db.execute(stmt)
    patient = result.scalar_one_or_none()

    if not patient:
        raise PatientNotFoundException()

    # Enforce ownership and access restrictions
    if actor.role == "ROLE_PATIENT":
        if patient.user_id != actor.id:
            raise PermissionDeniedException(
                detail="Access denied: You are not authorized to view clinical records of another patient.",
                code="PERMISSION_DENIED",
            )

    elif actor.role == "ROLE_ASSISTANT_ADMIN":
        has_scope = await check_assistant_admin_scope(db, actor.id, "records:view_all")
        if not has_scope:
            raise PermissionDeniedException(
                detail="Assistant Administrator lacks required permission scope 'records:view_all'.",
                code="SCOPE_PERMISSION_DENIED",
            )

    return patient


async def get_patient_for_user(
    db: AsyncSession,
    user_id: int,
) -> Patient:
    """Retrieve patient record linked to the specified user account."""
    stmt = select(Patient).where(Patient.user_id == user_id, Patient.is_active == 1)
    result = await db.execute(stmt)
    patient = result.scalar_one_or_none()
    if not patient:
        # Check if an unlinked patient profile matches this user's email
        user_stmt = select(User).where(User.id == user_id)
        user = (await db.execute(user_stmt)).scalar_one_or_none()
        if user and user.role == "ROLE_PATIENT" and user.email:
            unlinked_stmt = select(Patient).where(
                func.lower(Patient.email) == user.email.strip().lower(),
                Patient.user_id == None,
                Patient.is_active == 1,
            )
            unlinked = (await db.execute(unlinked_stmt)).scalars().first()
            if unlinked:
                unlinked.user_id = user.id
                unlinked.updated_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
                await db.flush()
                return unlinked
        raise PatientNotFoundException("No patient profile is associated with this authenticated account.")
    return patient


async def list_patients(
    db: AsyncSession,
    actor: User,
    page: int = 1,
    limit: int = 20,
    query: Optional[str] = None,
    is_active: int = 1,
) -> Tuple[List[Patient], int]:
    """List or search patient master records with pagination. Strictly restricted to clinical staff."""
    if actor.role == "ROLE_PATIENT":
        raise PermissionDeniedException(
            detail="Patient accounts are strictly prohibited from listing patient master records.",
            code="PERMISSION_DENIED",
        )

    if actor.role == "ROLE_ASSISTANT_ADMIN":
        has_scope = await check_assistant_admin_scope(db, actor.id, "records:view_all")
        if not has_scope:
            raise PermissionDeniedException(
                detail="Assistant Administrator lacks required permission scope 'records:view_all'.",
                code="SCOPE_PERMISSION_DENIED",
            )

    # Base filter
    base_stmt = select(Patient).where(Patient.is_active == is_active)

    if query and query.strip():
        q = f"%{query.strip()}%"
        base_stmt = base_stmt.where(
            or_(
                Patient.full_name.ilike(q),
                Patient.primary_mobile.ilike(q),
                Patient.email.ilike(q),
                Patient.patient_id.ilike(q),
            )
        )

    # Total count
    count_stmt = select(func.count()).select_from(base_stmt.subquery())
    total_count = (await db.execute(count_stmt)).scalar() or 0

    # Pagination
    offset = max(0, (page - 1) * limit)
    paged_stmt = base_stmt.order_by(Patient.created_at.desc(), Patient.id.desc()).offset(offset).limit(limit)
    items = list((await db.execute(paged_stmt)).scalars().all())

    return items, total_count


async def update_patient(
    db: AsyncSession,
    actor: User,
    patient_identifier: str,
    data: PatientUpdate,
    client_ip: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> Patient:
    """Update patient master record demographics with ownership verification."""
    patient = await get_patient_by_id(db, actor, patient_identifier)

    # Additional authorization for staff modifying patient records
    if actor.role == "ROLE_ASSISTANT_ADMIN":
        has_scope = (
            await check_assistant_admin_scope(db, actor.id, "accounts:patient_manage")
            or await check_assistant_admin_scope(db, actor.id, "registrations:edit")
        )
        if not has_scope:
            raise PermissionDeniedException(
                detail="Assistant Administrator lacks permission scope to update patient records.",
                code="SCOPE_PERMISSION_DENIED",
            )

    # Check duplicates if mobile, email, or full_name is modified
    new_mobile = data.primary_mobile or patient.primary_mobile
    new_email = data.email if data.email is not None else patient.email
    new_name = data.full_name or patient.full_name

    if (
        (data.primary_mobile and data.primary_mobile != patient.primary_mobile)
        or (data.email and data.email != patient.email)
        or (data.full_name and data.full_name != patient.full_name)
    ):
        duplicates = await check_patient_duplicates(
            db=db,
            mobile=new_mobile,
            email=new_email,
            full_name=new_name,
            dob=patient.date_of_birth,
            exclude_patient_id=patient.id,
        )
        if duplicates:
            invalid_params = [
                {"name": d.matched_field, "reason": f"Matches existing patient ({d.match_type})"}
                for d in duplicates
            ]
            raise DuplicatePatientException(
                detail="Update rejected: demographic attributes conflict with another patient master record.",
                invalid_params=invalid_params,
            )

    # Apply updates
    if data.full_name:
        patient.full_name = data.full_name.strip()
    if data.gender:
        patient.gender = data.gender.strip()
    if data.blood_group:
        patient.blood_group = data.blood_group.strip()
    if data.primary_mobile:
        patient.primary_mobile = data.primary_mobile.strip()
    if data.email is not None:
        patient.email = data.email.strip() if data.email else None
    if data.street_address is not None:
        patient.street_address = data.street_address.strip() if data.street_address else None
    if data.city is not None:
        patient.city = data.city.strip() if data.city else None
    if data.state is not None:
        patient.state = data.state.strip() if data.state else None
    if data.country is not None:
        patient.country = data.country.strip() if data.country else "India"
    if data.postal_code is not None:
        patient.postal_code = data.postal_code.strip() if data.postal_code else None

    patient.updated_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    await db.flush()

    await log_audit_event(
        db=db,
        actor_user_id=actor.id,
        actor_username=actor.username,
        actor_role=actor.role,
        action_type="PATIENT_UPDATED",
        target_type="patients",
        target_id=str(patient.id),
        ip_address=client_ip,
        user_agent=user_agent,
    )
    return patient


async def delete_patient(
    db: AsyncSession,
    actor: User,
    patient_identifier: str,
    client_ip: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> dict:
    """Permanently delete a patient master record and dependent registrations/documents from SQLite.

    1. Restricted strictly to Super Users.
    2. Identifies and deletes dependent uploaded documents (and files on disk).
    3. Identifies and deletes dependent registrations (and compiled PDF files on disk).
    4. Deletes the Patient row from `patients`.
    5. Appends audit log entry for regulatory compliance.
    """
    if actor.role != "ROLE_SUPER_USER":
        raise PermissionDeniedException(
            detail="Access denied: Only Super Users have authorization to permanently delete patient records.",
            code="PERMISSION_DENIED",
        )

    if patient_identifier.isdigit():
        stmt = select(Patient).where(Patient.id == int(patient_identifier))
    else:
        stmt = select(Patient).where(Patient.patient_id == patient_identifier)

    res = await db.execute(stmt)
    patient = res.scalar_one_or_none()
    if not patient:
        raise PatientNotFoundException()

    pat_id = patient.id
    pid_str = patient.patient_id

    # 1. Clean up dependent registrations and their compiled PDFs
    regs_stmt = select(Registration).where(Registration.patient_id == pat_id)
    regs = (await db.execute(regs_stmt)).scalars().all()
    for reg in regs:
        if reg.pdf_path:
            try:
                p_file = Path(reg.pdf_path)
                if p_file.exists():
                    p_file.unlink(missing_ok=True)
            except Exception as e:
                logger.warning("Failed to unlink PDF file %s: %s", reg.pdf_path, e)
        await db.delete(reg)
    await db.flush()

    # 2. Clean up uploaded documents and files
    docs_stmt = select(UploadedDocument).where(UploadedDocument.patient_id == pat_id)
    docs = (await db.execute(docs_stmt)).scalars().all()
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

    # 3. Delete the patient record
    await db.delete(patient)
    await db.flush()

    # 4. Audit trail
    await log_audit_event(
        db=db,
        actor_user_id=actor.id,
        actor_username=actor.username,
        actor_role=actor.role,
        action_type="PATIENT_DELETED",
        target_type="patients",
        target_id=str(pat_id),
        justification="Permanent patient deletion by Super User",
        ip_address=client_ip,
        user_agent=user_agent,
        metadata={"patient_id": pid_str, "registrations_removed": len(regs), "documents_removed": len(docs)},
    )

    return {
        "success": True,
        "message": f"Patient record {pid_str} and associated records successfully deleted.",
        "deleted_patient_id": pid_str,
        "registrations_deleted_count": len(regs),
    }


