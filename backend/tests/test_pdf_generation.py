"""Comprehensive tests for AEGIS Patient Registration PDF Generation (Phase 2, Task 6).

Covers:
1. Publication-grade A4 PDF compilation from submitted patient registration data.
2. WeasyPrint & Jinja2 architecture with PyMuPDF authoritative fallback.
3. Physical storage in 'generated_pdfs' directory and SHA-256 checksum generation.
4. Prevention of duplicate compilation when PDF is already PENDING (HTTP 409).
5. BackgroundTasks decoupled in-process execution with fresh database session isolation.
6. Startup lifespan sweep identifying interrupted PENDING jobs and marking them FAILED.
7. Authorized manual clerical regeneration workflow for failed or pending PDFs.
8. Authenticated download endpoint with patient ownership and staff permission checks.
9. Resilience: PDF generation failure never rolls back or invalidates submitted registration.
10. Permanent physical retention of compiled PDFs even if registration is subsequently REJECTED.
11. Audit logging without patient clinical narrative disclosure.
"""

from datetime import datetime, timezone
import hashlib
import os
from unittest.mock import patch
import uuid
import pytest
from sqlalchemy import select

from app.config import get_settings
from app.core.security import create_access_token, hash_password
from app.database import engine, get_db
from app.models.audit import AuditEvent
from app.models.patient import Patient
from app.models.registration import Registration
from app.models.user import User
from app.services.pdf_service import (
    compile_registration_pdf_task,
    sweep_stale_pending_pdf_jobs,
)
from app.services.permission_service import grant_permission_scope

settings = get_settings()


def uid() -> str:
    """Generate unique suffix for test isolation."""
    return uuid.uuid4().hex[:8]


# ==============================================================================
# 1. PDF COMPILATION, STORAGE & CHECKSUM TESTS
# ==============================================================================

@pytest.mark.asyncio
async def test_pdf_compilation_and_file_creation(async_client):
    """Verify publication-grade A4 PDF compilation, SHA-256 checksum, and storage persistence."""
    tag = uid()

    async for db in get_db():
        rec_u = User(
            username=f"rec_pdf_{tag}",
            email=f"rec_pdf_{tag}@hospital.org",
            hashed_password=hash_password("Pass123!"),
            role="ROLE_RECEPTIONIST",
            is_active=1,
        )
        db.add(rec_u)
        await db.flush()

        p = Patient(
            patient_id=f"PID-2026-A{tag[:4]}",
            full_name=f"Alastair Finch {tag}",
            date_of_birth="1984-07-14",
            gender="Male",
            blood_group="O+",
            primary_mobile=f"+1555{tag[:7]}",
            street_address="742 Evergreen Terrace",
            is_active=1,
        )
        db.add(p)
        await db.flush()

        reg = Registration(
            registration_id=f"AEGIS-2026-F{tag[:4]}",
            patient_id=p.id,
            created_by_user_id=rec_u.id,
            submitted_by_user_id=rec_u.id,
            status="SUBMITTED",
            age_at_registration=42,
            contact_mobile=p.primary_mobile,
            contact_email=f"alastair_{tag}@test.org",
            residential_address=p.street_address,
            emergency_contact_name="Sarah Finch",
            emergency_contact_relationship="Spouse",
            emergency_contact_phone="+15559876543",
            existing_conditions="Mild Hypertension",
            previous_surgeries="Appendectomy (2015)",
            current_medications="Lisinopril 10mg",
            allergy_status="Active Allergies Listed",
            allergies_detail="Penicillin rash",
            has_insurance=1,
            insurance_provider="Blue Cross Shield",
            insurance_policy_number="BCS-998877",
            department="Cardiology",
            preferred_doctor="Dr. House",
            reason_for_visit="Routine cardiac clearance",
            pdf_status="PENDING",
        )
        db.add(reg)
        await db.commit()
        reg_id = reg.id
        reg_business_id = reg.registration_id
        break

    # Execute decoupled background compilation task (obtains its own fresh session)
    await compile_registration_pdf_task(reg_id)

    # Verify database updates and file creation
    async for db in get_db():
        chk_stmt = select(Registration).where(Registration.id == reg_id)
        updated_reg = (await db.execute(chk_stmt)).scalar_one()

        assert updated_reg.pdf_status == "GENERATED"
        assert updated_reg.pdf_path is not None
        assert os.path.exists(updated_reg.pdf_path)
        assert updated_reg.pdf_checksum_sha256 is not None
        assert len(updated_reg.pdf_checksum_sha256) == 64
        assert updated_reg.pdf_generated_at is not None

        # Verify actual file on disk
        with open(updated_reg.pdf_path, "rb") as f:
            pdf_content = f.read()

        assert pdf_content.startswith(b"%PDF")
        expected_checksum = hashlib.sha256(pdf_content).hexdigest()
        assert updated_reg.pdf_checksum_sha256 == expected_checksum

        # Verify audit trail (Audit event contains NO clinical narrative)
        audit_stmt = select(AuditEvent).where(
            AuditEvent.target_entity_type == "registrations",
            AuditEvent.target_entity_id == str(reg_id),
            AuditEvent.action_type == "PDF_GENERATED",
        )
        audit = (await db.execute(audit_stmt)).scalar_one_or_none()
        assert audit is not None
        assert audit.action_type == "PDF_GENERATED"
        assert "Hypertension" not in (audit.clinical_justification or "")
        assert "Hypertension" not in (audit.metadata_json or "")
        break


