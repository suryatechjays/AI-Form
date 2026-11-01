"""Focused test suite for AEGIS Patient-Role Registration Submission Flow.

Validates:
1. First-time Patient submission (no profile exists -> profile linked -> draft created -> submitted to PENDING_REVIEW).
2. Atomic draft creation with embedded patient_data.
3. Retry after failure / orphaned unlinked patient profile claiming without 409 duplicate conflict.
4. Existing linked profile updates and multiple encounters without duplicate collision.
5. Genuine duplicate protection (Patient B cannot claim or duplicate Patient A's linked record).
6. Receptionist walk-in intake (user_id=None, direct transition to SUBMITTED, duplicate override justification)
   and Super User clinical review workflows unchanged.
"""

import uuid
import pytest
from sqlalchemy import select

from app.config import get_settings
from app.core.security import create_access_token, hash_password
from app.database import get_db
from app.models.patient import Patient
from app.models.registration import Registration
from app.models.user import User

settings = get_settings()


def uid() -> str:
    """Generate short unique suffix for test isolation."""
    return uuid.uuid4().hex[:8]


# ==============================================================================
# 1. FIRST-TIME PATIENT SUBMISSION FLOW
# ==============================================================================

@pytest.mark.asyncio
async def test_first_time_patient_submission_flow(async_client):
    """Verify first-time patient without an existing profile can create profile and submit registration."""
    tag = uid()
    user_pass = "PatientPass123!"

    async for db in get_db():
        patient_user = User(
            username=f"pat_first_{tag}",
            email=f"first_{tag}@patient.org",
            hashed_password=hash_password(user_pass),
            role="ROLE_PATIENT",
            is_active=1,
        )
        db.add(patient_user)
        await db.commit()
        user_id = patient_user.id
        break

    token = create_access_token(user_id=user_id, username=f"pat_first_{tag}", role="ROLE_PATIENT")
    headers = {"Authorization": f"Bearer {token}"}

    # Step 1: Verify no patient profile exists initially -> 404, and initial records list is 0
    me_resp = await async_client.get(f"{settings.API_V1_PREFIX}/patients/me", headers=headers)
    assert me_resp.status_code == 404
    assert me_resp.json()["code"] == "PATIENT_NOT_FOUND"

    init_regs = await async_client.get(f"{settings.API_V1_PREFIX}/registrations", headers=headers)
    assert init_regs.status_code == 200
    assert init_regs.json()["total"] == 0
    assert len(init_regs.json()["items"]) == 0

    # Step 2: Patient creates profile via POST /patients
    patient_payload = {
        "full_name": f"First Patient {tag}",
        "date_of_birth": "1992-06-15",
        "gender": "Female",
        "blood_group": "A+",
        "primary_mobile": f"+1555{tag[:7]}",
        "email": f"first_{tag}@patient.org",
        "street_address": "123 Blossom Hill Rd",
        "city": "Bengaluru",
        "state": "Karnataka",
        "country": "India",
        "postal_code": "560001",
    }
    create_p_resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/patients",
        headers=headers,
        json=patient_payload,
    )
    assert create_p_resp.status_code == 201
    p_data = create_p_resp.json()
    assert p_data["user_id"] == user_id  # Profile must be linked to authenticated patient user!
    patient_db_id = p_data["id"]

    # Step 3: Verify GET /patients/me now returns the linked profile
    me_resp2 = await async_client.get(f"{settings.API_V1_PREFIX}/patients/me", headers=headers)
    assert me_resp2.status_code == 200
    assert me_resp2.json()["id"] == patient_db_id
    assert me_resp2.json()["user_id"] == user_id

    # Step 4: Patient creates Registration Draft
    draft_payload = {
        "patient_id": patient_db_id,
        "contact_mobile": f"+1555{tag[:7]}",
        "contact_email": f"first_{tag}@patient.org",
        "residential_address": "123 Blossom Hill Rd, Bengaluru, Karnataka, 560001",
        "emergency_contact_name": "Emergency Person",
        "emergency_contact_relationship": "Spouse",
        "emergency_contact_phone": "+15559998888",
        "department": "Cardiology",
        "reason_for_visit": "Annual heart checkup",
    }
    draft_resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/registrations",
        headers=headers,
        json=draft_payload,
    )
    assert draft_resp.status_code == 201
    draft_data = draft_resp.json()
    reg_id = draft_data["id"]
    assert draft_data["status"] == "DRAFT"
    assert draft_data["patient_id"] == patient_db_id

    # Step 5: Patient submits registration -> advances to PENDING_REVIEW
    submit_resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/registrations/{reg_id}/submit",
        headers=headers,
    )
    assert submit_resp.status_code == 200
    sub_data = submit_resp.json()
    assert sub_data["status"] == "PENDING_REVIEW"
    assert sub_data["submitted_by_user_id"] == user_id

    # Step 6: Verify patient dashboard count updates to 1 and contains the submitted record
    after_regs_resp = await async_client.get(f"{settings.API_V1_PREFIX}/registrations", headers=headers)
    assert after_regs_resp.status_code == 200
    after_data = after_regs_resp.json()
    assert after_data["total"] == 1
    assert len(after_data["items"]) == 1
    assert after_data["items"][0]["id"] == reg_id
    assert after_data["items"][0]["status"] == "PENDING_REVIEW"
    assert after_data["items"][0]["registration_id"] == sub_data["registration_id"]


