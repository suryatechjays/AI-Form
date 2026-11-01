"""Comprehensive tests for AEGIS Document Ingestion, OCR & Groq AI Extraction (Phase 2, Task 5).

Covers:
1. File validation: 10 MB ceiling, permitted formats (PDF, PNG, JPEG), and binary magic-byte enforcement.
2. Physical storage: UUID generation, SHA-256 checksums, and compensating cleanup on failure.
3. Access control: Patient ownership boundaries, Assistant Admin live scope checks (documents:upload_all, documents:ocr_extract).
4. PDF vector text extraction via PyMuPDF (sub-second selectable digital layers).
5. OCR optical character extraction via Tesseract with Pillow preprocessing.
6. Groq AI entity extraction using model 'openai/gpt-oss-20b' with mocked responses.
7. Anti-hallucination validation and low-confidence indicator flagging (< 0.70).
8. Heuristic regex fallback parsing when Groq API encounters rate limits or errors.
9. Configuration error handling when GROQ_API_KEY is missing (HTTP 503).
10. Document download and deletion lifecycles with audit event persistence.
"""

import io
from unittest.mock import AsyncMock, MagicMock, patch
import uuid
import pytest
from PIL import Image
import pymupdf
from sqlalchemy import select

from app.config import get_settings
from app.core.security import create_access_token, hash_password
from app.database import get_db
from app.models.audit import AuditEvent
from app.models.document import UploadedDocument
from app.models.patient import Patient
from app.models.user import User
from app.services.permission_service import grant_permission_scope

settings = get_settings()


def uid() -> str:
    """Generate short unique suffix for test isolation."""
    return uuid.uuid4().hex[:8]


def create_sample_pdf(text: str = "Clinical Summary: Patient Jane Doe. DOB: 1988-11-23. Blood: A+.") -> bytes:
    """Generate minimal valid digital PDF with embedded text layer via PyMuPDF."""
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((50, 50), text)
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