# ==============================================================================
# 2. DUPLICATE PREVENTION & CLERICAL REGENERATION TESTS
# ==============================================================================

@pytest.mark.asyncio
async def test_duplicate_regeneration_prevention_when_pending(async_client):
    """Verify duplicate regeneration requests are rejected with HTTP 409 when already PENDING."""
    tag = uid()

    async for db in get_db():
        rec_u = User(
            username=f"rec_dup_{tag}",
            email=f"rec_dup_{tag}@hospital.org",
            hashed_password=hash_password("Pass123!"),
            role="ROLE_RECEPTIONIST",
            is_active=1,
        )
        db.add(rec_u)
        await db.flush()

        p = Patient(
            patient_id=f"PID-2026-D{tag[:4]}",
            full_name=f"Duplicate Guard Patient {tag}",
            date_of_birth="1992-05-10",
            gender="Female",
            primary_mobile=f"+1444{tag[:7]}",
            is_active=1,
        )
        db.add(p)
        await db.flush()

        reg = Registration(
            registration_id=f"AEGIS-2026-D{tag[:4]}",
            patient_id=p.id,
            created_by_user_id=rec_u.id,
            submitted_by_user_id=rec_u.id,
            status="SUBMITTED",
            age_at_registration=34,
            contact_mobile=p.primary_mobile,
            pdf_status="PENDING",  # Already in PENDING state
        )
        db.add(reg)
        await db.commit()
        rec_id, reg_business_id = rec_u.id, reg.registration_id
        break

    token = create_access_token(user_id=rec_id, username=f"rec_dup_{tag}", role="ROLE_RECEPTIONIST")

    # Attempt regeneration while status is PENDING -> 409 Conflict (PDF_GENERATION_IN_PROGRESS)
    r_dup = await async_client.post(
        f"{settings.API_V1_PREFIX}/registrations/{reg_business_id}/pdf/regenerate",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r_dup.status_code == 409
    assert r_dup.json()["code"] == "PDF_GENERATION_IN_PROGRESS"


@pytest.mark.asyncio
async def test_pdf_regeneration_clerical_workflow(async_client):
    """Verify authorized staff can trigger regeneration for failed PDFs."""
    tag = uid()

    async for db in get_db():
        rec_u = User(
            username=f"rec_regen_{tag}",
            email=f"rec_regen_{tag}@hospital.org",
            hashed_password=hash_password("Pass123!"),
            role="ROLE_RECEPTIONIST",
            is_active=1,
        )
        db.add(rec_u)
        await db.flush()

        p = Patient(
            patient_id=f"PID-2026-R{tag[:4]}",
            full_name=f"Regen Patient {tag}",
            date_of_birth="1980-02-02",
            gender="Other",
            primary_mobile=f"+1333{tag[:7]}",
            is_active=1,
        )
        db.add(p)
        await db.flush()

        # Registration with failed PDF status
        reg = Registration(
            registration_id=f"AEGIS-2026-R{tag[:4]}",
            patient_id=p.id,
            created_by_user_id=rec_u.id,
            submitted_by_user_id=rec_u.id,
            status="SUBMITTED",
            age_at_registration=46,
            contact_mobile=p.primary_mobile,
            pdf_status="FAILED",
            pdf_error_message="Simulated rendering error",
        )
        db.add(reg)
        await db.commit()
        rec_id, reg_business_id, reg_id = rec_u.id, reg.registration_id, reg.id
        break

    token = create_access_token(user_id=rec_id, username=f"rec_regen_{tag}", role="ROLE_RECEPTIONIST")

    # 1. Trigger regeneration -> 200 OK with PENDING status
    r_regen = await async_client.post(
        f"{settings.API_V1_PREFIX}/registrations/{reg_business_id}/pdf/regenerate",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r_regen.status_code == 200
    assert r_regen.json()["pdf_status"] == "PENDING"
    assert r_regen.json()["can_regenerate"] is True

    # 2. Complete compilation in background
    await compile_registration_pdf_task(reg_id)

    # 3. Verify status updated to GENERATED
    r_check = await async_client.get(
        f"{settings.API_V1_PREFIX}/registrations/{reg_business_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r_check.status_code == 200
    assert r_check.json()["pdf_status"] == "GENERATED"
    assert r_check.json()["can_regenerate"] is False


# ==============================================================================
# 3. STARTUP LIFESPAN SWEEP TESTS
# ==============================================================================

@pytest.mark.asyncio
async def test_startup_sweep_interrupted_pending_jobs():
    """Verify startup lifespan sweep marks stale PENDING jobs as FAILED without affecting GENERATED jobs."""
    tag = uid()

    async for db in get_db():
        rec_u = User(
            username=f"rec_sw_{tag}",
            email=f"rec_sw_{tag}@hospital.org",
            hashed_password=hash_password("Pass123!"),
            role="ROLE_RECEPTIONIST",
            is_active=1,
        )
        db.add(rec_u)
        await db.flush()

        p = Patient(
            patient_id=f"PID-2026-S{tag[:4]}",
            full_name=f"Sweep Patient {tag}",
            date_of_birth="1995-10-10",
            gender="Female",
            primary_mobile=f"+1222{tag[:7]}",
            is_active=1,
        )
        db.add(p)
        await db.flush()

        # Job A: Interrupted job left in PENDING status
        reg_a = Registration(
            registration_id=f"AEGIS-2026-A{tag[:4]}",
            patient_id=p.id,
            created_by_user_id=rec_u.id,
            status="SUBMITTED",
            age_at_registration=31,
            contact_mobile=p.primary_mobile,
            pdf_status="PENDING",
        )
        # Job B: Already completed job in GENERATED status
        reg_b = Registration(
            registration_id=f"AEGIS-2026-B{tag[:4]}",
            patient_id=p.id,
            created_by_user_id=rec_u.id,
            status="SUBMITTED",
            age_at_registration=31,
            contact_mobile=p.primary_mobile,
            pdf_status="GENERATED",
            pdf_path="/app/storage/dummy.pdf",
        )
        db.add_all([reg_a, reg_b])
        await db.commit()
        reg_a_id, reg_b_id = reg_a.id, reg_b.id
        break

    # Execute startup sweep
    updated_count = await sweep_stale_pending_pdf_jobs(engine)
    assert updated_count >= 1

    # Verify reconciliation in DB
    async for db in get_db():
        a = (await db.execute(select(Registration).where(Registration.id == reg_a_id))).scalar_one()
        b = (await db.execute(select(Registration).where(Registration.id == reg_b_id))).scalar_one()

        # Job A was safely transitioned to FAILED
        assert a.pdf_status == "FAILED"
        assert "Interrupted by application restart" in a.pdf_error_message

        # Job B was undisturbed
        assert b.pdf_status == "GENERATED"
        break


# ==============================================================================
# 4. DOWNLOAD ENDPOINT & OWNERSHIP ACCESS GOVERNANCE
# ==============================================================================

@pytest.mark.asyncio
async def test_authenticated_download_endpoint_and_ownership(async_client):
    """Verify download endpoint enforces patient self-ownership and Assistant Admin scope rules."""
    tag1, tag2 = uid(), uid()

    async for db in get_db():
        u1 = User(
            username=f"pat_dl1_{tag1}",
            email=f"pat_dl1_{tag1}@test.org",
            hashed_password=hash_password("Pass123!"),
            role="ROLE_PATIENT",
            is_active=1,
        )
        u2 = User(
            username=f"pat_dl2_{tag2}",
            email=f"pat_dl2_{tag2}@test.org",
            hashed_password=hash_password("Pass123!"),
            role="ROLE_PATIENT",
            is_active=1,
        )
        aa_no_scope = User(
            username=f"aa_noscope_{tag1}",
            email=f"aa_noscope_{tag1}@hospital.org",
            hashed_password=hash_password("Pass123!"),
            role="ROLE_ASSISTANT_ADMIN",
            is_active=1,
        )
        aa_scoped = User(
            username=f"aa_scoped_{tag1}",
            email=f"aa_scoped_{tag1}@hospital.org",
            hashed_password=hash_password("Pass123!"),
            role="ROLE_ASSISTANT_ADMIN",
            is_active=1,
        )
        super_u = User(
            username=f"su_dl_{tag1}",
            email=f"su_dl_{tag1}@hospital.org",
            hashed_password=hash_password("Pass123!"),
            role="ROLE_SUPER_USER",
            is_active=1,
        )
        db.add_all([u1, u2, aa_no_scope, aa_scoped, super_u])
        await db.flush()

        p1 = Patient(
            patient_id=f"PID-2026-1{tag1[:4]}",
            user_id=u1.id,
            full_name=f"Patient One {tag1}",
            date_of_birth="1990-01-01",
            gender="Female",
            primary_mobile=f"+1111{tag1[:7]}",
            is_active=1,
        )
        db.add(p1)
        await db.flush()

        reg1 = Registration(
            registration_id=f"AEGIS-2026-1{tag1[:4]}",
            patient_id=p1.id,
            created_by_user_id=u1.id,
            submitted_by_user_id=u1.id,
            status="SUBMITTED",
            age_at_registration=36,
            contact_mobile=p1.primary_mobile,
            pdf_status="PENDING",
        )
        db.add(reg1)
        await db.commit()

        # Grant pdf:download_all to aa_scoped
        await grant_permission_scope(db, super_u, aa_scoped, "pdf:download_all")
        await db.commit()

        u1_id, u2_id = u1.id, u2.id
        aa_no_id, aa_sc_id = aa_no_scope.id, aa_scoped.id
        reg1_id = reg1.id
        reg1_business_id = reg1.registration_id
        break

    # Compile PDF for Registration 1
    await compile_registration_pdf_task(reg1_id)

    t1 = create_access_token(user_id=u1_id, username=f"pat_dl1_{tag1}", role="ROLE_PATIENT")
    t2 = create_access_token(user_id=u2_id, username=f"pat_dl2_{tag2}", role="ROLE_PATIENT")
    t_aa_no = create_access_token(user_id=aa_no_id, username=f"aa_noscope_{tag1}", role="ROLE_ASSISTANT_ADMIN")
    t_aa_sc = create_access_token(user_id=aa_sc_id, username=f"aa_scoped_{tag1}", role="ROLE_ASSISTANT_ADMIN")

    # 1. Patient 1 downloads their own dossier -> 200 OK with PDF binary
    r_own = await async_client.get(
        f"{settings.API_V1_PREFIX}/registrations/{reg1_business_id}/pdf",
        headers={"Authorization": f"Bearer {t1}"},
    )
    assert r_own.status_code == 200
    assert r_own.headers["content-type"] == "application/pdf"
    assert r_own.content.startswith(b"%PDF")

    # 2. Patient 2 attempts to download Patient 1's dossier -> 403 Forbidden
    r_other = await async_client.get(
        f"{settings.API_V1_PREFIX}/registrations/{reg1_business_id}/pdf",
        headers={"Authorization": f"Bearer {t2}"},
    )
    assert r_other.status_code == 403

    # 3. Assistant Admin WITHOUT pdf:download_all -> 403 Forbidden
    r_aa_no = await async_client.get(
        f"{settings.API_V1_PREFIX}/registrations/{reg1_business_id}/pdf",
        headers={"Authorization": f"Bearer {t_aa_no}"},
    )
    assert r_aa_no.status_code == 403
    assert r_aa_no.json()["code"] == "SCOPE_PERMISSION_DENIED"

    # 4. Assistant Admin WITH pdf:download_all -> 200 OK
    r_aa_sc = await async_client.get(
        f"{settings.API_V1_PREFIX}/registrations/{reg1_business_id}/pdf",
        headers={"Authorization": f"Bearer {t_aa_sc}"},
    )
    assert r_aa_sc.status_code == 200
    assert r_aa_sc.headers["content-type"] == "application/pdf"


# ==============================================================================
# 5. RESILIENCE: RENDERING FAILURE DOES NOT ROLLBACK REGISTRATION
# ==============================================================================

@pytest.mark.asyncio
async def test_pdf_failure_does_not_rollback_submitted_registration():
    """Verify WeasyPrint rendering failure leaves registration safely in SUBMITTED status."""
    tag = uid()

    async for db in get_db():
        rec_u = User(
            username=f"rec_fail_{tag}",
            email=f"rec_fail_{tag}@hospital.org",
            hashed_password=hash_password("Pass123!"),
            role="ROLE_RECEPTIONIST",
            is_active=1,
        )
        db.add(rec_u)
        await db.flush()

        p = Patient(
            patient_id=f"PID-2026-X{tag[:4]}",
            full_name=f"Fault Patient {tag}",
            date_of_birth="1989-09-09",
            gender="Male",
            primary_mobile=f"+1777{tag[:7]}",
            is_active=1,
        )
        db.add(p)
        await db.flush()

        reg = Registration(
            registration_id=f"AEGIS-2026-X{tag[:4]}",
            patient_id=p.id,
            created_by_user_id=rec_u.id,
            status="SUBMITTED",
            age_at_registration=37,
            contact_mobile=p.primary_mobile,
            pdf_status="PENDING",
        )
        db.add(reg)
        await db.commit()
        reg_id = reg.id
        break

    # Mock compiler raising an unexpected rendering exception
    with patch(
        "app.services.pdf_service.compile_html_to_pdf_bytes",
        side_effect=RuntimeError("Font rendering crash in C graphics subsystem"),
    ):
        await compile_registration_pdf_task(reg_id)

    # Verify registration remains firmly in SUBMITTED status (never rolled back)
    async for db in get_db():
        reg_chk = (await db.execute(select(Registration).where(Registration.id == reg_id))).scalar_one()

        assert reg_chk.status == "SUBMITTED"
        assert reg_chk.pdf_status == "FAILED"
        assert "Font rendering crash" in reg_chk.pdf_error_message

        # Verify audit event logged for failure
        audit = (
            await db.execute(
                select(AuditEvent).where(
                    AuditEvent.target_entity_type == "registrations",
                    AuditEvent.target_entity_id == str(reg_id),
                    AuditEvent.action_type == "PDF_GENERATION_FAILED",
                )
            )
        ).scalar_one_or_none()
        assert audit is not None
        break


# ==============================================================================
# 6. PERMANENT RETENTION FOR REJECTED REGISTRATIONS
# ==============================================================================

@pytest.mark.asyncio
async def test_rejected_registration_pdf_permanent_retention(async_client):
    """Verify already-compiled PDF is retained permanently on disk if registration is subsequently REJECTED."""
    tag = uid()

    async for db in get_db():
        rec_u = User(
            username=f"rec_rej_{tag}",
            email=f"rec_rej_{tag}@hospital.org",
            hashed_password=hash_password("Pass123!"),
            role="ROLE_RECEPTIONIST",
            is_active=1,
        )
        db.add(rec_u)
        await db.flush()

        p = Patient(
            patient_id=f"PID-2026-J{tag[:4]}",
            full_name=f"Rejected Patient {tag}",
            date_of_birth="1983-03-03",
            gender="Female",
            primary_mobile=f"+1888{tag[:7]}",
            is_active=1,
        )
        db.add(p)
        await db.flush()

        reg = Registration(
            registration_id=f"AEGIS-2026-J{tag[:4]}",
            patient_id=p.id,
            created_by_user_id=rec_u.id,
            status="SUBMITTED",
            age_at_registration=43,
            contact_mobile=p.primary_mobile,
            pdf_status="PENDING",
        )
        db.add(reg)
        await db.commit()
        reg_id, reg_business_id, rec_id = reg.id, reg.registration_id, rec_u.id
        break

    # 1. Compile PDF while SUBMITTED
    await compile_registration_pdf_task(reg_id)

    async for db in get_db():
        reg_db = (await db.execute(select(Registration).where(Registration.id == reg_id))).scalar_one()
        pdf_file_path = reg_db.pdf_path
        assert os.path.exists(pdf_file_path)
        break

    token = create_access_token(user_id=rec_id, username=f"rec_rej_{tag}", role="ROLE_RECEPTIONIST")

    # 2. Staff reviews and rejects the registration
    r_rej = await async_client.post(
        f"{settings.API_V1_PREFIX}/registrations/{reg_business_id}/review",
        headers={"Authorization": f"Bearer {token}"},
        json={"action": "REJECT", "rejection_reason": "Patient decided to seek care at specialized clinic."},
    )
    assert r_rej.status_code == 200
    assert r_rej.json()["status"] == "REJECTED"

    # 3. Evidentiary check: The physical PDF file MUST STILL EXIST on disk (never deleted)
    assert os.path.exists(pdf_file_path)
