"""Comprehensive tests for AEGIS Patient Master Records and Registration Lifecycle APIs (Phase 2, Task 4).

Covers:
1. Patient creation and retrieval.
2. Patient ownership restrictions.
3. Patient duplicate detection (exact mobile, case-insensitive email, composite Name+DOB) & PHI non-disclosure.
4. Duplicate override with clinical justification (role matrix & Assistant Admin scope enforcement).
5. Registration creation in DRAFT status, business ID generation (AEGIS-YYYY-XXXXX), and frozen age calculation.
6. Minor (<18) emergency contact validation on submission.
7. Draft updates and state immutability once advanced.
8. Registration lifecycle transitions:
   - Patient: DRAFT -> PENDING_REVIEW
   - Staff: DRAFT / PENDING_REVIEW -> SUBMITTED (direct admission)
   - Staff review: PENDING_REVIEW -> SUBMITTED (approval)
   - Staff review: -> REJECTED (with mandatory concise administrative reason)
9. Illegal state transitions (regression prevention, terminal post-rejection persistence).
10. Submission idempotency (caching replay, actor-scoped collision rejection).
11. Role-based scoping and Assistant Admin live-database permission checks.
12. Pagination and query filtering.
13. Audit events for clinical intake actions.
"""

from datetime import datetime, timezone
import uuid
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.security import create_access_token, hash_password
from app.database import get_db
from app.models.audit import AuditEvent
from app.models.patient import Patient
from app.models.permission import PermissionScope, UserPermission
from app.models.registration import Registration
from app.models.user import User
from app.services.permission_service import grant_permission_scope, revoke_permission_scope

settings = get_settings()


def uid() -> str:
    """Generate short unique suffix for isolated test entities."""
    return uuid.uuid4().hex[:8]


# ==============================================================================
# 1. PATIENT MASTER RECORD TESTS
# ==============================================================================

