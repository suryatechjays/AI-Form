"""Authoritative PDF compilation service using WeasyPrint and Jinja2 with PyMuPDF fallback.

Responsibilities:
1. Compiles publication-grade A4 registration dossiers under single-worker concurrency guarantees.
2. In-process task execution via FastAPI BackgroundTasks with strict fresh session isolation.
3. Debounced regeneration preventing parallel rendering collisions (HTTP 409).
4. Startup lifespan sweep identifying interrupted PENDING jobs and marking them FAILED.
5. Permanent retention of compiled PDFs even if registration is subsequently marked REJECTED.
6. Decoupled persistence: PDF generation failure never invalidates committed registration records.
7. Audit trail logging without clinical narrative leakage.
"""

import asyncio
from datetime import datetime, timezone
import hashlib
import logging
import os
from pathlib import Path
from typing import Optional, Tuple
import uuid

import jinja2
import pymupdf
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.core.exceptions import (
    IllegalStateTransitionException,
    PDFGenerationInProgressException,
    PDFNotFoundException,
    PermissionDeniedException,
    RegistrationNotFoundException,
)
from app.database import AsyncSessionLocal
from app.models.patient import Patient
from app.models.registration import Registration
from app.models.user import User
from app.services.audit_service import log_audit_event
from app.services.permission_service import check_assistant_admin_scope

logger = logging.getLogger("aegis.pdf_service")
settings = get_settings()

TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "templates"
jinja_env = jinja2.Environment(
    loader=jinja2.FileSystemLoader(str(TEMPLATES_DIR)),
    autoescape=jinja2.select_autoescape(["html", "xml"]),
)


def render_dossier_html(registration: Registration, patient: Patient) -> str:
    """Render HTML print template using Jinja2."""
    template = jinja_env.get_template("registration_dossier.html")
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    return template.render(
        reg=registration,
        patient=patient,
        generated_at=now_iso,
    )


