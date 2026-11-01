"""Pydantic schemas for medical document upload, OCR extraction, and AI processing."""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class DocumentUploadResponse(BaseModel):
    """Metadata response following successful multipart file upload."""
    id: int
    document_uuid: str
    patient_id: int
    registration_id: Optional[int] = None
    uploaded_by_user_id: int
    original_filename: str
    mime_type: str
    file_size_bytes: int
    checksum_sha256: str
    extraction_status: str
    ai_extraction_status: str
    created_at: str

    model_config = {"from_attributes": True}


class DocumentResponse(BaseModel):
    """Detailed document record response."""
    id: int
    document_uuid: str
    patient_id: int
    registration_id: Optional[int] = None
    uploaded_by_user_id: int
    original_filename: str
    mime_type: str
    file_size_bytes: int
    checksum_sha256: str
    extraction_engine: Optional[str] = None
    extraction_status: str
    raw_extracted_text: Optional[str] = None
    ai_extraction_status: str
    ai_confidence_payload: Optional[str] = None
    created_at: str

    model_config = {"from_attributes": True}


class DocumentListResponse(BaseModel):
    """Paginated list response for uploaded documents."""
    items: List[DocumentResponse]
    total: int
    page: int
    limit: int
    total_pages: int


class ExtractedClinicalFields(BaseModel):
    """Structured clinical entities extracted by Groq AI or regex fallback."""
    # Section 1: Demographics (for Patient Master)
    full_name: Optional[str] = None
    first_name: Optional[str] = None
    middle_name: Optional[str] = None
    last_name: Optional[str] = None
    date_of_birth: Optional[str] = None
    gender: Optional[str] = None
    blood_group: Optional[str] = None
    primary_mobile: Optional[str] = None
    email: Optional[str] = None
    street_address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    postal_code: Optional[str] = None

    # Section 2 & 3: Contacts & Emergency
    emergency_contact_name: Optional[str] = None
    emergency_contact_relationship: Optional[str] = None
    emergency_contact_phone: Optional[str] = None

    # Section 4: Medical Information
    existing_conditions: Optional[str] = None
    previous_surgeries: Optional[str] = None
    current_medications: Optional[str] = None
    allergy_status: Optional[str] = None
    allergies_detail: Optional[str] = None
    medical_history: Optional[str] = None
    disability_accommodations: Optional[str] = None

    # Section 5: Insurance Information
    has_insurance: Optional[int] = None
    insurance_provider: Optional[str] = None
    insurance_policy_number: Optional[str] = None
    insurance_policy_holder: Optional[str] = None
    insurance_expiry_date: Optional[str] = None

    # Section 6: Visit Information
    preferred_doctor: Optional[str] = None
    department: Optional[str] = None
    reason_for_visit: Optional[str] = None


class AIExtractionResponse(BaseModel):
    """Response returned upon completing AI extraction for an uploaded document."""
    document_uuid: str
    document_id: int
    extraction_engine: str
    extraction_status: str
    ai_extraction_status: str
    raw_text_length: int
    extracted_fields: ExtractedClinicalFields
    field_confidences: Dict[str, float] = Field(default_factory=dict)
    extraction_source: str = "GROQ_GPT_OSS_20B"
    model_used: str = "openai/gpt-oss-20b"
    low_confidence_fields: List[str] = Field(default_factory=list)


class TextExtractionRequest(BaseModel):
    """Request payload for extracting clinical entities from direct text or spoken voice."""
    text: str = Field(..., min_length=1, max_length=50000, description="Raw clinical text or spoken transcript")


class TextExtractionResponse(BaseModel):
    """Response schema for direct text or conversational voice entity extraction."""
    raw_text_length: int
    extracted_fields: ExtractedClinicalFields
    field_confidences: Dict[str, float] = Field(default_factory=dict)
    extraction_source: str = "GROQ_GPT_OSS_20B"
    model_used: str = "openai/gpt-oss-20b"
    low_confidence_fields: List[str] = Field(default_factory=list)