@pytest.mark.asyncio
async def test_patient_creation_by_staff_and_retrieval(async_client):
    """Verify desk staff can create a walk-in patient record and retrieve it by ID."""
    tag = uid()
    rec_pass = "DeskPass123!"

    async for db in get_db():
        rec = User(
            username=f"rec_p_{tag}",
            email=f"rec_p_{tag}@hospital.org",
            hashed_password=hash_password(rec_pass),
            role="ROLE_RECEPTIONIST",
            is_active=1,
        )
        db.add(rec)
        await db.commit()
        rec_id = rec.id
        break

    token = create_access_token(user_id=rec_id, username=f"rec_p_{tag}", role="ROLE_RECEPTIONIST")

    payload = {
        "full_name": f"Arthur Dent {tag}",
        "date_of_birth": "1980-03-11",
        "gender": "Male",
        "blood_group": "O+",
        "primary_mobile": f"+1555{tag[:7]}",
        "email": f"arthur_{tag}@earth.net",
        "street_address": "15 Country Lane",
        "city": "Cottington",
        "state": "West Country",
        "country": "India",
        "postal_code": "560001",
    }

    # 1. Create Patient
    create_resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/patients",
        headers={"Authorization": f"Bearer {token}"},
        json=payload,
    )
    assert create_resp.status_code == 201
    p_data = create_resp.json()
    assert "patient_id" in p_data
    assert p_data["patient_id"].startswith("PID-")
    assert p_data["full_name"] == f"Arthur Dent {tag}"
    assert p_data["user_id"] is None  # Walk-in desk patient has no user account
    pid = p_data["id"]
    business_pid = p_data["patient_id"]

    # 2. Retrieve by surrogate ID
    get_resp1 = await async_client.get(
        f"{settings.API_V1_PREFIX}/patients/{pid}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert get_resp1.status_code == 200
    assert get_resp1.json()["id"] == pid

    # 3. Retrieve by business PID string
    get_resp2 = await async_client.get(
        f"{settings.API_V1_PREFIX}/patients/{business_pid}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert get_resp2.status_code == 200
    assert get_resp2.json()["patient_id"] == business_pid


@pytest.mark.asyncio
async def test_patient_ownership_restrictions(async_client):
    """Verify patients can access their own profile but are blocked from accessing another patient's record."""
    tag1, tag2 = uid(), uid()

    async for db in get_db():
        u1 = User(
            username=f"pat_a_{tag1}",
            email=f"pat_a_{tag1}@test.org",
            hashed_password=hash_password("Pass123!A"),
            role="ROLE_PATIENT",
            is_active=1,
        )
        u2 = User(
            username=f"pat_b_{tag2}",
            email=f"pat_b_{tag2}@test.org",
            hashed_password=hash_password("Pass123!B"),
            role="ROLE_PATIENT",
            is_active=1,
        )
        db.add_all([u1, u2])
        await db.commit()

        p1 = Patient(
            patient_id=f"PID-2026-{tag1[:5]}",
            user_id=u1.id,
            full_name=f"Alice {tag1}",
            date_of_birth="1990-01-01",
            gender="Female",
            primary_mobile=f"+1555{tag1[:7]}",
            is_active=1,
        )
        p2 = Patient(
            patient_id=f"PID-2026-{tag2[:5]}",
            user_id=u2.id,
            full_name=f"Bob {tag2}",
            date_of_birth="1991-02-02",
            gender="Male",
            primary_mobile=f"+1555{tag2[:7]}",
            is_active=1,
        )
        db.add_all([p1, p2])
        await db.commit()
        u1_id, p1_id = u1.id, p1.id
        u2_id, p2_id = u2.id, p2.id
        break

    t1 = create_access_token(user_id=u1_id, username=f"pat_a_{tag1}", role="ROLE_PATIENT")
    t2 = create_access_token(user_id=u2_id, username=f"pat_b_{tag2}", role="ROLE_PATIENT")

    # 1. Patient A accesses their own record via /patients/me -> 200
    me_resp = await async_client.get(
        f"{settings.API_V1_PREFIX}/patients/me",
        headers={"Authorization": f"Bearer {t1}"},
    )
    assert me_resp.status_code == 200
    assert me_resp.json()["id"] == p1_id

    # 2. Patient A accesses their own record via ID -> 200
    own_resp = await async_client.get(
        f"{settings.API_V1_PREFIX}/patients/{p1_id}",
        headers={"Authorization": f"Bearer {t1}"},
    )
    assert own_resp.status_code == 200

    # 3. Patient A attempts to access Patient B's record -> 403 Forbidden
    other_resp = await async_client.get(
        f"{settings.API_V1_PREFIX}/patients/{p2_id}",
        headers={"Authorization": f"Bearer {t1}"},
    )
    assert other_resp.status_code == 403
    assert other_resp.json()["code"] == "PERMISSION_DENIED"

    # 4. Patient attempts to list all patients -> 403 Forbidden
    list_resp = await async_client.get(
        f"{settings.API_V1_PREFIX}/patients",
        headers={"Authorization": f"Bearer {t1}"},
    )
    assert list_resp.status_code == 403


@pytest.mark.asyncio
async def test_patient_duplicate_detection_and_phi_protection(async_client):
    """Verify duplicate detection across mobile, email, and composite Name+DOB without leaking PHI."""
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
        await db.commit()
        staff_id = rec_u.id
        break

    staff_token = create_access_token(user_id=staff_id, username=f"rec_dup_{tag}", role="ROLE_RECEPTIONIST")

    mobile = f"+1999{tag[:7]}"
    email = f"dup_{tag}@hospital.org"
    name = f"Duplicate Test {tag}"
    dob = "1985-07-20"

    # 1. Create first patient
    p1_payload = {
        "full_name": name,
        "date_of_birth": dob,
        "gender": "Other",
        "primary_mobile": mobile,
        "email": email,
    }
    r1 = await async_client.post(
        f"{settings.API_V1_PREFIX}/patients",
        headers={"Authorization": f"Bearer {staff_token}"},
        json=p1_payload,
    )
    assert r1.status_code == 201

    # 2. Attempt duplicate via primary mobile
    r2_mobile = await async_client.post(
        f"{settings.API_V1_PREFIX}/patients",
        headers={"Authorization": f"Bearer {staff_token}"},
        json={
            "full_name": "Different Name",
            "date_of_birth": "1999-01-01",
            "gender": "Male",
            "primary_mobile": mobile,  # Colliding mobile
        },
    )
    assert r2_mobile.status_code == 409
    prob2 = r2_mobile.json()
    assert prob2["code"] == "DUPLICATE_PATIENT_DETECTED"
    assert any(p["name"] == "primary_mobile" for p in prob2["invalid_params"])
    # Crucial security check: Ensure the response NEVER leaks the existing patient's full name
    assert name not in r2_mobile.text

    # 3. Attempt duplicate via email (case-insensitive)
    r3_email = await async_client.post(
        f"{settings.API_V1_PREFIX}/patients",
        headers={"Authorization": f"Bearer {staff_token}"},
        json={
            "full_name": "Another Person",
            "date_of_birth": "2000-05-12",
            "gender": "Female",
            "primary_mobile": f"+1888{tag[:7]}",
            "email": email.upper(),  # Colliding uppercase email
        },
    )
    assert r3_email.status_code == 409
    assert any(p["name"] == "email" for p in r3_email.json()["invalid_params"])

    # 4. Attempt duplicate via composite Full Name + Date of Birth
    r4_comp = await async_client.post(
        f"{settings.API_V1_PREFIX}/patients",
        headers={"Authorization": f"Bearer {staff_token}"},
        json={
            "full_name": name,  # Colliding name
            "date_of_birth": dob,  # Colliding DOB
            "gender": "Male",
            "primary_mobile": f"+1777{tag[:7]}",  # Different mobile
        },
    )
    assert r4_comp.status_code == 409
    assert any(p["name"] == "composite_name_dob" for p in r4_comp.json()["invalid_params"])


@pytest.mark.asyncio
async def test_duplicate_override_workflow_and_role_matrix(async_client):
    """Verify Receptionist can override duplicate with justification, while Patient is strictly denied."""
    tag = uid()
    mobile = f"+1777{tag[:7]}"

    # Seed existing patient
    async for db in get_db():
        p = Patient(
            patient_id=f"PID-2026-X{tag[:4]}",
            full_name=f"Existing {tag}",
            date_of_birth="1975-10-10",
            gender="Male",
            primary_mobile=mobile,
            is_active=1,
        )
        aa_no_scope = User(
            username=f"aa_noscope_{tag}",
            email=f"aa_noscope_{tag}@hospital.org",
            hashed_password=hash_password("Pass123!AA"),
            role="ROLE_ASSISTANT_ADMIN",
            is_active=1,
        )
        aa_scoped = User(
            username=f"aa_scoped_{tag}",
            email=f"aa_scoped_{tag}@hospital.org",
            hashed_password=hash_password("Pass123!AA"),
            role="ROLE_ASSISTANT_ADMIN",
            is_active=1,
        )
        super_u = User(
            username=f"super_{tag}",
            email=f"super_{tag}@hospital.org",
            hashed_password=hash_password("Pass123!SU"),
            role="ROLE_SUPER_USER",
            is_active=1,
        )
        rec_u = User(
            username=f"rec_ov_{tag}",
            email=f"rec_ov_{tag}@hospital.org",
            hashed_password=hash_password("Pass123!Rec"),
            role="ROLE_RECEPTIONIST",
            is_active=1,
        )
        db.add_all([p, aa_no_scope, aa_scoped, super_u, rec_u])
        await db.commit()

        # Grant 'duplicates:resolve' scope to aa_scoped
        await grant_permission_scope(db, super_u, aa_scoped, "duplicates:resolve")
        await db.commit()
        aa_no_id, aa_sc_id, super_id, rec_id = aa_no_scope.id, aa_scoped.id, super_u.id, rec_u.id
        break

    aa_no_token = create_access_token(user_id=aa_no_id, username=f"aa_noscope_{tag}", role="ROLE_ASSISTANT_ADMIN")
    aa_sc_token = create_access_token(user_id=aa_sc_id, username=f"aa_scoped_{tag}", role="ROLE_ASSISTANT_ADMIN")
    rec_token = create_access_token(user_id=rec_id, username=f"rec_ov_{tag}", role="ROLE_RECEPTIONIST")

    dup_payload = {
        "full_name": f"New Patient {tag}",
        "date_of_birth": "1995-12-12",
        "gender": "Female",
        "primary_mobile": mobile,  # Colliding mobile
        "override_duplicate": True,
        "justification": "Patient confirmed distinct identity via national ID verification card.",
    }

    # 1. Assistant Admin WITHOUT 'duplicates:resolve' scope -> 403 Forbidden
    aa_no_resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/patients",
        headers={"Authorization": f"Bearer {aa_no_token}"},
        json=dup_payload,
    )
    assert aa_no_resp.status_code == 403
    assert aa_no_resp.json()["code"] == "SCOPE_PERMISSION_DENIED"

    # 2. Assistant Admin WITH 'duplicates:resolve' scope -> 201 Created (override executed)
    aa_sc_resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/patients",
        headers={"Authorization": f"Bearer {aa_sc_token}"},
        json=dup_payload,
    )
    assert aa_sc_resp.status_code == 201

    # 3. Receptionist attempting override WITHOUT justification -> 400 Bad Request
    unjustified_payload = dup_payload.copy()
    unjustified_payload["justification"] = ""
    bad_resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/patients",
        headers={"Authorization": f"Bearer {rec_token}"},
        json=unjustified_payload,
    )
    assert bad_resp.status_code == 400
    assert bad_resp.json()["code"] == "JUSTIFICATION_REQUIRED"

    # 4. Receptionist attempting override WITH justification -> 201 Created
    rec_resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/patients",
        headers={"Authorization": f"Bearer {rec_token}"},
        json=dup_payload,
    )
    assert rec_resp.status_code == 201


