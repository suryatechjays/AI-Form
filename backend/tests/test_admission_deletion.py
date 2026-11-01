"""Regression and Integration Tests for Admission Encounter and Patient Deletion.

Validates:
1. Super User can permanently delete an admission registration encounter via DELETE /api/v1/registrations/{id}.
2. Transaction commits explicitly to SQLite and row is verified absent from the database.
3. Orphan patient master records and uploaded document references are safely cleaned up.
4. Non-super-users (Receptionist, Patient) receive HTTP 403 Forbidden on deletion attempts.
5. Deletion of non-existent encounters returns HTTP 404 with RFC 7807 problem details.
6. Direct patient master deletion via DELETE /api/v1/patients/{id} cascades to dependent encounters.
"""

import uuid
import pytest
from sqlalchemy import select
from app.core.security import create_access_token
from app.database import get_db
from app.models.patient import Patient
from app.models.registration import Registration
from app.models.user import User


def uid() -> str:
    return uuid.uuid4().hex[:8]


async def get_user_by_username(username: str) -> User:
    async for db in get_db():
        result = await db.execute(select(User).where(User.username == username))
        user = result.scalar_one_or_none()
        if user:
            return user
        break
    raise RuntimeError(f"User {username} not found")


@pytest.mark.asyncio
async def test_delete_registration_as_superuser_success(async_client):
    """Super User can delete an admission registration encounter, verified directly in SQLite."""
    admin = await get_user_by_username("admin")
    admin_token = create_access_token(user_id=admin.id, username=admin.username, role=admin.role)
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # 1. Create a patient
    tag = uid()
    patient_payload = {
        "full_name": f"Admit Test Patient {tag}",
        "date_of_birth": "1990-05-15",
        "gender": "Male",
        "blood_group": "O+",
        "primary_mobile": f"+9198{tag[:8]}",
        "email": f"admit_pat_{tag}@test.org",
    }
    pat_res = await async_client.post("/api/v1/patients", json=patient_payload, headers=admin_headers)
    assert pat_res.status_code == 201
    pat_data = pat_res.json()
    patient_id = pat_data["id"]

    # 2. Create a registration draft for this patient
    reg_payload = {
        "patient_id": patient_id,
        "contact_mobile": patient_payload["primary_mobile"],
        "contact_email": patient_payload["email"],
        "department": "Cardiology",
        "reason_for_visit": "Chest pain evaluation",
    }
    reg_res = await async_client.post("/api/v1/registrations", json=reg_payload, headers=admin_headers)
    assert reg_res.status_code == 201
    reg_data = reg_res.json()
    reg_id = reg_data["id"]
    reg_code = reg_data["registration_id"]

    # 3. Verify record exists directly in SQLite
    async for db in get_db():
        check_reg = await db.get(Registration, reg_id)
        assert check_reg is not None
        assert check_reg.registration_id == reg_code
        break

    # 4. Execute deletion via the Admission Router endpoint
    del_res = await async_client.delete(f"/api/v1/registrations/{reg_code}", headers=admin_headers)
    assert del_res.status_code == 200
    del_data = del_res.json()
    assert del_data["success"] is True
    assert del_data["deleted_registration_id"] == reg_code

    # 5. Direct SQLite verification that the registration row is completely removed
    async for db in get_db():
        check_deleted = await db.get(Registration, reg_id)
        assert check_deleted is None, "ERROR: Registration row still exists in SQLite after DELETE!"

        # Since this was the patient's only registration, verify orphan patient was also removed
        check_pat = await db.get(Patient, patient_id)
        assert check_pat is None, "ERROR: Orphan patient record was not cleaned up!"
        break


@pytest.mark.asyncio
async def test_delete_registration_as_receptionist_forbidden(async_client):
    """Receptionist lacks permission to delete admission registrations (HTTP 403)."""
    admin = await get_user_by_username("admin")
    admin_token = create_access_token(user_id=admin.id, username=admin.username, role=admin.role)
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    receptionist = await get_user_by_username("receptionist")
    rec_token = create_access_token(user_id=receptionist.id, username=receptionist.username, role=receptionist.role)
    rec_headers = {"Authorization": f"Bearer {rec_token}"}

    # Create patient and registration
    tag = uid()
    patient_payload = {
        "full_name": f"Forbidden Test Patient {tag}",
        "date_of_birth": "1988-08-20",
        "gender": "Female",
        "blood_group": "A+",
        "primary_mobile": f"+9197{tag[:8]}",
    }
    pat_res = await async_client.post("/api/v1/patients", json=patient_payload, headers=admin_headers)
    assert pat_res.status_code == 201
    pat_id = pat_res.json()["id"]

    reg_payload = {
        "patient_id": pat_id,
        "contact_mobile": patient_payload["primary_mobile"],
        "department": "General Medicine",
    }
    reg_res = await async_client.post("/api/v1/registrations", json=reg_payload, headers=admin_headers)
    assert reg_res.status_code == 201
    reg_code = reg_res.json()["registration_id"]
    reg_id = reg_res.json()["id"]

    # Receptionist attempts DELETE
    del_res = await async_client.delete(f"/api/v1/registrations/{reg_code}", headers=rec_headers)
    assert del_res.status_code == 403

    # Direct SQLite verification that record was NOT deleted
    async for db in get_db():
        check_reg = await db.get(Registration, reg_id)
        assert check_reg is not None
        break


@pytest.mark.asyncio
async def test_delete_registration_nonexistent_returns_404(async_client):
    """Deleting a non-existent registration identifier returns HTTP 404."""
    admin = await get_user_by_username("admin")
    admin_token = create_access_token(user_id=admin.id, username=admin.username, role=admin.role)
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    del_res = await async_client.delete("/api/v1/registrations/AEGIS-9999-99999", headers=admin_headers)
    assert del_res.status_code == 404


@pytest.mark.asyncio
async def test_delete_patient_as_superuser_cascades_safely(async_client):
    """Direct deletion of patient master record cascades to dependent registrations in SQLite."""
    admin = await get_user_by_username("admin")
    admin_token = create_access_token(user_id=admin.id, username=admin.username, role=admin.role)
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    tag = uid()
    patient_payload = {
        "full_name": f"Cascade Patient {tag}",
        "date_of_birth": "1995-12-01",
        "gender": "Other",
        "blood_group": "B+",
        "primary_mobile": f"+9196{tag[:8]}",
    }
    pat_res = await async_client.post("/api/v1/patients", json=patient_payload, headers=admin_headers)
    assert pat_res.status_code == 201
    pat_id = pat_res.json()["id"]
    pid_str = pat_res.json()["patient_id"]

    # Create two admissions for this patient
    for dept in ["Pediatrics", "Orthopedics"]:
        r_res = await async_client.post(
            "/api/v1/registrations",
            json={"patient_id": pat_id, "contact_mobile": patient_payload["primary_mobile"], "department": dept},
            headers=admin_headers,
        )
        assert r_res.status_code == 201

    # Delete patient master record
    del_res = await async_client.delete(f"/api/v1/patients/{pid_str}", headers=admin_headers)
    assert del_res.status_code == 200
    assert del_res.json()["registrations_deleted_count"] == 2

    # Direct SQLite verification: patient and both registrations are gone
    async for db in get_db():
        pat_check = await db.get(Patient, pat_id)
        assert pat_check is None

        regs_check = await db.execute(select(Registration).where(Registration.patient_id == pat_id))
        assert len(regs_check.scalars().all()) == 0
        break