@pytest.mark.asyncio
async def test_atomic_patient_and_registration_draft_creation(async_client):
    """Verify patient can create draft atomically by providing patient_data in a single request."""
    tag = uid()
    user_pass = "PatientPass123!"

    async for db in get_db():
        patient_user = User(
            username=f"pat_atom_{tag}",
            email=f"atom_{tag}@patient.org",
            hashed_password=hash_password(user_pass),
            role="ROLE_PATIENT",
            is_active=1,
        )
        db.add(patient_user)
        await db.commit()
        user_id = patient_user.id
        break

    token = create_access_token(user_id=user_id, username=f"pat_atom_{tag}", role="ROLE_PATIENT")
    headers = {"Authorization": f"Bearer {token}"}

    # Draft payload includes patient_data directly (no prior POST /patients call)
    draft_payload = {
        "patient_data": {
            "full_name": f"Atomic Patient {tag}",
            "date_of_birth": "1988-11-20",
            "gender": "Male",
            "blood_group": "B+",
            "primary_mobile": f"+1555{tag[:7]}",
            "email": f"atom_{tag}@patient.org",
            "street_address": "45 Atomic Way",
            "city": "Bengaluru",
            "state": "Karnataka",
            "country": "India",
            "postal_code": "560002",
        },
        "contact_mobile": f"+1555{tag[:7]}",
        "contact_email": f"atom_{tag}@patient.org",
        "residential_address": "45 Atomic Way, Bengaluru, Karnataka, 560002",
        "emergency_contact_name": "Emergency Contact",
        "emergency_contact_relationship": "Parent",
        "emergency_contact_phone": "+15550001111",
        "department": "General Medicine",
        "reason_for_visit": "General consultation",
    }

    draft_resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/registrations",
        headers=headers,
        json=draft_payload,
    )
    assert draft_resp.status_code == 201
    draft_data = draft_resp.json()
    assert draft_data["status"] == "DRAFT"
    assert draft_data["patient_id"] is not None

    # Verify patient profile was provisioned and linked to this user
    me_resp = await async_client.get(f"{settings.API_V1_PREFIX}/patients/me", headers=headers)
    assert me_resp.status_code == 200
    assert me_resp.json()["id"] == draft_data["patient_id"]
    assert me_resp.json()["user_id"] == user_id


# ==============================================================================
# 2. RETRY AFTER FAILURE / UNLINKED PROFILE CLAIMING
# ==============================================================================

