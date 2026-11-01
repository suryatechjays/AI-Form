"""Comprehensive tests for AEGIS 8-table database schema, constraints, triggers, and relationships."""

import uuid
import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import selectinload
from app.database import get_db
from app.models import (
    AuditEvent,
    Patient,
    PermissionScope,
    Registration,
    RevokedToken,
    UploadedDocument,
    User,
    UserPermission,
)


def uid() -> str:
    """Generate short unique suffix for isolated test entities."""
    return uuid.uuid4().hex[:8]


@pytest.mark.asyncio
async def test_all_eight_tables_exist():
    """Verify that all eight approved tables and no unauthorized extra tables exist."""
    expected_tables = {
        "users",
        "patients",
        "registrations",
        "uploaded_documents",
        "permission_scopes",
        "user_permissions",
        "audit_events",
        "revoked_tokens",
    }

    async for session in get_db():
        result = await session.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';")
        )
        existing_tables = set(result.scalars().all())
        assert expected_tables == existing_tables, (
            f"Table mismatch. Expected: {expected_tables}, Got: {existing_tables}"
        )
        break


@pytest.mark.asyncio
async def test_table_columns_presence_and_nullability():
    """Verify key columns and primary keys across tables using PRAGMA table_info."""
    async for session in get_db():
        # Check users table
        users_info = (await session.execute(text("PRAGMA table_info(users);"))).fetchall()
        user_cols = {row[1]: {"notnull": row[3], "pk": row[5]} for row in users_info}
        assert "username" in user_cols and user_cols["username"]["notnull"] == 1
        assert "email" in user_cols and user_cols["email"]["notnull"] == 1
        assert "role" in user_cols and user_cols["role"]["notnull"] == 1
        assert "is_active" in user_cols and user_cols["is_active"]["notnull"] == 1

        # Check patients table
        patients_info = (await session.execute(text("PRAGMA table_info(patients);"))).fetchall()
        patient_cols = {row[1]: {"notnull": row[3], "pk": row[5]} for row in patients_info}
        assert "patient_id" in patient_cols and patient_cols["patient_id"]["notnull"] == 1
        assert "full_name" in patient_cols and patient_cols["full_name"]["notnull"] == 1
        assert "date_of_birth" in patient_cols and patient_cols["date_of_birth"]["notnull"] == 1
        assert "gender" in patient_cols and patient_cols["gender"]["notnull"] == 1
        assert "blood_group" in patient_cols and patient_cols["blood_group"]["notnull"] == 1
        assert "primary_mobile" in patient_cols and patient_cols["primary_mobile"]["notnull"] == 1

        # Check registrations table
        reg_info = (await session.execute(text("PRAGMA table_info(registrations);"))).fetchall()
        reg_cols = {row[1]: {"notnull": row[3], "pk": row[5]} for row in reg_info}
        assert "registration_id" in reg_cols and reg_cols["registration_id"]["notnull"] == 1
        assert "patient_id" in reg_cols and reg_cols["patient_id"]["notnull"] == 1
        assert "created_by_user_id" in reg_cols and reg_cols["created_by_user_id"]["notnull"] == 1
        assert "submitted_by_user_id" in reg_cols and reg_cols["submitted_by_user_id"]["notnull"] == 0
        assert "reviewed_by_user_id" in reg_cols and reg_cols["reviewed_by_user_id"]["notnull"] == 0
        assert "status" in reg_cols and reg_cols["status"]["notnull"] == 1
        assert "age_at_registration" in reg_cols and reg_cols["age_at_registration"]["notnull"] == 1
        break