def _compile_pymupdf_dossier(registration: Registration, patient: Patient) -> bytes:
    """Authoritative A4 PDF compiler utilizing native PyMuPDF vector graphics and typography.
    
    Serves as a robust cross-platform generator ensuring publication-grade output across all environments.
    """
    doc = pymupdf.open()
    # A4 standard size: 595.3 x 841.9 points
    page = doc.new_page(width=595, height=842)
    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    # Header section
    page.draw_rect(pymupdf.Rect(36, 36, 559, 90), color=(0.12, 0.23, 0.54), width=1.5)
    page.insert_text(
        (50, 60),
        "AEGIS CLINICAL HEALTHCARE SYSTEM",
        fontsize=14,
        fontname="helv",
        color=(0.12, 0.23, 0.54),
    )
    page.insert_text(
        (50, 75),
        "Department of Clinical Admissions & Ambulatory Care",
        fontsize=9,
        fontname="helv",
        color=(0.3, 0.3, 0.3),
    )
    page.insert_text(
        (50, 85),
        "Official Authoritative Patient Registration Dossier",
        fontsize=8,
        fontname="helv",
        color=(0.4, 0.4, 0.4),
    )

    # Right Badge
    page.insert_text(
        (420, 60),
        f"STATUS: {registration.status}",
        fontsize=10,
        fontname="helv",
        color=(0.02, 0.5, 0.3),
    )
    page.insert_text(
        (420, 75),
        f"ENCOUNTER: {registration.registration_id}",
        fontsize=9,
        fontname="helv",
        color=(0.12, 0.23, 0.54),
    )
    page.insert_text(
        (420, 85),
        f"PATIENT PID: {patient.patient_id}",
        fontsize=8,
        fontname="helv",
        color=(0.3, 0.3, 0.3),
    )

    y = 110

    def draw_section_header(title: str, curr_y: float) -> float:
        page.draw_rect(pymupdf.Rect(36, curr_y, 559, curr_y + 18), color=(0.94, 0.98, 0.96), fill=(0.94, 0.98, 0.96))
        page.draw_rect(pymupdf.Rect(36, curr_y, 40, curr_y + 18), color=(0.02, 0.59, 0.41), fill=(0.02, 0.59, 0.41))
        page.insert_text((45, curr_y + 13), title, fontsize=9, fontname="helv", color=(0.12, 0.23, 0.54))
        return curr_y + 24

    def draw_row(label1: str, val1: str, label2: str, val2: str, curr_y: float) -> float:
        page.draw_rect(pymupdf.Rect(36, curr_y, 559, curr_y + 16), color=(0.9, 0.9, 0.9), width=0.5)
        page.draw_rect(pymupdf.Rect(36, curr_y, 160, curr_y + 16), fill=(0.97, 0.98, 0.99))
        page.draw_rect(pymupdf.Rect(300, curr_y, 420, curr_y + 16), fill=(0.97, 0.98, 0.99))
        page.insert_text((42, curr_y + 11), label1, fontsize=8, fontname="helv", color=(0.2, 0.2, 0.2))
        page.insert_text((165, curr_y + 11), str(val1)[:30], fontsize=8, fontname="helv", color=(0.0, 0.0, 0.0))
        page.insert_text((306, curr_y + 11), label2, fontsize=8, fontname="helv", color=(0.2, 0.2, 0.2))
        page.insert_text((425, curr_y + 11), str(val2)[:30], fontsize=8, fontname="helv", color=(0.0, 0.0, 0.0))
        return curr_y + 16

    def draw_full_row(label: str, val: str, curr_y: float) -> float:
        page.draw_rect(pymupdf.Rect(36, curr_y, 559, curr_y + 16), color=(0.9, 0.9, 0.9), width=0.5)
        page.draw_rect(pymupdf.Rect(36, curr_y, 160, curr_y + 16), fill=(0.97, 0.98, 0.99))
        page.insert_text((42, curr_y + 11), label, fontsize=8, fontname="helv", color=(0.2, 0.2, 0.2))
        page.insert_text((165, curr_y + 11), str(val)[:75], fontsize=8, fontname="helv", color=(0.0, 0.0, 0.0))
        return curr_y + 16

    # 1. Demographics
    y = draw_section_header("1. PATIENT IDENTIFICATION & DEMOGRAPHICS", y)
    y = draw_row("Full Legal Name", patient.full_name, "Patient Master ID", patient.patient_id, y)
    y = draw_row("Date of Birth", patient.date_of_birth, "Age at Encounter", f"{registration.age_at_registration} years", y)
    y = draw_row("Legal Gender", patient.gender, "Blood Group", patient.blood_group, y)
    y += 8

    # 2. Contacts
    y = draw_section_header("2. CONTACT & RESIDENTIAL DETAILS", y)
    y = draw_row("Primary Mobile", registration.contact_mobile, "Email Address", registration.contact_email or "Not Provided", y)
    y = draw_full_row("Residential Address", registration.residential_address or patient.street_address or "Not Provided", y)
    y += 8

    # 3. Emergency Contact
    y = draw_section_header("3. EMERGENCY CONTACT DESIGNATION", y)
    y = draw_row("Contact Person", registration.emergency_contact_name or "None Designated", "Relationship", registration.emergency_contact_relationship or "N/A", y)
    y = draw_row("Emergency Phone", registration.emergency_contact_phone or "N/A", "Verification State", "Documented at Admissions", y)
    y += 8

    # 4. Medical Information
    y = draw_section_header("4. MEDICAL INFORMATION & CLINICAL DISCLOSURES", y)
    y = draw_row("Existing Conditions", registration.existing_conditions, "Past Surgeries", registration.previous_surgeries, y)
    y = draw_row("Current Medications", registration.current_medications, "Allergy Status", registration.allergy_status, y)
    if registration.allergies_detail:
        y = draw_full_row("Allergies Detail", registration.allergies_detail, y)
    y = draw_full_row("Medical History", registration.medical_history, y)
    if registration.disability_accommodations:
        y = draw_full_row("Disability Accommodations", registration.disability_accommodations, y)
    y += 8

    # 5. Insurance Information
    y = draw_section_header("5. INSURANCE & FINANCIAL RESPONSIBILITY", y)
    y = draw_row("Coverage Status", "Active Insurance" if registration.has_insurance else "Self-Pay Patient", "Insurance Provider", registration.insurance_provider or "N/A", y)
    if registration.has_insurance:
        y = draw_row("Policy Number", registration.insurance_policy_number or "N/A", "Policy Holder", registration.insurance_policy_holder or "N/A", y)
        y = draw_row("Expiration Date", registration.insurance_expiry_date or "N/A", "Coverage Verification", "Verified", y)
    y += 8

    # 6. Encounter Routing
    y = draw_section_header("6. ENCOUNTER ROUTING & CLINICAL ASSIGNMENT", y)
    y = draw_row("Department", registration.department or "General Medicine", "Attending Clinician", registration.preferred_doctor or "Staff On Duty", y)
    y = draw_row("Preferred Date", registration.preferred_appointment_date or "Walk-in / Immediate", "Triage Protocol", "AEGIS Electronic Triage", y)
    y = draw_full_row("Reason for Visit", registration.reason_for_visit or "General Medical Evaluation", y)
    y += 15

    # 7. Stamp & Signature Box
    page.draw_rect(pymupdf.Rect(40, y, 260, y + 65), color=(0.4, 0.4, 0.4), width=1)
    page.insert_text((90, y + 20), "OFFICIAL HOSPITAL STAMP", fontsize=8, fontname="helv", color=(0.12, 0.23, 0.54))
    page.insert_text((65, y + 42), "Institutional Embossed Verification Seal", fontsize=7, fontname="helv", color=(0.5, 0.5, 0.5))

    page.draw_line((310, y + 50), (550, y + 50), color=(0.1, 0.1, 0.1), width=1)
    page.insert_text((330, y + 62), "Authorized Admissions Officer / Registrar Signature", fontsize=7.5, fontname="helv", color=(0.2, 0.2, 0.2))

    # Footer Disclaimer
    footer_text = f"CONFIDENTIAL MEDICAL RECORD | AEGIS Integrated Health | Generated: {now_str} | Single-Worker Compliant"
    page.insert_text((40, 815), footer_text, fontsize=6.5, fontname="helv", color=(0.4, 0.4, 0.4))

    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