@pytest.mark.asyncio
async def test_patient_submission_retry_after_failure(async_client):
    """Verify that if an unlinked patient record exists, patient can safely claim it on retry without 409 error."""
    tag = uid()
    mobile = f"+1555{tag[:7]}"
    email = f"retry_{tag}@patient.org"

    # Pre-create an unlinked patient record (simulating an orphaned record from failed first attempt or desk intake)
    async for db in get_db():
        unlinked_patient = Patient(
            patient_id=f"PID-2026-{tag[:5].upper()}",
            full_name=f"Retry Candidate {tag}",
            date_of_birth="1985-04-12",
            gender="Male",
            blood_group="O+",
            primary_mobile=mobile,
            email=email,
            user_id=None,  # Not linked to any user!
            is_active=1,
            created_at="2026-01-01T00:00:00Z",
            updated_at="2026-01-01T00:00:00Z",
        )
        patient_user = User(
            username=f"pat_retry_{tag}",
            email=email,
            hashed_password=hash_password("Pass123!"),
            role="ROLE_PATIENT",
            is_active=1,
        )
        db.add_all([unlinked_patient, patient_user])
        await db.commit()
        unlinked_id = unlinked_patient.id
        user_id = patient_user.id
        break

    token = create_access_token(user_id=user_id, username=f"pat_retry_{tag}", role="ROLE_PATIENT")
    headers = {"Authorization": f"Bearer {token}"}

    # Patient attempts to create profile with the same phone and email
    retry_payload = {
        "full_name": f"Retry Candidate {tag}",
        "date_of_birth": "1985-04-12",
        "gender": "Male",
        "blood_group": "O+",
        "primary_mobile": mobile,
        "email": email,
        "street_address": "99 Retry Lane",
        "city": "Bengaluru",
        "state": "Karnataka",
        "country": "India",
        "postal_code": "560003",
    }

    # Must NOT fail with 409 DuplicatePatientException; must link unlinked patient to actor!
    resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/patients",
        headers=headers,
        json=retry_payload,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["id"] == unlinked_id
    assert data["user_id"] == user_id

    # Create draft and submit
    draft_resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/registrations",
        headers=headers,
        json={
            "patient_id": unlinked_id,
            "contact_mobile": mobile,
            "contact_email": email,
            "emergency_contact_name": "Emergency Jane",
            "emergency_contact_relationship": "Sister",
            "emergency_contact_phone": "+15559990000",
            "department": "Orthopedics",
            "reason_for_visit": "Knee pain evaluation",
        },
    )
    assert draft_resp.status_code == 201
    reg_id = draft_resp.json()["id"]

    submit_resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/registrations/{reg_id}/submit",
        headers=headers,
    )
    assert submit_resp.status_code == 200
    assert submit_resp.json()["status"] == "PENDING_REVIEW"

    # Idempotent re-submission should return registration safely
    resubmit_resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/registrations/{reg_id}/submit",
        headers=headers,
    )
    assert resubmit_resp.status_code == 200
    assert resubmit_resp.json()["id"] == reg_id


# ==============================================================================
# 3. EXISTING LINKED PROFILE UPDATES & MULTIPLE ENCOUNTERS
# ==============================================================================

@pytest.mark.asyncio
async def test_existing_linked_patient_profile(async_client):
    """Verify patient with an existing linked profile can update details and create subsequent encounters."""
    tag = uid()
    mobile = f"+1555{tag[:7]}"
    email = f"linked_{tag}@patient.org"

    async for db in get_db():
        user = User(
            username=f"pat_linked_{tag}",
            email=email,
            hashed_password=hash_password("Pass123!"),
            role="ROLE_PATIENT",
            is_active=1,
        )
        db.add(user)
        await db.flush()

        patient = Patient(
            patient_id=f"PID-2026-{tag[:5].upper()}",
            full_name=f"Linked Patient {tag}",
            date_of_birth="1978-08-25",
            gender="Female",
            blood_group="AB+",
            primary_mobile=mobile,
            email=email,
            user_id=user.id,
            is_active=1,
            created_at="2026-01-01T00:00:00Z",
            updated_at="2026-01-01T00:00:00Z",
        )
        db.add(patient)
        await db.commit()
        user_id = user.id
        patient_id = patient.id
        break

    token = create_access_token(user_id=user_id, username=f"pat_linked_{tag}", role="ROLE_PATIENT")
    headers = {"Authorization": f"Bearer {token}"}

    # Calling POST /patients again with updated address should update profile, not fail with 409
    update_payload = {
        "full_name": f"Linked Patient {tag}",
        "date_of_birth": "1978-08-25",
        "gender": "Female",
        "blood_group": "AB+",
        "primary_mobile": mobile,
        "email": email,
        "street_address": "88 Updated Boulevard",
        "city": "Bengaluru",
        "state": "Karnataka",
        "country": "India",
        "postal_code": "560004",
    }
    p_resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/patients",
        headers=headers,
        json=update_payload,
    )
    assert p_resp.status_code == 201
    assert p_resp.json()["id"] == patient_id
    assert p_resp.json()["street_address"] == "88 Updated Boulevard"

    # Creating draft without passing patient_id should auto-bind to user's linked patient
    draft_resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/registrations",
        headers=headers,
        json={
            "contact_mobile": mobile,
            "contact_email": email,
            "emergency_contact_name": "Emergency Contact",
            "emergency_contact_relationship": "Child",
            "emergency_contact_phone": "+15558887777",
            "department": "Dermatology",
            "reason_for_visit": "Skin screening",
        },
    )
    assert draft_resp.status_code == 201
    reg_data = draft_resp.json()
    assert reg_data["patient_id"] == patient_id

    # Submit registration
    submit_resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/registrations/{reg_data['id']}/submit",
        headers=headers,
    )
    assert submit_resp.status_code == 200
    assert submit_resp.json()["status"] == "PENDING_REVIEW"