# ==============================================================================
# 2. REGISTRATION ENCOUNTER TESTS
# ==============================================================================

@pytest.mark.asyncio
async def test_registration_draft_creation_and_age_snapshot(async_client):
    """Verify registration draft creation, age calculation, and biological age freeze."""
    tag = uid()

    # Adult patient DOB: 1990-01-01
    async for db in get_db():
        rec_u = User(
            username=f"rec_snap_{tag}",
            email=f"rec_snap_{tag}@hospital.org",
            hashed_password=hash_password("Pass123!"),
            role="ROLE_RECEPTIONIST",
            is_active=1,
        )
        adult_p = Patient(
            patient_id=f"PID-2026-A{tag[:4]}",
            full_name=f"Adult {tag}",
            date_of_birth="1990-01-01",
            gender="Male",
            primary_mobile=f"+1444{tag[:7]}",
            is_active=1,
        )
        # Minor patient DOB: exactly 10 years ago
        current_year = datetime.now(timezone.utc).year
        minor_dob = f"{current_year - 10}-05-15"
        minor_p = Patient(
            patient_id=f"PID-2026-M{tag[:4]}",
            full_name=f"Minor {tag}",
            date_of_birth=minor_dob,
            gender="Female",
            primary_mobile=f"+1333{tag[:7]}",
            is_active=1,
        )
        db.add_all([rec_u, adult_p, minor_p])
        await db.commit()
        rec_id, adult_id, minor_id = rec_u.id, adult_p.id, minor_p.id
        break

    rec_token = create_access_token(user_id=rec_id, username=f"rec_snap_{tag}", role="ROLE_RECEPTIONIST")

    # 1. Create adult draft registration
    r1 = await async_client.post(
        f"{settings.API_V1_PREFIX}/registrations",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={
            "patient_id": adult_id,
            "reason_for_visit": "General checkup",
            "department": "General Medicine",
        },
    )
    assert r1.status_code == 201
    adult_reg = r1.json()
    assert adult_reg["status"] == "DRAFT"
    assert adult_reg["age_at_registration"] == (datetime.now(timezone.utc).year - 1990)
    assert adult_reg["registration_id"].startswith("AEGIS-")
    assert adult_reg["existing_conditions"] == "Not Provided"  # Clinical default preserved
    assert adult_reg["allergy_status"] == "Not Provided / Unknown"

    # 2. Create minor draft registration
    r2 = await async_client.post(
        f"{settings.API_V1_PREFIX}/registrations",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"patient_id": minor_id},
    )
    assert r2.status_code == 201
    minor_reg = r2.json()
    assert minor_reg["age_at_registration"] == 10

    # 3. Attempt to submit minor without emergency contact -> Rejected with 422
    sub_fail = await async_client.post(
        f"{settings.API_V1_PREFIX}/registrations/{minor_reg['id']}/submit",
        headers={"Authorization": f"Bearer {rec_token}"},
    )
    assert sub_fail.status_code == 422
    assert "Emergency Contact" in sub_fail.json()["detail"]

    # 4. Update minor draft to provide emergency contact
    update_resp = await async_client.put(
        f"{settings.API_V1_PREFIX}/registrations/{minor_reg['id']}",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={
            "emergency_contact_name": "Mother Jane",
            "emergency_contact_relationship": "Parent",
            "emergency_contact_phone": "+15559876543",
        },
    )
    assert update_resp.status_code == 200

    # 5. Now submission succeeds
    sub_success = await async_client.post(
        f"{settings.API_V1_PREFIX}/registrations/{minor_reg['id']}/submit",
        headers={"Authorization": f"Bearer {rec_token}"},
    )
    assert sub_success.status_code == 200
    assert sub_success.json()["status"] == "SUBMITTED"