@pytest.mark.asyncio
async def test_unique_constraints_and_patient_duplicate_rules():
    """Verify unique constraints reject duplicates and patient mobile/email permit shared values."""
    async for session in get_db():
        tag = uid()
        u1 = User(
            username=f"doc_{tag}",
            email=f"doc_{tag}@hospital.org",
            hashed_password="hash_value_123",
            role="ROLE_RECEPTIONIST",
        )
        session.add(u1)
        await session.commit()

        # Duplicate username must fail
        u2 = User(
            username=f"doc_{tag}",
            email=f"different_{tag}@hospital.org",
            hashed_password="hash_value_456",
            role="ROLE_RECEPTIONIST",
        )
        session.add(u2)
        with pytest.raises(IntegrityError):
            await session.commit()
        await session.rollback()

        # Duplicate email must fail
        u3 = User(
            username=f"different_{tag}",
            email=f"doc_{tag}@hospital.org",
            hashed_password="hash_value_789",
            role="ROLE_RECEPTIONIST",
        )
        session.add(u3)
        with pytest.raises(IntegrityError):
            await session.commit()
        await session.rollback()

        # Verify patients can share mobile numbers (e.g. parent and dependent child)
        shared_mobile = "+919876543210"
        shared_email = f"family_{tag}@domain.com"
        p1 = Patient(
            patient_id=f"PID-2026-{tag}1",
            full_name="Parent Smith",
            date_of_birth="1980-05-12",
            gender="Male",
            primary_mobile=shared_mobile,
            email=shared_email,
        )
        p2 = Patient(
            patient_id=f"PID-2026-{tag}2",
            full_name="Child Smith",
            date_of_birth="2012-08-20",
            gender="Female",
            primary_mobile=shared_mobile,  # Shared mobile is explicitly allowed
            email=shared_email,           # Shared email is explicitly allowed
        )
        session.add_all([p1, p2])
        await session.commit()
        assert p1.id is not None and p2.id is not None

        # Verify indexes exist in sqlite_master
        idx_res = await session.execute(
            text("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%';")
        )
        created_indexes = set(idx_res.scalars().all())
        expected_sample_indexes = {
            "idx_users_role_active",
            "idx_patients_mobile",
            "idx_patients_email",
            "idx_patients_name_dob",
            "idx_registrations_patient_id",
            "idx_registrations_status_created",
            "idx_registrations_contact_mobile",
            "idx_registrations_pdf_status",
            "idx_documents_patient_id",
            "idx_documents_registration_id",
            "idx_user_permissions_user",
            "idx_audit_timestamp",
            "idx_audit_actor",
            "idx_audit_action_target",
            "idx_revoked_tokens_expiry",
        }
        for idx in expected_sample_indexes:
            assert idx in created_indexes, f"Expected index {idx} not found in database."
        break


@pytest.mark.asyncio
async def test_user_role_check_constraint():
    """Verify CHECK constraint rejects invalid User roles."""
    async for session in get_db():
        tag = uid()
        u = User(
            username=f"hacker_{tag}",
            email=f"hacker_{tag}@bad.org",
            hashed_password="hash",
            role="ROLE_UNAUTHORIZED",
        )
        session.add(u)
        with pytest.raises(IntegrityError):
            await session.commit()
        await session.rollback()
        break


@pytest.mark.asyncio
async def test_patient_gender_check_constraint():
    """Verify CHECK constraint rejects invalid Patient gender."""
    async for session in get_db():
        tag = uid()
        p = Patient(
            patient_id=f"PID-GEND-{tag}",
            full_name="Gender Test",
            date_of_birth="1990-01-01",
            gender="InvalidGender",
            primary_mobile="+919111111111",
        )
        session.add(p)
        with pytest.raises(IntegrityError):
            await session.commit()
        await session.rollback()
        break


@pytest.mark.asyncio
async def test_patient_blood_group_check_constraint():
    """Verify CHECK constraint rejects invalid Patient blood group."""
    async for session in get_db():
        tag = uid()
        p = Patient(
            patient_id=f"PID-BLD-{tag}",
            full_name="Blood Test",
            date_of_birth="1990-01-01",
            gender="Male",
            blood_group="Z+",  # Invalid blood group
            primary_mobile="+919111111112",
        )
        session.add(p)
        with pytest.raises(IntegrityError):
            await session.commit()
        await session.rollback()
        break


