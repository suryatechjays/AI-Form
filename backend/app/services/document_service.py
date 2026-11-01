"""Document upload, validation, physical persistence, and storage governance service."""

import asyncio
import hashlib
import logging
import os
from pathlib import Path
from typing import List, Optional, Tuple
import uuid

from fastapi import UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.core.exceptions import (
    DocumentNotFoundException,
    PayloadTooLargeException,
    PatientNotFoundException,
    PermissionDeniedException,
    RegistrationNotFoundException,
    UnsupportedMediaTypeException,
)
from app.models.document import UploadedDocument
from app.models.patient import Patient
from app.models.registration import Registration
from app.models.user import User
from app.services.audit_service import log_audit_event
from app.services.permission_service import check_assistant_admin_scope

logger = logging.getLogger("aegis.document_service")
settings = get_settings()

# Allowed Magic Byte Signatures (BMD-AEGIS-2026 v1.3 Section 3.5 & 7.1)
MAGIC_SIGNATURES = [
    (b"%PDF", "application/pdf", ".pdf"),
    (b"\x89PNG\r\n\x1a\n", "image/png", ".png"),
    (b"\xff\xd8\xff", "image/jpeg", ".jpg"),
]


def detect_file_mime_and_extension(data: bytes) -> Tuple[str, str]:
    """Inspect binary header to detect authentic magic bytes for PDF, PNG, and JPEG."""
    for magic_prefix, mime_type, ext in MAGIC_SIGNATURES:
        if data.startswith(magic_prefix):
            return mime_type, ext
    raise UnsupportedMediaTypeException(
        detail="Invalid file signature. Only PDF, PNG, and JPEG files with authentic magic bytes are permitted.",
        code="INVALID_FILE_SIGNATURE",
    )


def _sync_write_file(target_path: Path, content: bytes) -> None:
    """Synchronous file writing utility."""
    with open(target_path, "wb") as f:
        f.write(content)


def compensating_file_cleanup(storage_path: str) -> None:
    """Compensating rollback: delete physical disk file if database insertion fails."""
    try:
        if os.path.exists(storage_path):
            os.remove(storage_path)
            logger.info("Compensating cleanup: Removed disk file at %s", storage_path)
    except Exception as cleanup_err:
        logger.error("Failed to execute compensating file cleanup on %s: %s", storage_path, cleanup_err)