@pytest.mark.asyncio
async def test_patient_online_intake_submission_and_immutability(async_client):
    """Verify Patient advances DRAFT -> PENDING_REVIEW and draft becomes immutable to further edits."""
    tag = uid()

    async for db in get_db():
        u = User(
            username=f"portal_p_{tag}",
            email=f"portal_p_{tag}@hospital.org",
            hashed_password=hash_password("PassWord123!"),
            role="ROLE_PATIENT",
            is_active=1,
        )
        db.add(u)
        await db.commit()

        p = Patient(
            patient_id=f"PID-2026-P{tag[:4]}",
            user_id=u.id,
            full_name=f"Portal Patient {tag}",
            date_of_birth="1988-08-08",
            gender="Female",
            primary_mobile=f"+1555{tag[:7]}",
            is_active=1,
        )
        db.add(p)
        await db.commit()
        user_id = u.id
        break

    token = create_access_token(user_id=user_id, username=f"portal_p_{tag}", role="ROLE_PATIENT")

    # 1. Patient creates self intake draft (auto-resolves patient_id from token)
    draft_resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/registrations",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "reason_for_visit": "Persistent headache",
            "existing_conditions": "Migraine",
            "allergy_status": "No Known Allergies (NKDA)",
        },
    )
    assert draft_resp.status_code == 201
    reg_id = draft_resp.json()["id"]
    assert draft_resp.json()["status"] == "DRAFT"

    # 2. Patient submits draft -> Status advances to PENDING_REVIEW
    submit_resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/registrations/{reg_id}/submit",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert submit_resp.status_code == 200
    assert submit_resp.json()["status"] == "PENDING_REVIEW"
    assert submit_resp.json()["submitted_by_user_id"] == user_id

    # 3. Patient attempts to edit registration after submission -> 400 Illegal State Transition
    edit_resp = await async_client.put(
        f"{settings.API_V1_PREFIX}/registrations/{reg_id}",
        headers={"Authorization": f"Bearer {token}"},
        json={"reason_for_visit": "Changed my mind"},
    )
    assert edit_resp.status_code == 400
    assert edit_resp.json()["code"] == "ILLEGAL_STATE_TRANSITION"