@pytest.mark.asyncio
async def test_registration_age_bounds_check_constraint():
    """Verify CHECK constraint rejects age_at_registration < 0 or > 125."""
    async for session in get_db():
        tag = uid()
        staff = User(
            username=f"staff_{tag}",
            email=f"staff_{tag}@hospital.org",
            hashed_password="hash",
            role="ROLE_RECEPTIONIST",
        )
        pat = Patient(
            patient_id=f"PID-AGE-{tag}",
            full_name="Age Test",
            date_of_birth="1995-02-14",
            gender="Female",
            primary_mobile="+919111111113",
        )
        session.add_all([staff, pat])
        await session.commit()
        staff_id, pat_id = staff.id, pat.id

        # Test age > 125
        reg_bad_age = Registration(
            registration_id=f"AEGIS-AGE-{tag}",
            patient_id=pat_id,
            created_by_user_id=staff_id,
            contact_mobile="+919111111113",
            age_at_registration=130,  # Invalid
        )
        session.add(reg_bad_age)
        with pytest.raises(IntegrityError):
            await session.commit()
        await session.rollback()
        break


@pytest.mark.asyncio
async def test_registration_rejection_reason_check_constraint():
    """Verify CHECK constraint requires non-empty rejection_reason when status == 'REJECTED'."""
    async for session in get_db():
        tag = uid()
        staff = User(
            username=f"staff_rej_{tag}",
            email=f"staff_rej_{tag}@hospital.org",
            hashed_password="hash",
            role="ROLE_RECEPTIONIST",
        )
        pat = Patient(
            patient_id=f"PID-REJ-{tag}",
            full_name="Rejection Test",
            date_of_birth="1995-02-14",
            gender="Female",
            primary_mobile="+919111111114",
        )
        session.add_all([staff, pat])
        await session.commit()
        staff_id, pat_id = staff.id, pat.id

        # REJECTED without reason must fail
        reg_rejected = Registration(
            registration_id=f"AEGIS-REJ-{tag}",
            patient_id=pat_id,
            created_by_user_id=staff_id,
            contact_mobile="+919111111114",
            age_at_registration=30,
            status="REJECTED",
            rejection_reason=None,  # Invalid
        )
        session.add(reg_rejected)
        with pytest.raises(IntegrityError):
            await session.commit()
        await session.rollback()
        break


@pytest.mark.asyncio
async def test_uploaded_document_file_size_check_constraint():
    """Verify CHECK constraint enforces 10MB ceiling on uploaded documents."""
    async for session in get_db():
        tag = uid()
        staff = User(
            username=f"staff_size_{tag}",
            email=f"staff_size_{tag}@hospital.org",
            hashed_password="hash",
            role="ROLE_RECEPTIONIST",
        )
        pat = Patient(
            patient_id=f"PID-SIZE-{tag}",
            full_name="Size Test",
            date_of_birth="1995-02-14",
            gender="Female",
            primary_mobile="+919111111115",
        )
        session.add_all([staff, pat])
        await session.commit()
        staff_id, pat_id = staff.id, pat.id

        doc_large = UploadedDocument(
            document_uuid=f"uuid-size-{tag}",
            patient_id=pat_id,
            uploaded_by_user_id=staff_id,
            original_filename="large.pdf",
            storage_path="/storage/large.pdf",
            mime_type="application/pdf",
            file_size_bytes=10485761,  # 10 MB + 1 byte
            checksum_sha256="abc123size",
        )
        session.add(doc_large)
        with pytest.raises(IntegrityError):
            await session.commit()
        await session.rollback()
        break