# ==============================================================================
# 4. GENUINE DUPLICATE PATIENT PROTECTION
# ==============================================================================

@pytest.mark.asyncio
async def test_genuine_duplicate_patient_protection(async_client):
    """Verify that Patient B cannot claim or duplicate Patient A's linked demographic profile."""
    tag_a = uid()
    tag_b = uid()
    mobile_a = f"+1555{tag_a[:7]}"
    email_a = f"victim_{tag_a}@patient.org"

    async for db in get_db():
        user_a = User(
            username=f"pat_a_{tag_a}",
            email=email_a,
            hashed_password=hash_password("Pass123!"),
            role="ROLE_PATIENT",
            is_active=1,
        )
        user_b = User(
            username=f"pat_b_{tag_b}",
            email=f"attacker_{tag_b}@patient.org",
            hashed_password=hash_password("Pass123!"),
            role="ROLE_PATIENT",
            is_active=1,
        )
        db.add_all([user_a, user_b])
        await db.flush()

        patient_a = Patient(
            patient_id=f"PID-2026-{tag_a[:5].upper()}",
            full_name=f"Patient A {tag_a}",
            date_of_birth="1990-01-01",
            gender="Male",
            blood_group="O+",
            primary_mobile=mobile_a,
            email=email_a,
            user_id=user_a.id,  # Linked to User A
            is_active=1,
            created_at="2026-01-01T00:00:00Z",
            updated_at="2026-01-01T00:00:00Z",
        )
        db.add(patient_a)
        await db.commit()
        user_b_id = user_b.id
        patient_a_id = patient_a.id
        break

    token_b = create_access_token(user_id=user_b_id, username=f"pat_b_{tag_b}", role="ROLE_PATIENT")
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # 1. User B attempts to create a patient profile using User A's mobile number -> 409 DUPLICATE_PATIENT_RECORD
    colliding_payload = {
        "full_name": f"Imposter B {tag_b}",
        "date_of_birth": "1995-05-05",
        "gender": "Female",
        "blood_group": "A+",
        "primary_mobile": mobile_a,  # Colliding mobile
        "email": f"attacker_{tag_b}@patient.org",
    }
    dup_resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/patients",
        headers=headers_b,
        json=colliding_payload,
    )
    assert dup_resp.status_code == 409
    assert dup_resp.json()["code"] == "DUPLICATE_PATIENT_DETECTED"

    # 2. User B attempts to submit a registration specifying Patient A's patient_id -> 403 Forbidden
    unauthorized_draft_payload = {
        "patient_id": patient_a_id,
        "contact_mobile": "+15550009999",
        "emergency_contact_name": "Emergency",
        "emergency_contact_relationship": "Friend",
        "emergency_contact_phone": "+15551112222",
        "department": "Neurology",
        "reason_for_visit": "Headaches",
    }
    draft_resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/registrations",
        headers=headers_b,
        json=unauthorized_draft_payload,
    )
    assert draft_resp.status_code == 403
    assert draft_resp.json()["code"] in ("PERMISSION_DENIED", "SCOPE_PERMISSION_DENIED")


# ==============================================================================
# 5. RECEPTIONIST AND SUPER USER WORKFLOWS UNCHANGED
# ==============================================================================