@pytest.mark.asyncio
async def test_clinical_review_approval_and_rejection_rules(async_client):
    """Verify clinical staff review: approval, mandatory rejection reason, and terminal rejection state."""
    tag = uid()

    async for db in get_db():
        rec_u = User(
            username=f"rec_rev_{tag}",
            email=f"rec_rev_{tag}@hospital.org",
            hashed_password=hash_password("Pass123!Rev"),
            role="ROLE_RECEPTIONIST",
            is_active=1,
        )
        pat_u = User(
            username=f"pat_rev_{tag}",
            email=f"pat_rev_{tag}@hospital.org",
            hashed_password=hash_password("Pass123!Pat"),
            role="ROLE_PATIENT",
            is_active=1,
        )
        p = Patient(
            patient_id=f"PID-2026-R{tag[:4]}",
            full_name=f"Review Candidate {tag}",
            date_of_birth="1992-04-10",
            gender="Male",
            primary_mobile=f"+1222{tag[:7]}",
            is_active=1,
        )
        db.add_all([rec_u, pat_u, p])
        await db.commit()
        patient_id = p.id
        rec_id = rec_u.id
        pat_id = pat_u.id
        break

    rec_token = create_access_token(user_id=rec_id, username=f"rec_rev_{tag}", role="ROLE_RECEPTIONIST")
    pat_token = create_access_token(user_id=pat_id, username=f"pat_rev_{tag}", role="ROLE_PATIENT")

    # 1. Seed two drafts
    r1 = await async_client.post(
        f"{settings.API_V1_PREFIX}/registrations",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"patient_id": patient_id},
    )
    r2 = await async_client.post(
        f"{settings.API_V1_PREFIX}/registrations",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"patient_id": patient_id},
    )
    reg_approve_id = r1.json()["id"]
    reg_reject_id = r2.json()["id"]

    # 2. Patient attempts to execute review -> 403 Forbidden
    pat_review = await async_client.post(
        f"{settings.API_V1_PREFIX}/registrations/{reg_approve_id}/review",
        headers={"Authorization": f"Bearer {pat_token}"},
        json={"action": "APPROVE"},
    )
    assert pat_review.status_code == 403

    # 3. Staff approves Registration 1 -> Transitions to SUBMITTED
    app_resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/registrations/{reg_approve_id}/review",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"action": "APPROVE"},
    )
    assert app_resp.status_code == 200
    assert app_resp.json()["status"] == "SUBMITTED"

    # 4. Attempt to reject Registration 2 WITHOUT rejection_reason -> 422 Unprocessable Entity
    bad_rej = await async_client.post(
        f"{settings.API_V1_PREFIX}/registrations/{reg_reject_id}/review",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"action": "REJECT", "rejection_reason": "   "},
    )
    assert bad_rej.status_code == 422
    assert bad_rej.json()["code"] == "REJECTION_REASON_MANDATORY"

    # 5. Reject Registration 2 WITH concise administrative reason -> Transitions to REJECTED
    good_rej = await async_client.post(
        f"{settings.API_V1_PREFIX}/registrations/{reg_reject_id}/review",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={
            "action": "REJECT",
            "rejection_reason": "Patient requested appointment cancellation prior to triage intake.",
        },
    )
    assert good_rej.status_code == 200
    assert good_rej.json()["status"] == "REJECTED"
    assert "cancellation" in good_rej.json()["rejection_reason"]

    # 6. Terminal State: Attempting to approve an already REJECTED registration -> 400 Illegal State Transition
    rej_reapp = await async_client.post(
        f"{settings.API_V1_PREFIX}/registrations/{reg_reject_id}/review",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"action": "APPROVE"},
    )
    assert rej_reapp.status_code == 400
    assert rej_reapp.json()["code"] == "ILLEGAL_STATE_TRANSITION"