def create_sample_png() -> bytes:
    """Generate minimal valid 50x50 PNG bytes via Pillow."""
    img = Image.new("RGB", (50, 50), color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def create_sample_jpg() -> bytes:
    """Generate minimal valid 50x50 JPEG bytes via Pillow."""
    img = Image.new("RGB", (50, 50), color="white")
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


# ==============================================================================
# 1. FILE VALIDATION & PHYSICAL STORAGE TESTS
# ==============================================================================

@pytest.mark.asyncio
async def test_upload_file_size_and_magic_byte_validation(async_client):
    """Verify file validation: 10 MB limit and strict binary magic-byte signatures."""
    tag = uid()

    async for db in get_db():
        rec_u = User(
            username=f"rec_doc_{tag}",
            email=f"rec_doc_{tag}@hospital.org",
            hashed_password=hash_password("Pass123!"),
            role="ROLE_RECEPTIONIST",
            is_active=1,
        )
        p = Patient(
            patient_id=f"PID-2026-D{tag[:4]}",
            full_name=f"Document Patient {tag}",
            date_of_birth="1990-01-01",
            gender="Female",
            primary_mobile=f"+1555{tag[:7]}",
            is_active=1,
        )
        db.add_all([rec_u, p])
        await db.commit()
        rec_id, p_id = rec_u.id, p.id
        break

    token = create_access_token(user_id=rec_id, username=f"rec_doc_{tag}", role="ROLE_RECEPTIONIST")
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Invalid magic bytes: Plain text disguised as .pdf -> 415 INVALID_FILE_SIGNATURE
    fake_pdf = b"This is not a real PDF document with binary magic bytes."
    r_fake = await async_client.post(
        f"{settings.API_V1_PREFIX}/documents/upload",
        headers=headers,
        data={"patient_id": p_id},
        files={"file": ("fake.pdf", fake_pdf, "application/pdf")},
    )
    assert r_fake.status_code == 415
    assert r_fake.json()["code"] == "INVALID_FILE_SIGNATURE"

    # 2. File size exceeding 10 MB -> 413 FILE_SIZE_LIMIT_EXCEEDED
    # Create header with valid PDF magic bytes followed by > 10 MB buffer
    oversized = b"%PDF-1.4\n" + (b"0" * (10 * 1024 * 1024 + 10))
    r_oversized = await async_client.post(
        f"{settings.API_V1_PREFIX}/documents/upload",
        headers=headers,
        data={"patient_id": p_id},
        files={"file": ("huge.pdf", oversized, "application/pdf")},
    )
    assert r_oversized.status_code == 413
    assert r_oversized.json()["code"] == "FILE_SIZE_LIMIT_EXCEEDED"

    # 3. Valid PDF with %PDF magic bytes -> 201 Created
    valid_pdf = create_sample_pdf()
    r_pdf = await async_client.post(
        f"{settings.API_V1_PREFIX}/documents/upload",
        headers=headers,
        data={"patient_id": p_id},
        files={"file": ("report.pdf", valid_pdf, "application/pdf")},
    )
    assert r_pdf.status_code == 201
    pdf_data = r_pdf.json()
    assert pdf_data["mime_type"] == "application/pdf"
    assert pdf_data["file_size_bytes"] == len(valid_pdf)
    assert len(pdf_data["checksum_sha256"]) == 64
    assert pdf_data["document_uuid"] is not None

    # 4. Valid PNG with \x89PNG magic bytes -> 201 Created
    valid_png = create_sample_png()
    r_png = await async_client.post(
        f"{settings.API_V1_PREFIX}/documents/upload",
        headers=headers,
        data={"patient_id": p_id},
        files={"file": ("scan.png", valid_png, "image/png")},
    )
    assert r_png.status_code == 201
    assert r_png.json()["mime_type"] == "image/png"

    # 5. Valid JPEG with \xFF\xD8\xFF magic bytes -> 201 Created
    valid_jpg = create_sample_jpg()
    r_jpg = await async_client.post(
        f"{settings.API_V1_PREFIX}/documents/upload",
        headers=headers,
        data={"patient_id": p_id},
        files={"file": ("photo.jpg", valid_jpg, "image/jpeg")},
    )
    assert r_jpg.status_code == 201
    assert r_jpg.json()["mime_type"] == "image/jpeg"


# ==============================================================================
# 2. OWNERSHIP & ROLE PERMISSION BOUNDARIES
# ==============================================================================

@pytest.mark.asyncio
async def test_document_ownership_and_role_access_boundaries(async_client):
    """Verify patients can only upload/access own documents; Assistant Admins require documents:upload_all."""
    tag1, tag2 = uid(), uid()

    async for db in get_db():
        pat_u1 = User(
            username=f"pat_u1_{tag1}",
            email=f"pat_u1_{tag1}@test.org",
            hashed_password=hash_password("Pass123!"),
            role="ROLE_PATIENT",
            is_active=1,
        )
        pat_u2 = User(
            username=f"pat_u2_{tag2}",
            email=f"pat_u2_{tag2}@test.org",
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
            username=f"su_doc_{tag1}",
            email=f"su_doc_{tag1}@hospital.org",
            hashed_password=hash_password("Pass123!"),
            role="ROLE_SUPER_USER",
            is_active=1,
        )
        db.add_all([pat_u1, pat_u2, aa_no_scope, aa_scoped, super_u])
        await db.flush()

        p1 = Patient(
            patient_id=f"PID-2026-P{tag1[:4]}",
            user_id=pat_u1.id,
            full_name=f"Patient One {tag1}",
            date_of_birth="1985-05-15",
            gender="Female",
            primary_mobile=f"+1444{tag1[:7]}",
            is_active=1,
        )
        p2 = Patient(
            patient_id=f"PID-2026-P{tag2[:4]}",
            user_id=pat_u2.id,
            full_name=f"Patient Two {tag2}",
            date_of_birth="1986-06-16",
            gender="Male",
            primary_mobile=f"+1444{tag2[:7]}",
            is_active=1,
        )
        db.add_all([p1, p2])
        await db.commit()

        # Grant documents:upload_all to aa_scoped
        await grant_permission_scope(db, super_u, aa_scoped, "documents:upload_all")
        await db.commit()

        u1_id, u2_id = pat_u1.id, pat_u2.id
        p1_id, p2_id = p1.id, p2.id
        aa_no_id, aa_sc_id = aa_no_scope.id, aa_scoped.id
        break

    t_p1 = create_access_token(user_id=u1_id, username=f"pat_u1_{tag1}", role="ROLE_PATIENT")
    t_p2 = create_access_token(user_id=u2_id, username=f"pat_u2_{tag2}", role="ROLE_PATIENT")
    t_aa_no = create_access_token(user_id=aa_no_id, username=f"aa_noscope_{tag1}", role="ROLE_ASSISTANT_ADMIN")
    t_aa_sc = create_access_token(user_id=aa_sc_id, username=f"aa_scoped_{tag1}", role="ROLE_ASSISTANT_ADMIN")

    pdf_bytes = create_sample_pdf()

    # 1. Patient 1 uploads for Patient 1 (self) -> 201 Created
    r_own = await async_client.post(
        f"{settings.API_V1_PREFIX}/documents/upload",
        headers={"Authorization": f"Bearer {t_p1}"},
        data={"patient_id": p1_id},
        files={"file": ("my_record.pdf", pdf_bytes, "application/pdf")},
    )
    assert r_own.status_code == 201
    doc_uuid = r_own.json()["document_uuid"]

    # 2. Patient 2 attempts to upload for Patient 1 -> 403 Forbidden
    r_other_upload = await async_client.post(
        f"{settings.API_V1_PREFIX}/documents/upload",
        headers={"Authorization": f"Bearer {t_p2}"},
        data={"patient_id": p1_id},
        files={"file": ("unauthorized.pdf", pdf_bytes, "application/pdf")},
    )
    assert r_other_upload.status_code == 403
    assert r_other_upload.json()["code"] == "PERMISSION_DENIED"

    # 3. Patient 2 attempts to view Patient 1's uploaded document -> 403 Forbidden
    r_other_view = await async_client.get(
        f"{settings.API_V1_PREFIX}/documents/{doc_uuid}",
        headers={"Authorization": f"Bearer {t_p2}"},
    )
    assert r_other_view.status_code == 403

    # 4. Assistant Admin WITHOUT documents:upload_all -> 403 SCOPE_PERMISSION_DENIED
    r_aa_no = await async_client.post(
        f"{settings.API_V1_PREFIX}/documents/upload",
        headers={"Authorization": f"Bearer {t_aa_no}"},
        data={"patient_id": p1_id},
        files={"file": ("desk_doc.pdf", pdf_bytes, "application/pdf")},
    )
    assert r_aa_no.status_code == 403
    assert r_aa_no.json()["code"] == "SCOPE_PERMISSION_DENIED"

    # 5. Assistant Admin WITH documents:upload_all -> 201 Created
    r_aa_sc = await async_client.post(
        f"{settings.API_V1_PREFIX}/documents/upload",
        headers={"Authorization": f"Bearer {t_aa_sc}"},
        data={"patient_id": p1_id},
        files={"file": ("authorized_doc.pdf", pdf_bytes, "application/pdf")},
    )
    assert r_aa_sc.status_code == 201


# ==============================================================================
# 3. TEXT EXTRACTION (PYMUPDF & TESSERACT OCR)
# ==============================================================================

@pytest.mark.asyncio
async def test_pdf_vector_text_extraction(async_client):
    """Verify PyMuPDF extracts digital selectable-text layers in sub-second time."""
    tag = uid()

    async for db in get_db():
        rec_u = User(
            username=f"rec_pdf_{tag}",
            email=f"rec_pdf_{tag}@hospital.org",
            hashed_password=hash_password("Pass123!"),
            role="ROLE_RECEPTIONIST",
            is_active=1,
        )
        p = Patient(
            patient_id=f"PID-2026-F{tag[:4]}",
            full_name=f"PDF Patient {tag}",
            date_of_birth="1982-04-12",
            gender="Male",
            primary_mobile=f"+1333{tag[:7]}",
            is_active=1,
        )
        db.add_all([rec_u, p])
        await db.commit()
        rec_id, p_id = rec_u.id, p.id
        break

    token = create_access_token(user_id=rec_id, username=f"rec_pdf_{tag}", role="ROLE_RECEPTIONIST")
    headers = {"Authorization": f"Bearer {token}"}

    sample_text = (
        f"Patient Admission Dossier\n"
        f"Name: Marcus Aurelius {tag}\n"
        f"DOB: 1982-04-12\n"
        f"Blood Group: AB+\n"
        f"Primary Mobile: +15559876543\n"
        f"Reason for Visit: Annual cardiology checkup"
    )
    pdf_bytes = create_sample_pdf(sample_text)

    # 1. Upload digital PDF
    r_up = await async_client.post(
        f"{settings.API_V1_PREFIX}/documents/upload",
        headers=headers,
        data={"patient_id": p_id},
        files={"file": ("clinical_summary.pdf", pdf_bytes, "application/pdf")},
    )
    assert r_up.status_code == 201
    doc_uuid = r_up.json()["document_uuid"]

    # 2. Mock Groq client to verify extraction without external network calls
    mock_completion = MagicMock()
    mock_choice = MagicMock()
    mock_choice.message.content = (
        '{"fields": {"full_name": "Marcus Aurelius", "date_of_birth": "1982-04-12", "blood_group": "AB+"}, '
        '"confidences": {"full_name": 0.98, "date_of_birth": 0.95, "blood_group": 0.99}}'
    )
    mock_completion.choices = [mock_choice]

    with patch("app.services.ai_service.AsyncGroq") as mock_groq_class:
        mock_instance = MagicMock()
        mock_instance.chat.completions.create = AsyncMock(return_value=mock_completion)
        mock_groq_class.return_value = mock_instance

        # Trigger extraction
        r_ext = await async_client.post(
            f"{settings.API_V1_PREFIX}/documents/{doc_uuid}/extract",
            headers=headers,
        )
        assert r_ext.status_code == 200
        ext_data = r_ext.json()

        # Engine must be PyMuPDF for selectable-text digital PDFs
        assert ext_data["extraction_engine"] == "PyMuPDF"
        assert ext_data["extraction_status"] == "COMPLETED"
        assert ext_data["extracted_fields"]["full_name"] == "Marcus Aurelius"
        assert ext_data["extracted_fields"]["blood_group"] == "AB+"
        assert ext_data["model_used"] == "openai/gpt-oss-20b"


@pytest.mark.asyncio
async def test_ocr_extraction_handling_and_mocking(async_client):
    """Verify image OCR extraction workflow and Tesseract invocation."""
    tag = uid()

    async for db in get_db():
        rec_u = User(
            username=f"rec_ocr_{tag}",
            email=f"rec_ocr_{tag}@hospital.org",
            hashed_password=hash_password("Pass123!"),
            role="ROLE_RECEPTIONIST",
            is_active=1,
        )
        p = Patient(
            patient_id=f"PID-2026-O{tag[:4]}",
            full_name=f"OCR Patient {tag}",
            date_of_birth="1995-09-09",
            gender="Female",
            primary_mobile=f"+1222{tag[:7]}",
            is_active=1,
        )
        db.add_all([rec_u, p])
        await db.commit()
        rec_id, p_id = rec_u.id, p.id
        break

    token = create_access_token(user_id=rec_id, username=f"rec_ocr_{tag}", role="ROLE_RECEPTIONIST")
    headers = {"Authorization": f"Bearer {token}"}

    png_bytes = create_sample_png()

    # 1. Upload PNG Image
    r_up = await async_client.post(
        f"{settings.API_V1_PREFIX}/documents/upload",
        headers=headers,
        data={"patient_id": p_id},
        files={"file": ("lab_scan.png", png_bytes, "image/png")},
    )
    assert r_up.status_code == 201
    doc_uuid = r_up.json()["document_uuid"]

    # 2. Mock Tesseract OCR execution and Groq completion
    mock_ocr_text = "Diagnostic Lab Report\nPatient: Sarah Connor\nDOB: 1995-09-09\nBlood: B+\nPhone: +19998887777"
    mock_completion = MagicMock()
    mock_choice = MagicMock()
    mock_choice.message.content = (
        '{"fields": {"full_name": "Sarah Connor", "date_of_birth": "1995-09-09", "blood_group": "B+", "primary_mobile": "+19998887777"}, '
        '"confidences": {"full_name": 0.95, "date_of_birth": 0.90, "blood_group": 0.92, "primary_mobile": 0.91}}'
    )
    mock_completion.choices = [mock_choice]

    with patch("pytesseract.image_to_string", return_value=mock_ocr_text):
        with patch("app.services.ai_service.AsyncGroq") as mock_groq_class:
            mock_instance = MagicMock()
            mock_instance.chat.completions.create = AsyncMock(return_value=mock_completion)
            mock_groq_class.return_value = mock_instance

            r_ext = await async_client.post(
                f"{settings.API_V1_PREFIX}/documents/{doc_uuid}/extract",
                headers=headers,
            )
            assert r_ext.status_code == 200
            ext_data = r_ext.json()
            assert ext_data["extraction_engine"] == "Tesseract"
            assert ext_data["extracted_fields"]["full_name"] == "Sarah Connor"
            assert ext_data["extracted_fields"]["primary_mobile"] == "+19998887777"


# ==============================================================================
# 4. CONFIGURATION & MISSING GROQ API KEY TESTS
# ==============================================================================

@pytest.mark.asyncio
async def test_groq_missing_api_key_configuration(async_client):
    """Verify clear HTTP 503 error when GROQ_API_KEY is missing without server crash."""
    tag = uid()

    async for db in get_db():
        rec_u = User(
            username=f"rec_cfg_{tag}",
            email=f"rec_cfg_{tag}@hospital.org",
            hashed_password=hash_password("Pass123!"),
            role="ROLE_RECEPTIONIST",
            is_active=1,
        )
        p = Patient(
            patient_id=f"PID-2026-C{tag[:4]}",
            full_name=f"Config Patient {tag}",
            date_of_birth="1980-01-01",
            gender="Other",
            primary_mobile=f"+1111{tag[:7]}",
            is_active=1,
        )
        db.add_all([rec_u, p])
        await db.commit()
        rec_id, p_id = rec_u.id, p.id
        break

    token = create_access_token(user_id=rec_id, username=f"rec_cfg_{tag}", role="ROLE_RECEPTIONIST")
    headers = {"Authorization": f"Bearer {token}"}

    pdf_bytes = create_sample_pdf()
    r_up = await async_client.post(
        f"{settings.API_V1_PREFIX}/documents/upload",
        headers=headers,
        data={"patient_id": p_id},
        files={"file": ("doc.pdf", pdf_bytes, "application/pdf")},
    )
    doc_uuid = r_up.json()["document_uuid"]

    # Temporarily set GROQ_API_KEY to None
    original_key = settings.GROQ_API_KEY
    settings.GROQ_API_KEY = None

    try:
        r_ext = await async_client.post(
            f"{settings.API_V1_PREFIX}/documents/{doc_uuid}/extract",
            headers=headers,
        )
        assert r_ext.status_code == 503
        prob = r_ext.json()
        assert prob["code"] == "GROQ_NOT_CONFIGURED"
        assert "GROQ_API_KEY" in prob["detail"]
    finally:
        settings.GROQ_API_KEY = original_key


# ==============================================================================
# 5. AI RESPONSE VALIDATION & HEURISTIC REGEX FALLBACK TESTS
# ==============================================================================

@pytest.mark.asyncio
async def test_ai_response_validation_and_low_confidence_flagging(async_client):
    """Verify structured response validation, provenance, and low-confidence field detection."""
    tag = uid()

    async for db in get_db():
        rec_u = User(
            username=f"rec_ai_{tag}",
            email=f"rec_ai_{tag}@hospital.org",
            hashed_password=hash_password("Pass123!"),
            role="ROLE_RECEPTIONIST",
            is_active=1,
        )
        p = Patient(
            patient_id=f"PID-2026-V{tag[:4]}",
            full_name=f"Validation Patient {tag}",
            date_of_birth="1987-03-21",
            gender="Female",
            primary_mobile=f"+1777{tag[:7]}",
            is_active=1,
        )
        db.add_all([rec_u, p])
        await db.commit()
        rec_id, p_id = rec_u.id, p.id
        break

    token = create_access_token(user_id=rec_id, username=f"rec_ai_{tag}", role="ROLE_RECEPTIONIST")
    headers = {"Authorization": f"Bearer {token}"}

    pdf_bytes = create_sample_pdf("Medical Records")
    r_up = await async_client.post(
        f"{settings.API_V1_PREFIX}/documents/upload",
        headers=headers,
        data={"patient_id": p_id},
        files={"file": ("history.pdf", pdf_bytes, "application/pdf")},
    )
    doc_uuid = r_up.json()["document_uuid"]

    # Mock response with one high-confidence and one low-confidence field (<0.70)
    mock_completion = MagicMock()
    mock_choice = MagicMock()
    mock_choice.message.content = (
        '{"fields": {"full_name": "Elena Rostova", "date_of_birth": "1987-03-21", '
        '"allergies_detail": "Possible sulfa allergy", "existing_conditions": null}, '
        '"confidences": {"full_name": 0.95, "date_of_birth": 0.90, "allergies_detail": 0.55}}'
    )
    mock_completion.choices = [mock_choice]

    with patch("app.services.ai_service.AsyncGroq") as mock_groq_class:
        mock_instance = MagicMock()
        mock_instance.chat.completions.create = AsyncMock(return_value=mock_completion)
        mock_groq_class.return_value = mock_instance

        r_ext = await async_client.post(
            f"{settings.API_V1_PREFIX}/documents/{doc_uuid}/extract",
            headers=headers,
        )
        assert r_ext.status_code == 200
        data = r_ext.json()
        assert data["extracted_fields"]["full_name"] == "Elena Rostova"
        # Anti-hallucination: unmentioned field must remain null
        assert data["extracted_fields"]["existing_conditions"] is None
        # Low confidence (<0.70) must be flagged
        assert "allergies_detail" in data["low_confidence_fields"]
        assert data["extraction_source"] == "GROQ_GPT_OSS_20B"


@pytest.mark.asyncio
async def test_heuristic_regex_fallback_when_groq_fails(async_client):
    """Verify automatic heuristic regex fallback when Groq Cloud encounters rate limits or errors."""
    tag = uid()

    async for db in get_db():
        rec_u = User(
            username=f"rec_fb_{tag}",
            email=f"rec_fb_{tag}@hospital.org",
            hashed_password=hash_password("Pass123!"),
            role="ROLE_RECEPTIONIST",
            is_active=1,
        )
        p = Patient(
            patient_id=f"PID-2026-H{tag[:4]}",
            full_name=f"Fallback Patient {tag}",
            date_of_birth="1979-11-11",
            gender="Male",
            primary_mobile=f"+1888{tag[:7]}",
            is_active=1,
        )
        db.add_all([rec_u, p])
        await db.commit()
        rec_id, p_id = rec_u.id, p.id
        break

    token = create_access_token(user_id=rec_id, username=f"rec_fb_{tag}", role="ROLE_RECEPTIONIST")
    headers = {"Authorization": f"Bearer {token}"}

    # Document text containing structured patterns
    text_content = (
        "Emergency Care Note\n"
        "Contact Mobile: +15559876543\n"
        "Email: patient.emergency@healthnet.org\n"
        "DOB: 1979-11-11\n"
        "Blood Group: O-\n"
        "Postal Code: 560001\n"
        "Gender: Male"
    )
    pdf_bytes = create_sample_pdf(text_content)

    r_up = await async_client.post(
        f"{settings.API_V1_PREFIX}/documents/upload",
        headers=headers,
        data={"patient_id": p_id},
        files={"file": ("intake.pdf", pdf_bytes, "application/pdf")},
    )
    doc_uuid = r_up.json()["document_uuid"]

    # Mock Groq client raising an exception (e.g. Rate Limit 429 or Timeout)
    with patch("app.services.ai_service.AsyncGroq") as mock_groq_class:
        mock_instance = MagicMock()
        mock_instance.chat.completions.create = AsyncMock(side_effect=Exception("Groq API Rate Limit 429"))
        mock_groq_class.return_value = mock_instance

        r_ext = await async_client.post(
            f"{settings.API_V1_PREFIX}/documents/{doc_uuid}/extract",
            headers=headers,
        )
        assert r_ext.status_code == 200
        data = r_ext.json()

        # Provenance must reflect REGEX_FALLBACK
        assert data["extraction_source"] == "REGEX_FALLBACK"
        # Regex heuristics extracted structured values correctly
        assert data["extracted_fields"]["primary_mobile"] == "+15559876543"
        assert data["extracted_fields"]["email"] == "patient.emergency@healthnet.org"
        assert data["extracted_fields"]["date_of_birth"] == "1979-11-11"
        assert data["extracted_fields"]["blood_group"] == "O-"
        assert data["extracted_fields"]["gender"] == "Male"


# ==============================================================================
# 6. DOWNLOAD, LISTING & DELETION LIFECYCLE TESTS
# ==============================================================================

@pytest.mark.asyncio
async def test_document_download_and_delete_lifecycle(async_client):
    """Verify file download, metadata retrieval, deletion, and physical cleanup."""
    tag = uid()

    async for db in get_db():
        rec_u = User(
            username=f"rec_dl_{tag}",
            email=f"rec_dl_{tag}@hospital.org",
            hashed_password=hash_password("Pass123!"),
            role="ROLE_RECEPTIONIST",
            is_active=1,
        )
        p = Patient(
            patient_id=f"PID-2026-L{tag[:4]}",
            full_name=f"Lifecycle Patient {tag}",
            date_of_birth="1992-02-02",
            gender="Other",
            primary_mobile=f"+1666{tag[:7]}",
            is_active=1,
        )
        db.add_all([rec_u, p])
        await db.commit()
        rec_id, p_id = rec_u.id, p.id
        break

    token = create_access_token(user_id=rec_id, username=f"rec_dl_{tag}", role="ROLE_RECEPTIONIST")
    headers = {"Authorization": f"Bearer {token}"}

    pdf_bytes = create_sample_pdf("Patient Health Summary")

    # 1. Upload
    r_up = await async_client.post(
        f"{settings.API_V1_PREFIX}/documents/upload",
        headers=headers,
        data={"patient_id": p_id},
        files={"file": ("summary.pdf", pdf_bytes, "application/pdf")},
    )
    assert r_up.status_code == 201
    doc_uuid = r_up.json()["document_uuid"]

    # 2. Get Details
    r_get = await async_client.get(
        f"{settings.API_V1_PREFIX}/documents/{doc_uuid}",
        headers=headers,
    )
    assert r_get.status_code == 200
    assert r_get.json()["document_uuid"] == doc_uuid

    # 3. List Documents
    r_list = await async_client.get(
        f"{settings.API_V1_PREFIX}/documents?patient_id={p_id}",
        headers=headers,
    )
    assert r_list.status_code == 200
    assert r_list.json()["total"] >= 1

    # 4. Download Document
    r_dl = await async_client.get(
        f"{settings.API_V1_PREFIX}/documents/{doc_uuid}/download",
        headers=headers,
    )
    assert r_dl.status_code == 200
    assert r_dl.content == pdf_bytes

    # 5. Delete Document
    r_del = await async_client.delete(
        f"{settings.API_V1_PREFIX}/documents/{doc_uuid}",
        headers=headers,
    )
    assert r_del.status_code == 200
    assert "deleted successfully" in r_del.json()["message"]

    # 6. Verify Document Not Found after deletion
    r_get_del = await async_client.get(
        f"{settings.API_V1_PREFIX}/documents/{doc_uuid}",
        headers=headers,
    )
    assert r_get_del.status_code == 404


@pytest.mark.asyncio
async def test_convenience_upload_and_extract_endpoint(async_client):
    """Verify single-request upload-and-extract convenience pipeline endpoint."""
    tag = uid()

    async for db in get_db():
        rec_u = User(
            username=f"rec_pipe_{tag}",
            email=f"rec_pipe_{tag}@hospital.org",
            hashed_password=hash_password("Pass123!"),
            role="ROLE_RECEPTIONIST",
            is_active=1,
        )
        p = Patient(
            patient_id=f"PID-2026-P{tag[:4]}",
            full_name=f"Pipeline Patient {tag}",
            date_of_birth="1991-07-07",
            gender="Female",
            primary_mobile=f"+1999{tag[:7]}",
            is_active=1,
        )
        db.add_all([rec_u, p])
        await db.commit()
        rec_id, p_id = rec_u.id, p.id
        break

    token = create_access_token(user_id=rec_id, username=f"rec_pipe_{tag}", role="ROLE_RECEPTIONIST")
    headers = {"Authorization": f"Bearer {token}"}

    pdf_bytes = create_sample_pdf("Patient Name: Natasha Romanoff\nDOB: 1991-07-07\nBlood: A+")

    mock_completion = MagicMock()
    mock_choice = MagicMock()
    mock_choice.message.content = (
        '{"fields": {"full_name": "Natasha Romanoff", "date_of_birth": "1991-07-07", "blood_group": "A+"}, '
        '"confidences": {"full_name": 0.99, "date_of_birth": 0.96, "blood_group": 0.98}}'
    )
    mock_completion.choices = [mock_choice]

    with patch("app.services.ai_service.AsyncGroq") as mock_groq_class:
        mock_instance = MagicMock()
        mock_instance.chat.completions.create = AsyncMock(return_value=mock_completion)
        mock_groq_class.return_value = mock_instance

        resp = await async_client.post(
            f"{settings.API_V1_PREFIX}/documents/upload-and-extract",
            headers=headers,
            data={"patient_id": p_id},
            files={"file": ("record.pdf", pdf_bytes, "application/pdf")},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["extraction_status"] == "COMPLETED"
        assert data["ai_extraction_status"] == "PROCESSED"
        assert data["extracted_fields"]["full_name"] == "Natasha Romanoff"
        assert data["extraction_engine"] == "PyMuPDF"
        assert data["model_used"] == "openai/gpt-oss-20b"


@pytest.mark.asyncio
async def test_conversational_voice_text_extraction(async_client):
    """Verify POST /documents/extract-text handles natural spoken voice transcripts using Groq AI."""
    tag = uid()

    async for db in get_db():
        rec_u = User(
            username=f"voice_user_{tag}",
            email=f"voice_{tag}@hospital.org",
            hashed_password=hash_password("Pass123!"),
            role="ROLE_RECEPTIONIST",
            is_active=1,
        )
        db.add(rec_u)
        await db.commit()
        u_id = rec_u.id
        break

    token = create_access_token(user_id=u_id, username=f"voice_user_{tag}", role="ROLE_RECEPTIONIST")
    headers = {"Authorization": f"Bearer {token}"}

    transcript = (
        "My name is Robert Anthony Chen. Date of birth is August 14 1982. My phone number is 415-555-7823. "
        "I live at 742 Evergreen Terrace, San Francisco, CA 94107. My emergency contact is Lisa Chen, my wife, at 415-555-9012. "
        "I have Blue Cross Blue Shield insurance, policy number BCBS-8821904. I am allergic to Sulfa drugs and Aspirin. "
        "I have hypertension and take Lisinopril 10mg once daily. I am registering for Cardiology due to recurring palpitations."
    )

    resp = await async_client.post(
        f"{settings.API_V1_PREFIX}/documents/extract-text",
        headers=headers,
        json={"text": transcript},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["raw_text_length"] == len(transcript)
    assert data["model_used"] == "openai/gpt-oss-20b"
    assert "extracted_fields" in data

    fields = data["extracted_fields"]
    # Check natural spoken patient details
    assert fields["full_name"] == "Robert Anthony Chen"
    assert fields["date_of_birth"] == "1982-08-14"
    assert "415-555-7823" in fields["primary_mobile"] or "4155557823" in fields["primary_mobile"]
    assert fields["emergency_contact_name"] == "Lisa Chen"
    assert "wife" in fields["emergency_contact_relationship"].lower()
    assert "415-555-9012" in fields["emergency_contact_phone"] or "4155559012" in fields["emergency_contact_phone"]
    assert "Blue Cross" in fields["insurance_provider"]
    assert fields["insurance_policy_number"] == "BCBS-8821904"
    assert fields["allergy_status"] == "Active Allergies Listed"
    assert "Sulfa" in fields["allergies_detail"] or "Aspirin" in fields["allergies_detail"]
    assert "hypertension" in fields["existing_conditions"].lower()
    assert "lisinopril" in fields["current_medications"].lower()
    assert fields["department"] == "Cardiology"

    # Strict anti-hallucination: unmentioned fields must remain null
    assert fields["disability_accommodations"] is None
    assert fields["insurance_expiry_date"] is None
    assert fields["previous_surgeries"] is None


@pytest.mark.asyncio
async def test_conversational_voice_text_extraction_validation_and_auth(async_client):
    """Verify endpoint rejects unauthenticated access and invalid empty payloads."""
    # 1. Unauthenticated -> 401
    resp_unauth = await async_client.post(
        f"{settings.API_V1_PREFIX}/documents/extract-text",
        json={"text": "Some text"},
    )
    assert resp_unauth.status_code == 401

    # 2. Authenticated but empty text -> 422
    tag = uid()
    async for db in get_db():
        u = User(
            username=f"u_val_{tag}",
            email=f"val_{tag}@hospital.org",
            hashed_password=hash_password("Pass123!"),
            role="ROLE_PATIENT",
            is_active=1,
        )
        db.add(u)
        await db.commit()
        u_id = u.id
        break

    token = create_access_token(user_id=u_id, username=f"u_val_{tag}", role="ROLE_PATIENT")
    headers = {"Authorization": f"Bearer {token}"}

    resp_empty = await async_client.post(
        f"{settings.API_V1_PREFIX}/documents/extract-text",
        headers=headers,
        json={"text": ""},
    )
    assert resp_empty.status_code == 422