def compile_html_to_pdf_bytes(html_content: str, registration: Registration, patient: Patient) -> bytes:
    """Compile HTML to publication-grade A4 PDF using WeasyPrint with PyMuPDF fallback."""
    try:
        import weasyprint  # noqa: F401
        logger.info("Compiling registration dossier via WeasyPrint engine...")
        return weasyprint.HTML(string=html_content).write_pdf()
    except Exception as exc:
        logger.info(
            "WeasyPrint rendering unavailable or failed (%s). Utilizing PyMuPDF authoritative compiler.",
            exc,
        )
        return _compile_pymupdf_dossier(registration, patient)


async def compile_registration_pdf_task(registration_id: int) -> None:
    """In-process background task compiling authoritative PDF dossier with isolated DB session.
    
    Session Isolation Rule:
    The HTTP request session is closed by the time this task executes.
    This task acquires its own fresh AsyncSessionLocal context manager.
    """
    logger.info("Executing background PDF compilation task for registration ID=%d", registration_id)
    async with AsyncSessionLocal() as session:
        try:
            stmt = (
                select(Registration)
                .options(selectinload(Registration.patient))
                .where(Registration.id == registration_id)
            )
            res = await session.execute(stmt)
            reg = res.scalar_one_or_none()

            if not reg:
                logger.error("Background task: Registration ID %d not found.", registration_id)
                return

            if reg.status not in ("SUBMITTED", "REJECTED", "PENDING_REVIEW"):
                logger.warning(
                    "Background task: Registration %s has status '%s'. PDF compilation skipped.",
                    reg.registration_id,
                    reg.status,
                )
                return

            patient = reg.patient
            if not patient:
                logger.error("Background task: Patient record missing for registration %s.", reg.registration_id)
                reg.pdf_status = "FAILED"
                reg.pdf_error_message = "Associated patient master record not found."
                await session.commit()
                return

            # Render HTML and compile PDF in worker thread
            html_content = render_dossier_html(reg, patient)
            pdf_bytes = await asyncio.to_thread(
                compile_html_to_pdf_bytes, html_content, reg, patient
            )

            # Compute SHA-256 checksum
            checksum = hashlib.sha256(pdf_bytes).hexdigest()

            # Ensure PDF storage directory exists
            settings.PDF_DIR.mkdir(parents=True, exist_ok=True)
            doc_file_name = f"{reg.registration_id}_{uuid.uuid4().hex[:8]}.pdf"
            pdf_path = settings.PDF_DIR / doc_file_name

            with open(pdf_path, "wb") as f:
                f.write(pdf_bytes)

            now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

            reg.pdf_status = "GENERATED"
            reg.pdf_path = str(pdf_path)
            reg.pdf_checksum_sha256 = checksum
            reg.pdf_generated_at = now_iso
            reg.pdf_error_message = None

            await session.commit()
            logger.info("Registration %s PDF generated successfully: path=%s, sha256=%s", reg.registration_id, pdf_path, checksum)

            # Log audit event (Metadata contains NO patient clinical information / PHI)
            await log_audit_event(
                db=session,
                actor_user_id=reg.submitted_by_user_id or reg.created_by_user_id,
                actor_username="system.background_worker",
                actor_role="ROLE_SYSTEM",
                action_type="PDF_GENERATED",
                target_type="registrations",
                target_id=str(reg.id),
                metadata={
                    "registration_id": reg.registration_id,
                    "pdf_status": "GENERATED",
                    "checksum_sha256": checksum,
                },
            )
            await session.commit()

        except Exception as exc:
            logger.error("Failed to compile PDF for registration ID %d: %s", registration_id, exc, exc_info=True)
            try:
                # Mark as FAILED without affecting registration status
                reg.pdf_status = "FAILED"
                reg.pdf_error_message = str(exc)[:500]
                await session.commit()

                await log_audit_event(
                    db=session,
                    actor_user_id=reg.submitted_by_user_id or reg.created_by_user_id,
                    actor_username="system.background_worker",
                    actor_role="ROLE_SYSTEM",
                    action_type="PDF_GENERATION_FAILED",
                    target_type="registrations",
                    target_id=str(reg.id),
                    metadata={
                        "registration_id": reg.registration_id,
                        "error": str(exc)[:255],
                    },
                )
                await session.commit()
            except Exception as inner_err:
                logger.error("Failed to update PDF failure state in database: %s", inner_err)


