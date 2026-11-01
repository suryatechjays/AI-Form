"""Document upload, OCR text extraction, and Groq AI entity parsing endpoints."""

import json
import math
import os
from typing import Optional
from fastapi import APIRouter, Depends, File, Form, Query, Request, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user
from app.config import get_settings
from app.core.exceptions import (
    DocumentExtractionException,
    DocumentNotFoundException,
    PermissionDeniedException,
)
from app.database import get_db
from app.models.user import User
from app.schemas.auth import MessageResponse
from app.schemas.document import (
    AIExtractionResponse,
    DocumentListResponse,
    DocumentResponse,
    DocumentUploadResponse,
    TextExtractionRequest,
    TextExtractionResponse,
)
from app.services.ai_service import extract_entities_with_groq
from app.services.audit_service import log_audit_event
from app.services.document_service import (
    compensating_file_cleanup,
    get_document_by_uuid,
    list_documents,
    validate_and_save_document,
)
from app.services.extraction_service import extract_document_text
from app.services.permission_service import check_assistant_admin_scope

router = APIRouter(prefix="/documents", tags=["Document Ingestion & AI Extraction"])
settings = get_settings()


@router.post(
    "/upload",
    response_model=DocumentUploadResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload Medical Document",
    description="Validates and securely persists an uploaded PDF or image (PNG/JPG) up to 10 MB with magic byte verification.",
)
async def upload_document(
    request: Request,
    file: UploadFile = File(..., description="Document file (PDF, PNG, JPG/JPEG up to 10 MB)"),
    patient_id: int = Form(..., description="Surrogate ID of the associated patient"),
    registration_id: Optional[int] = Form(None, description="Optional registration encounter ID"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DocumentUploadResponse:
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("User-Agent")

    doc = await validate_and_save_document(
        db=db,
        actor=current_user,
        file=file,
        patient_id=patient_id,
        registration_id=registration_id,
        client_ip=client_ip,
        user_agent=user_agent,
    )
    await db.commit()
    await db.refresh(doc)
    return DocumentUploadResponse.model_validate(doc, from_attributes=True)


@router.post(
    "/{document_uuid}/extract",
    response_model=AIExtractionResponse,
    status_code=status.HTTP_200_OK,
    summary="Trigger OCR & Groq AI Field Extraction",
    description="Extracts raw text via PyMuPDF/Tesseract OCR and dispatches to Groq Cloud (openai/gpt-oss-20b) for structured clinical parsing.",
)
async def extract_document_entities(
    document_uuid: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AIExtractionResponse:
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("User-Agent")

    doc = await get_document_by_uuid(db, current_user, document_uuid)

    # Permission check for Assistant Admin
    if current_user.role == "ROLE_ASSISTANT_ADMIN" and doc.uploaded_by_user_id != current_user.id:
        has_scope = await check_assistant_admin_scope(db, current_user.id, "documents:ocr_extract")
        if not has_scope:
            raise PermissionDeniedException(
                detail="Assistant Administrator lacks required permission scope 'documents:ocr_extract'.",
                code="SCOPE_PERMISSION_DENIED",
            )

    # Step 1: Execute Text Extraction (PyMuPDF or Tesseract OCR)
    raw_text, engine = await extract_document_text(doc.storage_path, doc.mime_type)
    doc.raw_extracted_text = raw_text
    doc.extraction_engine = engine
    doc.extraction_status = "COMPLETED"

    # Step 2: Execute Groq AI Clinical Entity Parsing
    validated_fields, confidences, source, low_conf = await extract_entities_with_groq(
        raw_text=raw_text,
        settings=settings,
    )

    doc.ai_extraction_status = "PROCESSED"
    doc.ai_confidence_payload = json.dumps({"confidences": confidences, "source": source})

    await db.flush()

    # Step 3: Log Audit Event
    await log_audit_event(
        db=db,
        actor_user_id=current_user.id,
        actor_username=current_user.username,
        actor_role=current_user.role,
        action_type="DOCUMENT_AI_EXTRACTED",
        target_type="uploaded_documents",
        target_id=str(doc.id),
        ip_address=client_ip,
        user_agent=user_agent,
        metadata={
            "document_uuid": doc.document_uuid,
            "engine": engine,
            "extraction_source": source,
            "fields_count": sum(1 for v in validated_fields.model_dump().values() if v is not None),
        },
    )
    await db.commit()

    return AIExtractionResponse(
        document_uuid=doc.document_uuid,
        document_id=doc.id,
        extraction_engine=engine,
        extraction_status=doc.extraction_status,
        ai_extraction_status=doc.ai_extraction_status,
        raw_text_length=len(raw_text),
        extracted_fields=validated_fields,
        field_confidences=confidences,
        extraction_source=source,
        model_used=settings.GROQ_MODEL,
        low_confidence_fields=low_conf,
    )


@router.post(
    "/upload-and-extract",
    response_model=AIExtractionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload Document and Extract in Single Request",
    description="Convenience pipeline: uploads file, executes vector/OCR extraction, and orchestrates Groq AI field extraction.",
)
async def upload_and_extract_document(
    request: Request,
    file: UploadFile = File(..., description="Document file (PDF, PNG, JPG/JPEG up to 10 MB)"),
    patient_id: int = Form(..., description="Surrogate ID of the associated patient"),
    registration_id: Optional[int] = Form(None, description="Optional registration encounter ID"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AIExtractionResponse:
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("User-Agent")

    # 1. Upload & Validate
    doc = await validate_and_save_document(
        db=db,
        actor=current_user,
        file=file,
        patient_id=patient_id,
        registration_id=registration_id,
        client_ip=client_ip,
        user_agent=user_agent,
    )

    # 2. Text Extraction
    raw_text, engine = await extract_document_text(doc.storage_path, doc.mime_type)
    doc.raw_extracted_text = raw_text
    doc.extraction_engine = engine
    doc.extraction_status = "COMPLETED"

    # 3. AI Field Extraction
    validated_fields, confidences, source, low_conf = await extract_entities_with_groq(
        raw_text=raw_text,
        settings=settings,
    )

    doc.ai_extraction_status = "PROCESSED"
    doc.ai_confidence_payload = json.dumps({"confidences": confidences, "source": source})

    await db.flush()

    await log_audit_event(
        db=db,
        actor_user_id=current_user.id,
        actor_username=current_user.username,
        actor_role=current_user.role,
        action_type="DOCUMENT_AI_EXTRACTED",
        target_type="uploaded_documents",
        target_id=str(doc.id),
        ip_address=client_ip,
        user_agent=user_agent,
        metadata={
            "document_uuid": doc.document_uuid,
            "engine": engine,
            "extraction_source": source,
        },
    )
    await db.commit()

    return AIExtractionResponse(
        document_uuid=doc.document_uuid,
        document_id=doc.id,
        extraction_engine=engine,
        extraction_status=doc.extraction_status,
        ai_extraction_status=doc.ai_extraction_status,
        raw_text_length=len(raw_text),
        extracted_fields=validated_fields,
        field_confidences=confidences,
        extraction_source=source,
        model_used=settings.GROQ_MODEL,
        low_confidence_fields=low_conf,
    )


@router.post(
    "/extract-text",
    response_model=TextExtractionResponse,
    status_code=status.HTTP_200_OK,
    summary="Extract Clinical Entities from Raw Text / Spoken Voice",
    description="Parses unstructured clinical text or speech transcripts using Groq Cloud AI with strict anti-hallucination validation.",
)
async def extract_text_entities(
    payload: TextExtractionRequest,
    current_user: User = Depends(get_current_user),
) -> TextExtractionResponse:
    validated_fields, confidences, source, low_conf = await extract_entities_with_groq(
        raw_text=payload.text,
        settings=settings,
    )
    return TextExtractionResponse(
        raw_text_length=len(payload.text),
        extracted_fields=validated_fields,
        field_confidences=confidences,
        extraction_source=source,
        model_used=settings.GROQ_MODEL,
        low_confidence_fields=low_conf,
    )



@router.get(
    "/{document_uuid}",
    response_model=DocumentResponse,
    status_code=status.HTTP_200_OK,
    summary="Get Document Details",
    description="Retrieves metadata, checksums, and extraction status for an uploaded document.",
)
async def get_document(
    document_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DocumentResponse:
    doc = await get_document_by_uuid(db, current_user, document_uuid)
    return DocumentResponse.model_validate(doc, from_attributes=True)


@router.get(
    "",
    response_model=DocumentListResponse,
    status_code=status.HTTP_200_OK,
    summary="List Uploaded Documents",
    description="Lists documents with pagination and role-based scoping (patients see only their own documents).",
)
async def list_patient_documents(
    patient_id: Optional[int] = Query(None, description="Filter by patient surrogate ID"),
    registration_id: Optional[int] = Query(None, description="Filter by registration ID"),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DocumentListResponse:
    items, total = await list_documents(
        db=db,
        actor=current_user,
        patient_id=patient_id,
        registration_id=registration_id,
        page=page,
        limit=limit,
    )
    total_pages = math.ceil(total / limit) if total > 0 else 0
    item_responses = [DocumentResponse.model_validate(d, from_attributes=True) for d in items]

    return DocumentListResponse(
        items=item_responses,
        total=total,
        page=page,
        limit=limit,
        total_pages=total_pages,
    )


@router.get(
    "/{document_uuid}/download",
    status_code=status.HTTP_200_OK,
    summary="Download Original Document File",
    description="Downloads the binary file from local storage with ownership and access validation.",
)
async def download_document(
    document_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    doc = await get_document_by_uuid(db, current_user, document_uuid)

    if not os.path.exists(doc.storage_path):
        raise DocumentNotFoundException("Document file no longer exists on physical storage volume.")

    return FileResponse(
        path=doc.storage_path,
        media_type=doc.mime_type,
        filename=doc.original_filename,
    )


@router.delete(
    "/{document_uuid}",
    response_model=MessageResponse,
    status_code=status.HTTP_200_OK,
    summary="Delete Document",
    description="Removes document record from database and cleans up physical file from storage volume.",
)
async def delete_document(
    document_uuid: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("User-Agent")

    doc = await get_document_by_uuid(db, current_user, document_uuid)

    storage_path = doc.storage_path
    doc_id = doc.id

    await db.delete(doc)
    await db.commit()

    # Clean up physical file
    compensating_file_cleanup(storage_path)

    await log_audit_event(
        db=db,
        actor_user_id=current_user.id,
        actor_username=current_user.username,
        actor_role=current_user.role,
        action_type="DOCUMENT_DELETED",
        target_type="uploaded_documents",
        target_id=str(doc_id),
        ip_address=client_ip,
        user_agent=user_agent,
        metadata={"document_uuid": document_uuid},
    )
    await db.commit()

    return MessageResponse(message="Document and physical file deleted successfully.")