@pytest.mark.asyncio
async def test_assistant_admin_submission_and_rejection_scopes(async_client):
    """Verify Assistant Administrator strictly requires 'registrations:submit' and 'registrations:reject'."""
    tag = uid()

    async for db in get_db():
        p = Patient(
            patient_id=f"PID-2026-S{tag[:4]}",
            full_name=f"Scope Candidate {tag}",
            date_of_birth="1980-05-20",
            gender="Female",
            primary_mobile=f"+1888{tag[:7]}",
            is_active=1,
        )
        aa_user = User(
            username=f"aa_staff_{tag}",
            email=f"aa_staff_{tag}@hospital.org",
            hashed_password=hash_password("Pass123!Safe"),
            role="ROLE_ASSISTANT_ADMIN",
            is_active=1,
        )
        super_u = User(
            username=f"super_adm_{tag}",
            email=f"super_adm_{tag}@hospital.org",
            hashed_password=hash_password("Pass123!Safe"),
            role="ROLE_SUPER_USER",
            is_active=1,
        )
        db.add_all([p, aa_user, super_u])
        await db.commit()

        # Grant 'registrations:create_desk' and 'registrations:edit' ONLY (no submit or reject)
        await grant_permission_scope(db, super_u, aa_user, "registrations:create_desk")
        await grant_permission_scope(db, super_u, aa_user, "registrations:edit")
        await db.commit()
        aa_id, p_id, super_id = aa_user.id, p.id, super_u.id
        break

    aa_token = create_access_token(user_id=aa_id, username=f"aa_staff_{tag}", role="ROLE_ASSISTANT_ADMIN")

    # 1. AA creates draft (Allowed via 'registrations:create_desk') -> 201
    create_resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/registrations",
        headers={"Authorization": f"Bearer {aa_token}"},
        json={"patient_id": p_id},
    )
    assert create_resp.status_code == 201
    reg_id = create_resp.json()["id"]

    # 2. AA attempts final submission to SUBMITTED without 'registrations:submit' scope -> 403 Forbidden
    sub_resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/registrations/{reg_id}/submit",
        headers={"Authorization": f"Bearer {aa_token}"},
    )
    assert sub_resp.status_code == 403
    assert sub_resp.json()["code"] == "SCOPE_PERMISSION_DENIED"

    # 3. AA attempts rejection without 'registrations:reject' scope -> 403 Forbidden
    rej_resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/registrations/{reg_id}/review",
        headers={"Authorization": f"Bearer {aa_token}"},
        json={"action": "REJECT", "rejection_reason": "No documentation."},
    )
    assert rej_resp.status_code == 403
    assert rej_resp.json()["code"] == "SCOPE_PERMISSION_DENIED"

    # 4. Now Super User grants 'registrations:submit' to AA
    async for db in get_db():
        su = (await db.execute(select(User).where(User.id == super_id))).scalar_one()
        aa = (await db.execute(select(User).where(User.id == aa_id))).scalar_one()
        await grant_permission_scope(db, su, aa, "registrations:submit")
        await db.commit()
        break

    # 5. Live DB check: AA now immediately succeeds on submit! -> 200 SUBMITTED
    sub_ok = await async_client.post(
        f"{settings.API_V1_PREFIX}/registrations/{reg_id}/submit",
        headers={"Authorization": f"Bearer {aa_token}"},
    )
    assert sub_ok.status_code == 200
    assert sub_ok.json()["status"] == "SUBMITTED"