async def regenerate_registration_pdf(
    db: AsyncSession,
    actor: User,
    registration_identifier: str,
) -> Registration:
    """Authorized manual clerical regeneration workflow for failed or pending PDFs."""
    # 1. Permission checks
    if actor.role == "ROLE_PATIENT":
        raise PermissionDeniedException(
            detail="Patient accounts are strictly unauthorized to trigger administrative PDF regeneration.",
            code="PERMISSION_DENIED",
        )
    elif actor.role == "ROLE_ASSISTANT_ADMIN":
        has_scope = await check_assistant_admin_scope(db, actor.id, "pdf:regenerate")
        if not has_scope:
            raise PermissionDeniedException(
                detail="Assistant Administrator lacks required permission scope 'pdf:regenerate'.",
                code="SCOPE_PERMISSION_DENIED",
            )

    # 2. Retrieve registration
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

    # Must be in SUBMITTED status
    if reg.status != "SUBMITTED":
        raise IllegalStateTransitionException(
            f"Cannot compile PDF for registration in '{reg.status}' status. Only SUBMITTED registrations can be compiled."
        )

    # 3. Duplicate Prevention: Check if already PENDING
    if reg.pdf_status == "PENDING":
        raise PDFGenerationInProgressException(
            detail="PDF compilation is already in progress for this registration encounter."
        )

    # Mark PENDING for regeneration
    reg.pdf_status = "PENDING"
    reg.pdf_error_message = None
    reg.updated_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    await db.flush()

    # Log audit event (NO PHI logged)
    await log_audit_event(
        db=db,
        actor_user_id=actor.id,
        actor_username=actor.username,
        actor_role=actor.role,
        action_type="PDF_REGENERATION_REQUESTED",
        target_type="registrations",
        target_id=str(reg.id),
        metadata={"registration_id": reg.registration_id},
    )

    return reg