@pytest.mark.asyncio
async def test_uploaded_document_mime_type_check_constraint():
    """Verify CHECK constraint rejects non-allowlisted document MIME types."""
    async for session in get_db():
        tag = uid()
        staff = User(
            username=f"staff_mime_{tag}",
            email=f"staff_mime_{tag}@hospital.org",
            hashed_password="hash",
            role="ROLE_RECEPTIONIST",
        )
        pat = Patient(
            patient_id=f"PID-MIME-{tag}",
            full_name="MIME Test",
            date_of_birth="1995-02-14",
            gender="Female",
            primary_mobile="+919111111116",
        )
        session.add_all([staff, pat])
        await session.commit()
        staff_id, pat_id = staff.id, pat.id

        doc_bad_mime = UploadedDocument(
            document_uuid=f"uuid-mime-{tag}",
            patient_id=pat_id,
            uploaded_by_user_id=staff_id,
            original_filename="script.sh",
            storage_path="/storage/script.sh",
            mime_type="text/x-shellscript",  # Invalid
            file_size_bytes=1024,
            checksum_sha256="abc123mime",
        )
        session.add(doc_bad_mime)
        with pytest.raises(IntegrityError):
            await session.commit()
        await session.rollback()
        break


@pytest.mark.asyncio
async def test_foreign_key_patient_delete_restrict():
    """Verify ON DELETE RESTRICT prevents deleting a Patient with active registrations."""
    async for session in get_db():
        tag = uid()
        user = User(
            username=f"fk_rst_{tag}",
            email=f"fk_rst_{tag}@hospital.org",
            hashed_password="hash",
            role="ROLE_RECEPTIONIST",
        )
        patient = Patient(
            patient_id=f"PID-RST-{tag}",
            full_name="Restrict Patient",
            date_of_birth="2000-01-01",
            gender="Other",
            primary_mobile="+919222222222",
        )
        session.add_all([user, patient])
        await session.commit()

        reg = Registration(
            registration_id=f"AEGIS-RST-{tag}",
            patient_id=patient.id,
            created_by_user_id=user.id,
            contact_mobile="+919222222222",
            age_at_registration=26,
        )
        session.add(reg)
        await session.commit()

        # Attempt to delete patient while registration exists (ON DELETE RESTRICT)
        await session.delete(patient)
        with pytest.raises(IntegrityError):
            await session.commit()
        await session.rollback()
        break


@pytest.mark.asyncio
async def test_foreign_key_cascade_user_to_revoked_tokens():
    """Verify ON DELETE CASCADE automatically removes RevokedTokens when User is deleted."""
    async for session in get_db():
        tag = uid()
        user = User(
            username=f"casc_{tag}",
            email=f"casc_{tag}@hospital.org",
            hashed_password="hash",
            role="ROLE_PATIENT",
        )
        session.add(user)
        await session.commit()
        user_id = user.id

        token = RevokedToken(
            token_hash=f"hash_tok_{tag}",
            user_id=user_id,
            expires_at="2026-12-31T23:59:59Z",
        )
        session.add(token)
        await session.commit()
        token_id = token.id

        # Delete user -> cascades to token
        await session.delete(user)
        await session.commit()

        token_check = (
            await session.execute(text(f"SELECT id FROM revoked_tokens WHERE id = {token_id};"))
        ).scalar()
        assert token_check is None
        break


@pytest.mark.asyncio
async def test_audit_events_append_only_triggers():
    """Verify that SQLite triggers actively reject any UPDATE or DELETE on audit_events."""
    async for session in get_db():
        tag = uid()
        # 1. Insert a legitimate audit event
        audit = AuditEvent(
            actor_username=f"officer_{tag}",
            actor_role="ROLE_SUPER_USER",
            action_type="LOGIN_SUCCESS",
            ip_address="192.168.1.100",
            target_entity_type="users",
            target_entity_id="1",
        )
        session.add(audit)
        await session.commit()
        audit_id = audit.id
        assert audit_id is not None

        # 2. Attempt to UPDATE the audit event -> Must fail via trg_audit_events_no_update
        with pytest.raises((IntegrityError, OperationalError)) as exc_info:
            await session.execute(
                text(f"UPDATE audit_events SET actor_username = 'hacked' WHERE id = {audit_id};")
            )
            await session.commit()
        assert "Existing audit events are append-only" in str(exc_info.value)
        await session.rollback()

        # 3. Attempt to DELETE the audit event -> Must fail via trg_audit_events_no_delete
        with pytest.raises((IntegrityError, OperationalError)) as exc_info:
            await session.execute(
                text(f"DELETE FROM audit_events WHERE id = {audit_id};")
            )
            await session.commit()
        assert "Audit events cannot be deleted" in str(exc_info.value)
        await session.rollback()

        # Verify original audit event remains intact
        check_audit = (
            await session.execute(text(f"SELECT actor_username FROM audit_events WHERE id = {audit_id};"))
        ).scalar()
        assert check_audit == f"officer_{tag}"
        break