async def validate_and_save_document(
    db: AsyncSession,
    actor: User,
    file: UploadFile,
    patient_id: int,
    registration_id: Optional[int] = None,
    client_ip: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> UploadedDocument:
    """Validate multipart document, verify magic bytes, store on disk, and create database record."""
    # 1. Verify Patient existence and ownership
    patient_stmt = select(Patient).where(Patient.id == patient_id, Patient.is_active == 1)
    patient = (await db.execute(patient_stmt)).scalar_one_or_none()
    if not patient:
        raise PatientNotFoundException(f"Patient with ID {patient_id} does not exist or is inactive.")

    if actor.role == "ROLE_PATIENT":
        if patient.user_id != actor.id:
            raise PermissionDeniedException(
                detail="Access denied: You can only upload medical documents for your own profile.",
                code="PERMISSION_DENIED",
            )
    elif actor.role == "ROLE_ASSISTANT_ADMIN":
        has_scope = await check_assistant_admin_scope(db, actor.id, "documents:upload_all")
        if not has_scope:
            raise PermissionDeniedException(
                detail="Assistant Administrator lacks required permission scope 'documents:upload_all'.",
                code="SCOPE_PERMISSION_DENIED",
            )

    # 2. Verify Registration linkage if supplied
    if registration_id is not None:
        reg_stmt = select(Registration).where(Registration.id == registration_id)
        reg = (await db.execute(reg_stmt)).scalar_one_or_none()
        if not reg:
            raise RegistrationNotFoundException(f"Registration encounter with ID {registration_id} does not exist.")
        if reg.patient_id != patient.id:
            raise PermissionDeniedException(
                detail="Mismatched registration encounter: target registration does not belong to specified patient.",
                code="INVALID_TARGET_RESOURCE",
            )

    # 3. Read and validate file content
    content = await file.read()
    file_size = len(content)

    if file_size == 0:
        raise UnsupportedMediaTypeException(detail="Uploaded file is empty (0 bytes).")

    if file_size > settings.MAX_FILE_SIZE:
        raise PayloadTooLargeException(
            f"Uploaded file size ({file_size} bytes) exceeds maximum allowable limit of 10 MB ({settings.MAX_FILE_SIZE} bytes)."
        )

    # 4. Verify binary magic bytes
    detected_mime, safe_ext = detect_file_mime_and_extension(content)

    # 5. Compute cryptographic SHA-256 checksum
    checksum_sha256 = hashlib.sha256(content).hexdigest()

    # 6. Physical persistence with UUID filename
    doc_uuid = str(uuid.uuid4())
    stored_filename = f"{doc_uuid}{safe_ext}"
    storage_path = settings.UPLOAD_DIR / stored_filename

    # Ensure upload directory exists
    settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    await asyncio.to_thread(_sync_write_file, storage_path, content)

    # 7. Database Record Creation with Compensating Rollback Protection
    original_name = file.filename or f"document_{doc_uuid[:8]}{safe_ext}"
    # Sanitize original filename (remove path traversal components)
    clean_original_filename = os.path.basename(original_name)[:255]

    uploaded_doc = UploadedDocument(
        document_uuid=doc_uuid,
        patient_id=patient.id,
        registration_id=registration_id,
        uploaded_by_user_id=actor.id,
        original_filename=clean_original_filename,
        storage_path=str(storage_path),
        mime_type=detected_mime,
        file_size_bytes=file_size,
        checksum_sha256=checksum_sha256,
        extraction_engine="None",
        extraction_status="PENDING",
        raw_extracted_text=None,
        ai_extraction_status="PENDING",
        ai_confidence_payload=None,
    )

    db.add(uploaded_doc)
    try:
        await db.flush()
    except Exception as db_err:
        logger.error("Failed to commit document metadata to database: %s", db_err)
        compensating_file_cleanup(str(storage_path))
        raise

    # 8. Audit Event Logging
    await log_audit_event(
        db=db,
        actor_user_id=actor.id,
        actor_username=actor.username,
        actor_role=actor.role,
        action_type="DOCUMENT_UPLOADED",
        target_type="uploaded_documents",
        target_id=str(uploaded_doc.id),
        ip_address=client_ip,
        user_agent=user_agent,
        metadata={
            "document_uuid": doc_uuid,
            "patient_id": patient.patient_id,
            "mime_type": detected_mime,
            "file_size": file_size,
        },
    )

    return uploaded_doc


async def get_document_by_uuid(
    db: AsyncSession,
    actor: User,
    document_uuid: str,
) -> UploadedDocument:
    """Retrieve document by UUID with strict patient and role ownership enforcement."""
    stmt = (
        select(UploadedDocument)
        .options(selectinload(UploadedDocument.patient))
        .where(UploadedDocument.document_uuid == document_uuid)
    )
    result = await db.execute(stmt)
    doc = result.scalar_one_or_none()

    if not doc:
        raise DocumentNotFoundException()

    # Enforce ownership and access restrictions
    if actor.role == "ROLE_PATIENT":
        if not doc.patient or doc.patient.user_id != actor.id:
            raise PermissionDeniedException(
                detail="Access denied: You are not authorized to access documents of another patient.",
                code="PERMISSION_DENIED",
            )
    elif actor.role == "ROLE_ASSISTANT_ADMIN":
        if doc.uploaded_by_user_id != actor.id:
            has_view = await check_assistant_admin_scope(db, actor.id, "records:view_all")
            has_ocr = await check_assistant_admin_scope(db, actor.id, "documents:ocr_extract")
            if not (has_view or has_ocr):
                raise PermissionDeniedException(
                    detail="Assistant Administrator lacks required permission scope 'records:view_all'.",
                    code="SCOPE_PERMISSION_DENIED",
                )

    return doc


async def list_documents(
    db: AsyncSession,
    actor: User,
    patient_id: Optional[int] = None,
    registration_id: Optional[int] = None,
    page: int = 1,
    limit: int = 20,
) -> Tuple[List[UploadedDocument], int]:
    """List documents with pagination and role-based scoping."""
    base_stmt = select(UploadedDocument).options(selectinload(UploadedDocument.patient))

    if actor.role == "ROLE_PATIENT":
        base_stmt = base_stmt.join(Patient, UploadedDocument.patient_id == Patient.id).where(
            Patient.user_id == actor.id
        )
    elif actor.role == "ROLE_ASSISTANT_ADMIN":
        has_scope = await check_assistant_admin_scope(db, actor.id, "records:view_all")
        if not has_scope:
            raise PermissionDeniedException(
                detail="Assistant Administrator lacks required permission scope 'records:view_all'.",
                code="SCOPE_PERMISSION_DENIED",
            )

    if patient_id is not None:
        base_stmt = base_stmt.where(UploadedDocument.patient_id == patient_id)

    if registration_id is not None:
        base_stmt = base_stmt.where(UploadedDocument.registration_id == registration_id)

    count_stmt = select(func.count()).select_from(base_stmt.subquery())
    total_count = (await db.execute(count_stmt)).scalar() or 0

    offset = max(0, (page - 1) * limit)
    paged_stmt = base_stmt.order_by(UploadedDocument.created_at.desc(), UploadedDocument.id.desc()).offset(offset).limit(limit)
    items = list((await db.execute(paged_stmt)).scalars().all())

    return items, total_count