@pytest.mark.asyncio
async def test_receptionist_and_super_user_workflows_unchanged(async_client):
    """Verify Receptionist desk intake and Super User review workflows operate without regression."""
    tag = uid()
    rec_pass = "DeskPass123!"

    async for db in get_db():
        rec_user = User(
            username=f"rec_desk_{tag}",
            email=f"rec_{tag}@hospital.org",
            hashed_password=hash_password(rec_pass),
            role="ROLE_RECEPTIONIST",
            is_active=1,
        )
        super_user = User(
            username=f"su_rev_{tag}",
            email=f"super_{tag}@hospital.org",
            hashed_password=hash_password("SuperPass123!"),
            role="ROLE_SUPER_USER",
            is_active=1,
        )
        db.add_all([rec_user, super_user])
        await db.commit()
        rec_id, super_id = rec_user.id, super_user.id
        break

    rec_token = create_access_token(user_id=rec_id, username=f"rec_desk_{tag}", role="ROLE_RECEPTIONIST")
    super_token = create_access_token(user_id=super_id, username=f"su_rev_{tag}", role="ROLE_SUPER_USER")
    rec_headers = {"Authorization": f"Bearer {rec_token}"}
    super_headers = {"Authorization": f"Bearer {super_token}"}

    # 1. Receptionist creates walk-in patient -> user_id MUST be None
    mobile = f"+1555{tag[:7]}"
    patient_payload = {
        "full_name": f"Walkin Patient {tag}",
        "date_of_birth": "1975-02-14",
        "gender": "Male",
        "blood_group": "O-",
        "primary_mobile": mobile,
        "email": f"walkin_{tag}@example.com",
    }
    p_resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/patients",
        headers=rec_headers,
        json=patient_payload,
    )
    assert p_resp.status_code == 201
    p_data = p_resp.json()
    assert p_data["user_id"] is None  # Desk creation has no linked user_id
    patient_id = p_data["id"]

    # 2. Receptionist creates registration draft
    draft_resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/registrations",
        headers=rec_headers,
        json={
            "patient_id": patient_id,
            "contact_mobile": mobile,
            "contact_email": f"walkin_{tag}@example.com",
            "emergency_contact_name": "Emergency Spouse",
            "emergency_contact_relationship": "Spouse",
            "emergency_contact_phone": "+15553334444",
            "department": "Emergency Medicine",
            "reason_for_visit": "Acute abdominal pain",
        },
    )
    assert draft_resp.status_code == 201
    reg_id = draft_resp.json()["id"]

    # 3. Receptionist submits registration -> Direct desk admission advances straight to SUBMITTED
    sub_resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/registrations/{reg_id}/submit",
        headers=rec_headers,
    )
    assert sub_resp.status_code == 200
    assert sub_resp.json()["status"] == "SUBMITTED"

    # 4. Receptionist duplicate override workflow:
    # Attempting to re-create exact same patient without override -> 409
    dup_resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/patients",
        headers=rec_headers,
        json=patient_payload,
    )
    assert dup_resp.status_code == 409

    # Supplying override_duplicate=True with administrative justification -> 201
    override_payload = dict(patient_payload)
    override_payload["override_duplicate"] = True
    override_payload["justification"] = "Verified distinct patient with same name and contact at admissions desk."
    override_resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/patients",
        headers=rec_headers,
        json=override_payload,
    )
    assert override_resp.status_code == 201

    # 5. Super User can review a PENDING_REVIEW patient registration to SUBMITTED
    # Create a patient-submitted registration
    tag_p = uid()
    async for db in get_db():
        pat_user = User(
            username=f"pat_pend_{tag_p}",
            email=f"pend_{tag_p}@patient.org",
            hashed_password=hash_password("Pass123!"),
            role="ROLE_PATIENT",
            is_active=1,
        )
        db.add(pat_user)
        await db.commit()
        pat_u_id = pat_user.id
        break

    pat_token = create_access_token(user_id=pat_u_id, username=f"pat_pend_{tag_p}", role="ROLE_PATIENT")
    pat_headers = {"Authorization": f"Bearer {pat_token}"}

    draft_p_resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/registrations",
        headers=pat_headers,
        json={
            "patient_data": {
                "full_name": f"Pending Patient {tag_p}",
                "date_of_birth": "1999-09-09",
                "gender": "Female",
                "blood_group": "A-",
                "primary_mobile": f"+1555{tag_p[:7]}",
            },
            "contact_mobile": f"+1555{tag_p[:7]}",
            "emergency_contact_name": "Emergency Parent",
            "emergency_contact_relationship": "Parent",
            "emergency_contact_phone": "+15557778888",
            "department": "ENT",
            "reason_for_visit": "Ear discomfort",
        },
    )
    assert draft_p_resp.status_code == 201
    pending_reg_id = draft_p_resp.json()["id"]

    # Patient submits -> PENDING_REVIEW
    await async_client.post(
        f"{settings.API_V1_PREFIX}/registrations/{pending_reg_id}/submit",
        headers=pat_headers,
    )

    # Super User reviews and approves registration -> SUBMITTED
    review_resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/registrations/{pending_reg_id}/review",
        headers=super_headers,
        json={"action": "APPROVE"},
    )
    assert review_resp.status_code == 200
    assert review_resp.json()["status"] == "SUBMITTED"