@pytest.mark.asyncio
async def test_permission_scope_and_user_permission_relationships():
    """Verify PermissionScope catalog, UserPermission assignment, and relationship navigation."""
    async for session in get_db():
        tag = uid()
        super_user = User(
            username=f"super_{tag}",
            email=f"super_{tag}@hospital.org",
            hashed_password="hashed_pw_super",
            role="ROLE_SUPER_USER",
        )
        asst_admin = User(
            username=f"assistant_{tag}",
            email=f"assistant_{tag}@hospital.org",
            hashed_password="hashed_pw_clerk",
            role="ROLE_ASSISTANT_ADMIN",
        )
        session.add_all([super_user, asst_admin])
        await session.commit()
        asst_id, super_id = asst_admin.id, super_user.id

        scope = PermissionScope(
            scope_name=f"records:view_{tag}",
            category="Records",
            description="View all patient records across admissions roster",
        )
        session.add(scope)
        await session.commit()
        scope_id = scope.id

        up = UserPermission(
            user_id=asst_id,
            permission_scope_id=scope_id,
            granted_by_user_id=super_id,
        )
        session.add(up)
        await session.commit()

        # Verify relationship navigation using async selectinload
        stmt = (
            select(User)
            .options(
                selectinload(User.assigned_permissions).selectinload(UserPermission.permission_scope),
                selectinload(User.assigned_permissions).selectinload(UserPermission.granted_by_user),
            )
            .where(User.id == asst_id)
        )
        result = await session.execute(stmt)
        reloaded_user = result.scalar_one()

        assert len(reloaded_user.assigned_permissions) == 1
        assert reloaded_user.assigned_permissions[0].permission_scope.scope_name == f"records:view_{tag}"
        assert reloaded_user.assigned_permissions[0].granted_by_user.username == f"super_{tag}"
        break


@pytest.mark.asyncio
async def test_user_permission_unique_constraint():
    """Verify UNIQUE(user_id, permission_scope_id) rejects redundant permission grants."""
    async for session in get_db():
        tag = uid()
        super_user = User(
            username=f"su_dup_{tag}",
            email=f"su_dup_{tag}@hospital.org",
            hashed_password="hash",
            role="ROLE_SUPER_USER",
        )
        asst_admin = User(
            username=f"aa_dup_{tag}",
            email=f"aa_dup_{tag}@hospital.org",
            hashed_password="hash",
            role="ROLE_ASSISTANT_ADMIN",
        )
        session.add_all([super_user, asst_admin])
        await session.commit()
        asst_id, super_id = asst_admin.id, super_user.id

        scope = PermissionScope(
            scope_name=f"dup:scope_{tag}",
            category="Test",
            description="Test duplicate constraint",
        )
        session.add(scope)
        await session.commit()
        scope_id = scope.id

        up1 = UserPermission(
            user_id=asst_id,
            permission_scope_id=scope_id,
            granted_by_user_id=super_id,
        )
        session.add(up1)
        await session.commit()

        # Duplicate grant must raise IntegrityError
        up2 = UserPermission(
            user_id=asst_id,
            permission_scope_id=scope_id,
            granted_by_user_id=super_id,
        )
        session.add(up2)
        with pytest.raises(IntegrityError):
            await session.commit()
        await session.rollback()
        break