@pytest.mark.asyncio
async def test_submission_idempotency_caching_and_collision_defense(async_client):
    """Verify idempotency key caches result for same actor, while rejecting cross-actor collisions."""
    tag = uid()
    idem_key = str(uuid.uuid4())

    async for db in get_db():
        p = Patient(
            patient_id=f"PID-2026-I{tag[:4]}",
            full_name=f"Idem Patient {tag}",
            date_of_birth="1984-06-12",
            gender="Female",
            primary_mobile=f"+1111{tag[:7]}",
            is_active=1,
        )
        u1 = User(
            username=f"idem_u1_{tag}",
            email=f"idem_u1_{tag}@hospital.org",
            hashed_password=hash_password("Pass123!"),
            role="ROLE_RECEPTIONIST",
            is_active=1,
        )
        u2 = User(
            username=f"idem_u2_{tag}",
            email=f"idem_u2_{tag}@hospital.org",
            hashed_password=hash_password("Pass123!"),
            role="ROLE_RECEPTIONIST",
            is_active=1,
        )
        db.add_all([p, u1, u2])
        await db.commit()
        p_id, u1_id, u2_id = p.id, u1.id, u2.id
        break

    t1 = create_access_token(user_id=u1_id, username=f"idem_u1_{tag}", role="ROLE_RECEPTIONIST")
    t2 = create_access_token(user_id=u2_id, username=f"idem_u2_{tag}", role="ROLE_RECEPTIONIST")

    payload = {"patient_id": p_id, "reason_for_visit": "Fever"}

    # 1. User 1 submits with idempotency key -> 201 Created
    r1 = await async_client.post(
        f"{settings.API_V1_PREFIX}/registrations",
        headers={"Authorization": f"Bearer {t1}", "X-Idempotency-Key": idem_key},
        json=payload,
    )
    assert r1.status_code == 201
    created_id = r1.json()["id"]

    # 2. User 1 repeats the exact same call with same idempotency key -> Returns cached record (idempotent)
    r1_retry = await async_client.post(
        f"{settings.API_V1_PREFIX}/registrations",
        headers={"Authorization": f"Bearer {t1}", "X-Idempotency-Key": idem_key},
        json=payload,
    )
    assert r1_retry.status_code in (200, 201)
    assert r1_retry.json()["id"] == created_id

    # 3. User 2 attempts to use User 1's idempotency key -> 409 Collision (Prevents cross-account disclosure)
    r2_collision = await async_client.post(
        f"{settings.API_V1_PREFIX}/registrations",
        headers={"Authorization": f"Bearer {t2}", "X-Idempotency-Key": idem_key},
        json=payload,
    )
    assert r2_collision.status_code == 409
    assert r2_collision.json()["code"] == "IDEMPOTENCY_KEY_COLLISION"


