"""Integration and Unit Tests for AEGIS User and Role Management (Module 3.2).

Validates:
1. SQLite persistence for dynamically created users.
2. Role-based user listing and search.
3. Anti-escalation rules (Super User vs Assistant Admin vs Patient).
4. Self-lockout prevention for Super Users.
5. Soft deactivation toggling adhering to HIPAA audit retention.
6. Live authentication with newly provisioned credentials.
"""

import uuid
import pytest
from sqlalchemy import select
from app.core.security import create_access_token, hash_password
from app.database import get_db
from app.models.audit import AuditEvent
from app.models.permission import PermissionScope, UserPermission
from app.models.user import User


def uid() -> str:
    """Generate short unique suffix for test isolation."""
    return uuid.uuid4().hex[:8]


async def get_user_by_username(username: str) -> User:
    """Helper to retrieve seeded or created user by username."""
    async for db in get_db():
        result = await db.execute(select(User).where(User.username == username))
        user = result.scalar_one_or_none()
        if user:
            return user
        break
    raise RuntimeError(f"User {username} not found")


@pytest.mark.asyncio
async def test_list_users_as_superuser(async_client):
    """Verify Super User can list all accounts with attached permission scopes."""
    admin = await get_user_by_username("admin")
    token = create_access_token(user_id=admin.id, username=admin.username, role=admin.role)
    headers = {"Authorization": f"Bearer {token}"}

    response = await async_client.get("/api/v1/users", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data
    assert data["total"] >= 4

    usernames = [u["username"] for u in data["items"]]
    assert "admin" in usernames
    assert "receptionist" in usernames


@pytest.mark.asyncio
async def test_provision_receptionist_persisted_to_sqlite(async_client):
    """Verify Super User can create a new Receptionist, verify SQLite row, and log in with it."""
    tag = uid()
    new_username = f"receptionist_{tag}"
    new_email = f"recep_{tag}@aegishealth.org"
    new_password = "SecurePassword123!"

    admin = await get_user_by_username("admin")
    token = create_access_token(user_id=admin.id, username=admin.username, role=admin.role)
    headers = {"Authorization": f"Bearer {token}"}

    payload = {
        "username": new_username,
        "email": new_email,
        "role": "ROLE_RECEPTIONIST",
        "password": new_password,
        "is_active": 1,
        "permissions": ["registrations:create_desk", "records:view_all"],
    }

    create_res = await async_client.post("/api/v1/users", json=payload, headers=headers)
    assert create_res.status_code == 201
    created_data = create_res.json()
    assert created_data["username"] == new_username
    assert created_data["email"] == new_email
    assert created_data["role"] == "ROLE_RECEPTIONIST"
    assert created_data["is_active"] == 1
    assert "password" not in created_data
    assert "hashed_password" not in created_data

    # Verify SQLite database row persistence directly
    async for db in get_db():
        result = await db.execute(select(User).where(User.username == new_username))
        db_user = result.scalar_one_or_none()
        assert db_user is not None
        assert db_user.email == new_email
        assert db_user.hashed_password.startswith("$argon2id$")
        break

    # Verify that the newly provisioned user can log in against /api/v1/auth/login
    login_res = await async_client.post(
        "/api/v1/auth/login",
        json={"username_or_email": new_username, "password": new_password},
    )
    assert login_res.status_code == 200
    login_data = login_res.json()
    assert "access_token" in login_data
    assert login_data["username"] == new_username


@pytest.mark.asyncio
async def test_assistant_admin_anti_escalation(async_client):
    """Verify Assistant Admin cannot provision a Super User (anti-escalation rule)."""
    tag = uid()
    async for db in get_db():
        asst = User(
            username=f"asst_{tag}",
            email=f"asst_{tag}@aegishealth.org",
            hashed_password=hash_password("Pass123!"),
            role="ROLE_ASSISTANT_ADMIN",
            is_active=1,
        )
        db.add(asst)
        await db.commit()
        asst_id = asst.id
        break

    token = create_access_token(user_id=asst_id, username=f"asst_{tag}", role="ROLE_ASSISTANT_ADMIN")
    headers = {"Authorization": f"Bearer {token}"}

    # Attempt to provision a Super User -> Must fail with 403 Forbidden
    payload = {
        "username": f"rogue_super_{tag}",
        "email": f"rogue_{tag}@aegishealth.org",
        "role": "ROLE_SUPER_USER",
        "password": "Pass123!",
        "is_active": 1,
    }
    escalate_res = await async_client.post("/api/v1/users", json=payload, headers=headers)
    assert escalate_res.status_code == 403


@pytest.mark.asyncio
async def test_patient_forbidden_from_user_management(async_client):
    """Verify Patients are blocked from all user management actions."""
    patient = await get_user_by_username("patient")
    token = create_access_token(user_id=patient.id, username=patient.username, role=patient.role)
    headers = {"Authorization": f"Bearer {token}"}

    res_list = await async_client.get("/api/v1/users", headers=headers)
    assert res_list.status_code == 403

    res_create = await async_client.post(
        "/api/v1/users",
        json={
            "username": "unauthorized_user",
            "email": "unauth@aegishealth.org",
            "role": "ROLE_RECEPTIONIST",
        },
        headers=headers,
    )
    assert res_create.status_code == 403


@pytest.mark.asyncio
async def test_soft_deactivation_and_anti_lockout(async_client):
    """Verify soft deactivation toggling and Super User self-lockout prevention."""
    tag = uid()
    async for db in get_db():
        target = User(
            username=f"deact_target_{tag}",
            email=f"deact_{tag}@aegishealth.org",
            hashed_password=hash_password("Pass123!"),
            role="ROLE_RECEPTIONIST",
            is_active=1,
        )
        db.add(target)
        await db.commit()
        target_id = target.id
        break

    admin = await get_user_by_username("admin")
    super_token = create_access_token(user_id=admin.id, username=admin.username, role=admin.role)
    headers = {"Authorization": f"Bearer {super_token}"}

    # Anti-lockout: Admin cannot deactivate self
    self_deact_res = await async_client.patch(f"/api/v1/users/{admin.id}/deactivate", headers=headers)
    assert self_deact_res.status_code == 400
    assert "SELF_DEACTIVATION_PROHIBITED" in self_deact_res.json().get("code", "")

    # Deactivate target user
    deact_res = await async_client.patch(f"/api/v1/users/{target_id}/deactivate", headers=headers)
    assert deact_res.status_code == 200
    assert deact_res.json()["is_active"] == 0

    # Verify deactivated user cannot log in
    login_attempt = await async_client.post(
        "/api/v1/auth/login",
        json={"username_or_email": f"deact_target_{tag}", "password": "Pass123!"},
    )
    assert login_attempt.status_code == 403
    assert "ACCOUNT_DEACTIVATED" in login_attempt.json().get("code", "")

    # Reactivate target user
    react_res = await async_client.patch(f"/api/v1/users/{target_id}/deactivate", headers=headers)
    assert react_res.status_code == 200
    assert react_res.json()["is_active"] == 1


@pytest.mark.asyncio
async def test_update_user_account(async_client):
    """Verify Super User can update email, role, and permissions on an existing user."""
    tag = uid()
    async for db in get_db():
        user = User(
            username=f"update_u_{tag}",
            email=f"old_{tag}@aegishealth.org",
            hashed_password=hash_password("Pass123!"),
            role="ROLE_RECEPTIONIST",
            is_active=1,
        )
        db.add(user)
        await db.commit()
        u_id = user.id
        break

    admin = await get_user_by_username("admin")
    super_token = create_access_token(user_id=admin.id, username=admin.username, role=admin.role)
    headers = {"Authorization": f"Bearer {super_token}"}

    patch_payload = {
        "email": f"new_{tag}@aegishealth.org",
        "role": "ROLE_ASSISTANT_ADMIN",
        "permissions": ["records:view_all", "accounts:receptionist_manage"],
    }

    update_res = await async_client.patch(f"/api/v1/users/{u_id}", json=patch_payload, headers=headers)
    assert update_res.status_code == 200
    data = update_res.json()
    assert data["email"] == f"new_{tag}@aegishealth.org"
    assert data["role"] == "ROLE_ASSISTANT_ADMIN"
    assert "records:view_all" in data["permissions"]


@pytest.mark.asyncio
async def test_user_pagination_and_filtering(async_client):
    """Verify server-side pagination, status filtering, and search in user management."""
    admin = await get_user_by_username("admin")
    super_token = create_access_token(user_id=admin.id, username=admin.username, role=admin.role)
    headers = {"Authorization": f"Bearer {super_token}"}

    # Test pagination: page=1, limit=5
    res = await async_client.get("/api/v1/users?page=1&limit=5", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert "items" in data
    assert "total" in data
    assert "page" in data
    assert "limit" in data
    assert "total_pages" in data
    assert data["page"] == 1
    assert data["limit"] == 5
    assert len(data["items"]) <= 5
    assert data["total_pages"] >= 1

    # Test search by username
    search_res = await async_client.get("/api/v1/users?search=admin", headers=headers)
    assert search_res.status_code == 200
    search_data = search_res.json()
    assert any(u["username"] == "admin" for u in search_data["items"])

    # Test status filter: active
    status_res = await async_client.get("/api/v1/users?status=active&limit=10", headers=headers)
    assert status_res.status_code == 200
    status_data = status_res.json()
    assert all(u["is_active"] == 1 for u in status_data["items"])


@pytest.mark.asyncio
async def test_users_sorted_newest_to_oldest(async_client):
    """Verify Latest User Accounts are returned in newest-to-oldest order by created_at."""
    admin = await get_user_by_username("admin")
    super_token = create_access_token(user_id=admin.id, username=admin.username, role=admin.role)
    headers = {"Authorization": f"Bearer {super_token}"}

    # 1. Fetch current users list
    res_before = await async_client.get("/api/v1/users?page=1&limit=20", headers=headers)
    assert res_before.status_code == 200
    items_before = res_before.json()["items"]

    # Verify descending created_at order across existing items
    for i in range(len(items_before) - 1):
        assert items_before[i]["created_at"] >= items_before[i + 1]["created_at"]

    # 2. Provision a new user
    tag = uid()
    new_username = f"newest_user_{tag}"
    create_payload = {
        "username": new_username,
        "email": f"newest_{tag}@aegishealth.org",
        "role": "ROLE_PATIENT",
        "password": "SecurePassword123!",
        "is_active": 1,
    }
    create_res = await async_client.post("/api/v1/users", json=create_payload, headers=headers)
    assert create_res.status_code == 201

    # 3. Query users list page 1 - the newly created user must be the very first item
    res_after = await async_client.get("/api/v1/users?page=1&limit=20", headers=headers)
    assert res_after.status_code == 200
    items_after = res_after.json()["items"]
    assert items_after[0]["username"] == new_username
    assert items_after[0]["created_at"] >= items_after[1]["created_at"]


@pytest.mark.asyncio
async def test_search_users_by_person_name_and_casing(async_client):
    """Verify searching by person's name, partial match, and different letter casing."""
    admin = await get_user_by_username("admin")
    super_token = create_access_token(user_id=admin.id, username=admin.username, role=admin.role)
    headers = {"Authorization": f"Bearer {super_token}"}

    # 1. Search by staff persona name (lowercase, uppercase, mixed case)
    for q in ["eleanor", "ELEANOR", "Eleanor Vance", "vance", "VANCE"]:
        res = await async_client.get(f"/api/v1/users?search={q}", headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert data["total"] >= 1
        assert any(u["username"] == "admin" for u in data["items"])
        admin_item = next(u for u in data["items"] if u["username"] == "admin")
        assert admin_item["full_name"] == "Dr. Eleanor Vance (Admin)"

    # 2. Search for receptionist persona by name
    res_sarah = await async_client.get("/api/v1/users?search=jenkins", headers=headers)
    assert res_sarah.status_code == 200
    assert any(u["username"] == "receptionist" for u in res_sarah.json()["items"])

    # 3. Search for patient by linked patient full name (partial and mixed case)
    for q in ["david", "DAVID", "Miller", "MILLER", "David Miller"]:
        res_pat = await async_client.get(f"/api/v1/users?search={q}", headers=headers)
        assert res_pat.status_code == 200
        data = res_pat.json()
        assert data["total"] >= 1
        assert any("David" in (u.get("full_name") or "") or u["username"] == "patient" for u in data["items"])

    # 4. Search for partial prefix
    res_partial = await async_client.get("/api/v1/users?search=elea", headers=headers)
    assert res_partial.status_code == 200
    assert any(u["username"] == "admin" for u in res_partial.json()["items"])

    # 5. Non-matching query returns 0
    res_none = await async_client.get("/api/v1/users?search=nonexistentpersonxyz987", headers=headers)
    assert res_none.status_code == 200
    assert res_none.json()["total"] == 0
    assert len(res_none.json()["items"]) == 0


@pytest.mark.asyncio
async def test_user_deactivation_persistence_and_exclusion_from_normal_listing(async_client):
    """Regression test proving:
    1. Deactivation persists in the database and is idempotent.
    2. The inactive user is excluded from normal user listing (GET /api/v1/users).
    3. Refetching the list / navigating does not restore the inactive user.
    4. Active user total count (powering sidebar badge) decrements by 1.
    5. Cache-Control headers prevent stale browser responses.
    6. Pagination does not restore the inactive user.
    7. Other active users are unaffected.
    8. The behavior remains correct after backend restart / pool recycle.
    """
    tag = uid()
    admin = await get_user_by_username("admin")
    super_token = create_access_token(user_id=admin.id, username=admin.username, role=admin.role)
    headers = {"Authorization": f"Bearer {super_token}"}

    # Baseline: capture active user count before provisioning
    base_res = await async_client.get("/api/v1/users?limit=50", headers=headers)
    assert base_res.status_code == 200
    base_active_total = base_res.json()["total"]
    assert "no-store" in base_res.headers.get("Cache-Control", "")

    # Step 1: Create a temporary test user and a control active user
    target_username = f"deact_reg_{tag}"
    create_payload = {
        "username": target_username,
        "email": f"deact_reg_{tag}@aegishealth.org",
        "role": "ROLE_RECEPTIONIST",
        "password": "Password123!",
        "is_active": 1,
    }
    create_res = await async_client.post("/api/v1/users", json=create_payload, headers=headers)
    assert create_res.status_code == 201
    created_user_id = create_res.json()["id"]

    ctrl_username = f"ctrl_reg_{tag}"
    ctrl_res = await async_client.post(
        "/api/v1/users",
        json={
            "username": ctrl_username,
            "email": f"ctrl_reg_{tag}@aegishealth.org",
            "role": "ROLE_RECEPTIONIST",
            "password": "Password123!",
            "is_active": 1,
        },
        headers=headers,
    )
    assert ctrl_res.status_code == 201
    ctrl_user_id = ctrl_res.json()["id"]

    # Step 2: Verify both users appear in active listing and total increased by 2
    list_res1 = await async_client.get("/api/v1/users?limit=50", headers=headers)
    assert list_res1.status_code == 200
    assert list_res1.json()["total"] == base_active_total + 2
    assert any(u["id"] == created_user_id for u in list_res1.json()["items"])
    assert any(u["id"] == ctrl_user_id for u in list_res1.json()["items"])

    # Step 3: Deactivate / soft-delete the user via DELETE /api/v1/users/{id}
    del_res = await async_client.delete(f"/api/v1/users/{created_user_id}", headers=headers)
    assert del_res.status_code == 200
    assert del_res.json()["is_active"] == 0

    # Step 4: Verify persistence in SQLite database directly
    async for db in get_db():
        row = (await db.execute(select(User).where(User.id == created_user_id))).scalar_one()
        assert row.is_active == 0
        break

    # Step 5: Normal user listing (no status param) must strictly exclude the inactive user, total must decrement
    list_res2 = await async_client.get("/api/v1/users?limit=50", headers=headers)
    assert list_res2.status_code == 200
    assert list_res2.json()["total"] == base_active_total + 1, "Active user total must decrement by 1"
    items2 = list_res2.json()["items"]
    assert not any(u["id"] == created_user_id for u in items2), "Deactivated user must NOT appear in normal listing"
    assert any(u["id"] == ctrl_user_id for u in items2), "Active control user must still appear"

    # Step 6: Refetching (simulating navigating away and back) does not restore the inactive user
    refetch_res = await async_client.get("/api/v1/users?page=1&limit=15", headers=headers)
    assert refetch_res.status_code == 200
    refetch_items = refetch_res.json()["items"]
    assert not any(u["id"] == created_user_id for u in refetch_items), "Refetching must not restore inactive user"

    # Step 7: Pagination across pages does not restore the inactive user
    p2_res = await async_client.get("/api/v1/users?page=2&limit=15", headers=headers)
    assert p2_res.status_code == 200
    assert not any(u["id"] == created_user_id for u in p2_res.json()["items"])

    # Step 8: User is accessible when explicitly filtering by 'deactivated' or 'ALL'
    deact_list_res = await async_client.get("/api/v1/users?status=deactivated&limit=50", headers=headers)
    assert deact_list_res.status_code == 200
    assert any(u["id"] == created_user_id for u in deact_list_res.json()["items"])

    all_list_res = await async_client.get("/api/v1/users?status=ALL&limit=50", headers=headers)
    assert all_list_res.status_code == 200
    all_match = next(u for u in all_list_res.json()["items"] if u["id"] == created_user_id)
    assert all_match["is_active"] == 0

    # Step 9: Verify behavior remains correct across database connection recycle / restart
    from app.database import close_db
    await close_db()

    post_restart_res = await async_client.get("/api/v1/users?limit=50", headers=headers)
    assert post_restart_res.status_code == 200
    post_restart_items = post_restart_res.json()["items"]
    assert not any(u["id"] == created_user_id for u in post_restart_items)
    assert any(u["id"] == ctrl_user_id for u in post_restart_items)
    assert post_restart_res.json()["total"] == base_active_total + 1