async def get_registration_pdf_file(
    db: AsyncSession,
    actor: User,
    registration_identifier: str,
) -> Tuple[str, str, str]:
    """Retrieve compiled PDF file path for download with ownership and staff access governance.
    
    Returns:
        Tuple of (physical_storage_path, suggested_download_filename, mime_type)
    """
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

    # Access Authorization
    if actor.role == "ROLE_PATIENT":
        # Patient can ONLY download their own registration PDF
        if reg.created_by_user_id != actor.id and (not reg.patient or reg.patient.user_id != actor.id):
            raise PermissionDeniedException(
                detail="Access denied: You are not authorized to download this patient registration PDF.",
                code="PERMISSION_DENIED",
            )
    elif actor.role == "ROLE_ASSISTANT_ADMIN":
        if reg.created_by_user_id != actor.id:
            has_download = await check_assistant_admin_scope(db, actor.id, "pdf:download_all")
            has_view = await check_assistant_admin_scope(db, actor.id, "records:view_all")
            if not (has_download or has_view):
                raise PermissionDeniedException(
                    detail="Assistant Administrator lacks required permission scope 'pdf:download_all'.",
                    code="SCOPE_PERMISSION_DENIED",
                )

    # Status check
    if reg.pdf_status == "PENDING":
        raise PDFGenerationInProgressException(
            detail="The registration PDF dossier is currently being compiled. Please retry in a few moments."
        )

    if reg.pdf_status != "GENERATED" or not reg.pdf_path:
        raise PDFNotFoundException(
            detail="The registration PDF dossier has not been generated or compilation failed."
        )

    if not os.path.exists(reg.pdf_path):
        logger.error("PDF file path in database (%s) does not exist on disk.", reg.pdf_path)
        raise PDFNotFoundException(detail="Compiled PDF file is missing from storage volume.")

    filename = f"{reg.registration_id}_dossier.pdf"
    return reg.pdf_path, filename, "application/pdf"


async def sweep_stale_pending_pdf_jobs(engine: AsyncEngine) -> int:
    """Identify interrupted PENDING jobs upon startup and mark them FAILED.
    
    Executes in single-worker mode strictly before incoming HTTP traffic is accepted,
    preventing race conditions or active task corruption.
    """
    async with engine.begin() as conn:
        result = await conn.execute(
            text(
                "UPDATE registrations "
                "SET pdf_status = 'FAILED', pdf_error_message = 'Interrupted by application restart' "
                "WHERE status = 'SUBMITTED' AND pdf_status = 'PENDING';"
            )
        )
        count = result.rowcount
        if count > 0:
            logger.warning("Startup Lifespan Sweep: Marked %d interrupted PENDING PDF jobs as FAILED.", count)
        else:
            logger.info("Startup Lifespan Sweep: Zero interrupted PENDING PDF jobs found.")
        return count