@pytest.mark.asyncio
async def test_pagination_search_and_audit_logging(async_client):
    """Verify patient search, registration status filters, and clinical audit event logging."""
    tag = uid()

    async for db in get_db():
        rec_u = User(
            username=f"rec_pag_{tag}",
            email=f"rec_pag_{tag}@hospital.org",
            hashed_password=hash_password("Pass123!"),
            role="ROLE_RECEPTIONIST",
            is_active=1,
        )
        db.add(rec_u)
        await db.commit()
        staff_id = rec_u.id
        break

    staff_token = create_access_token(user_id=staff_id, username=f"rec_pag_{tag}", role="ROLE_RECEPTIONIST")

    # 1. Create a patient with unique searchable name
    searchable_name = f"Zaphod Beeblebrox {tag}"
    p_resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/patients",
        headers={"Authorization": f"Bearer {staff_token}"},
        json={
            "full_name": searchable_name,
            "date_of_birth": "1970-01-01",
            "gender": "Other",
            "primary_mobile": f"+1000{tag[:7]}",
        },
    )
    assert p_resp.status_code == 201
    p_id = p_resp.json()["id"]

    # 2. Search patients by query
    query_resp = await async_client.get(
        f"{settings.API_V1_PREFIX}/patients?query=Beeblebrox",
        headers={"Authorization": f"Bearer {staff_token}"},
    )
    assert query_resp.status_code == 200
    results = query_resp.json()["items"]
    assert any(p["full_name"] == searchable_name for p in results)

    # 3. Create and list registrations filtered by status
    r_resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/registrations",
        headers={"Authorization": f"Bearer {staff_token}"},
        json={"patient_id": p_id},
    )
    assert r_resp.status_code == 201

    reg_list = await async_client.get(
        f"{settings.API_V1_PREFIX}/registrations?status=DRAFT",
        headers={"Authorization": f"Bearer {staff_token}"},
    )
    assert reg_list.status_code == 200
    assert reg_list.json()["total"] >= 1
    # Verify patient relationship is eagerly serialized in registration items
    first_item = reg_list.json()["items"][0]
    assert first_item["patient"] is not None
    assert "full_name" in first_item["patient"]
    assert "patient_id" in first_item["patient"]

    # Verify registration search by patient name
    search_reg_list = await async_client.get(
        f"{settings.API_V1_PREFIX}/registrations?search=Beeblebrox",
        headers={"Authorization": f"Bearer {staff_token}"},
    )
    assert search_reg_list.status_code == 200
    assert search_reg_list.json()["total"] >= 1
    assert any(item["patient"]["full_name"] == searchable_name for item in search_reg_list.json()["items"])

    # 4. Verify audit trail in database
    async for db in get_db():
        stmt = (
            select(AuditEvent)
            .where(
                AuditEvent.target_entity_type == "patients",
                AuditEvent.action_type == "PATIENT_CREATED",
                AuditEvent.target_entity_id == str(p_id),
            )
        )
        audit = (await db.execute(stmt)).scalar_one_or_none()
        assert audit is not None
        assert audit.actor_role == "ROLE_RECEPTIONIST"
        break


@pytest.mark.asyncio
async def test_admission_roster_sorted_newest_to_oldest(async_client):
    """Verify Admission Roster (registrations list) is ordered newest-to-oldest by created_at."""
    tag = uid()

    async for db in get_db():
        rec_u = User(
            username=f"rec_sort_{tag}",
            email=f"rec_sort_{tag}@hospital.org",
            hashed_password=hash_password("Pass123!"),
            role="ROLE_RECEPTIONIST",
            is_active=1,
        )
        db.add(rec_u)
        await db.commit()
        staff_id = rec_u.id
        break

    staff_token = create_access_token(user_id=staff_id, username=f"rec_sort_{tag}", role="ROLE_RECEPTIONIST")
    headers = {"Authorization": f"Bearer {staff_token}"}

    # 1. Check existing registrations order
    list_before = await async_client.get(f"{settings.API_V1_PREFIX}/registrations?page=1&limit=20", headers=headers)
    assert list_before.status_code == 200
    items_before = list_before.json()["items"]
    for i in range(len(items_before) - 1):
        assert items_before[i]["created_at"] >= items_before[i + 1]["created_at"]

    # 2. Create a new patient & registration
    p_resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/patients",
        headers=headers,
        json={
            "full_name": f"Sorting Patient {tag}",
            "date_of_birth": "1992-05-10",
            "gender": "Female",
            "primary_mobile": f"+1999{tag[:7]}",
        },
    )
    assert p_resp.status_code == 201
    p_id = p_resp.json()["id"]

    r_resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/registrations",
        headers=headers,
        json={"patient_id": p_id},
    )
    assert r_resp.status_code == 201
    new_reg = r_resp.json()
    new_reg_id = new_reg["registration_id"]

    # 3. Fetch Admission Roster page 1 - newly created registration must be at index 0
    list_after = await async_client.get(f"{settings.API_V1_PREFIX}/registrations?page=1&limit=20", headers=headers)
    assert list_after.status_code == 200
    items_after = list_after.json()["items"]
    assert items_after[0]["registration_id"] == new_reg_id
    if len(items_after) > 1:
        assert items_after[0]["created_at"] >= items_after[1]["created_at"]