@pytest.mark.asyncio
async def test_patient_dashboard_isolation_and_reload(async_client):
    """Verify newly registered patient starts with 0 records, updates to 1 upon submission,
    remains strictly isolated from other patients, and retains count across page reloads/re-logins.
    """
    tag_a = uid()
    tag_b = uid()

    async for db in get_db():
        user_a = User(
            username=f"pat_dash_a_{tag_a}",
            email=f"dash_a_{tag_a}@patient.org",
            hashed_password=hash_password("Pass123!"),
            role="ROLE_PATIENT",
            is_active=1,
        )
        user_b = User(
            username=f"pat_dash_b_{tag_b}",
            email=f"dash_b_{tag_b}@patient.org",
            hashed_password=hash_password("Pass123!"),
            role="ROLE_PATIENT",
            is_active=1,
        )
        db.add_all([user_a, user_b])
        await db.commit()
        user_a_id, user_b_id = user_a.id, user_b.id
        break

    token_a = create_access_token(user_id=user_a_id, username=f"pat_dash_a_{tag_a}", role="ROLE_PATIENT")
    token_b = create_access_token(user_id=user_b_id, username=f"pat_dash_b_{tag_b}", role="ROLE_PATIENT")
    headers_a = {"Authorization": f"Bearer {token_a}"}
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # 1. Both newly registered patients must initially see 0 records on dashboard
    res_a0 = await async_client.get(f"{settings.API_V1_PREFIX}/registrations", headers=headers_a)
    assert res_a0.status_code == 200
    assert res_a0.json()["total"] == 0
    assert res_a0.json()["items"] == []

    res_b0 = await async_client.get(f"{settings.API_V1_PREFIX}/registrations", headers=headers_b)
    assert res_b0.status_code == 200
    assert res_b0.json()["total"] == 0
    assert res_b0.json()["items"] == []

    # 2. Patient A creates and submits 1 registration
    draft_resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/registrations",
        headers=headers_a,
        json={
            "patient_data": {
                "full_name": f"Dashboard Patient A {tag_a}",
                "date_of_birth": "1994-07-21",
                "gender": "Male",
                "blood_group": "O+",
                "primary_mobile": f"+1555{tag_a[:7]}",
                "email": f"dash_a_{tag_a}@patient.org",
            },
            "contact_mobile": f"+1555{tag_a[:7]}",
            "emergency_contact_name": "Emergency Person",
            "emergency_contact_relationship": "Brother",
            "emergency_contact_phone": "+15554443333",
            "department": "Pulmonology",
            "reason_for_visit": "Persistent cough checkup",
        },
    )
    assert draft_resp.status_code == 201
    reg_id = draft_resp.json()["id"]

    sub_resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/registrations/{reg_id}/submit",
        headers=headers_a,
    )
    assert sub_resp.status_code == 200

    # 3. Patient A dashboard count MUST now update to 1 and contain the record
    res_a1 = await async_client.get(f"{settings.API_V1_PREFIX}/registrations", headers=headers_a)
    assert res_a1.status_code == 200
    assert res_a1.json()["total"] == 1
    assert len(res_a1.json()["items"]) == 1
    assert res_a1.json()["items"][0]["id"] == reg_id
    assert res_a1.json()["items"][0]["department"] == "Pulmonology"

    # 4. Patient B dashboard MUST still see 0 records (no leaking of Patient A's record)
    res_b1 = await async_client.get(f"{settings.API_V1_PREFIX}/registrations", headers=headers_b)
    assert res_b1.status_code == 200
    assert res_b1.json()["total"] == 0
    assert res_b1.json()["items"] == []

    # 5. Simulated page reload or re-login for Patient A: count remains consistent at 1
    fresh_token_a = create_access_token(user_id=user_a_id, username=f"pat_dash_a_{tag_a}", role="ROLE_PATIENT")
    fresh_headers_a = {"Authorization": f"Bearer {fresh_token_a}"}
    res_a_reload = await async_client.get(f"{settings.API_V1_PREFIX}/registrations", headers=fresh_headers_a)
    assert res_a_reload.status_code == 200
    assert res_a_reload.json()["total"] == 1
    assert len(res_a_reload.json()["items"]) == 1
    assert res_a_reload.json()["items"][0]["id"] == reg_id

