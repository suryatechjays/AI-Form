"""Schemas for clinical intake registrations across seven approved sections."""

from typing import Any, List, Optional
from pydantic import BaseModel, Field, model_validator

from app.schemas.patient import PatientCreate, PatientResponse


class RegistrationBase(BaseModel):
    """Base fields across the registration intake dossier."""
    # Section 2: Contact Snapshot
    contact_mobile: Optional[str] = Field(default=None, max_length=25, description="Encounter contact mobile (E.164)")
    contact_email: Optional[str] = Field(default=None, max_length=255, description="Encounter contact email")
    residential_address: Optional[str] = Field(default=None, description="Current residential address")

    # Section 3: Emergency Contact
    emergency_contact_name: Optional[str] = Field(default=None, max_length=100)
    emergency_contact_relationship: Optional[str] = Field(default=None, max_length=50)
    emergency_contact_phone: Optional[str] = Field(default=None, max_length=25)

    # Section 4: Medical Information (Clinical Safety Defaults)
    existing_conditions: str = Field(default="Not Provided", description="Chronic conditions snapshot")
    previous_surgeries: str = Field(default="None Reported", description="Surgical history snapshot")
    current_medications: str = Field(default="Not Provided", description="Active prescriptions snapshot")
    allergy_status: str = Field(
        default="Not Provided / Unknown",
        description="Allergy tri-state: 'Active Allergies Listed', 'No Known Allergies (NKDA)', 'Not Provided / Unknown'",
    )
    allergies_detail: Optional[str] = Field(default=None, description="Details if Active Allergies Listed")
    medical_history: str = Field(default="Not Provided", description="General medical background")
    disability_accommodations: Optional[str] = Field(default=None, description="Accommodation requests")

    # Section 5: Insurance Information
    has_insurance: int = Field(default=0, ge=0, le=1)
    insurance_provider: Optional[str] = Field(default=None, max_length=100)
    insurance_policy_number: Optional[str] = Field(default=None, max_length=50)
    insurance_policy_holder: Optional[str] = Field(default=None, max_length=100)
    insurance_expiry_date: Optional[str] = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")

    # Section 6: Appointment Information
    preferred_doctor: Optional[str] = Field(default=None, max_length=100)
    department: Optional[str] = Field(default=None, max_length=100)
    reason_for_visit: Optional[str] = Field(default=None, max_length=500)
    preferred_appointment_date: Optional[str] = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")


class RegistrationDraftCreate(RegistrationBase):
    """Payload to instantiate a new intake encounter in DRAFT status."""
    patient_id: Optional[int] = Field(
        default=None, description="Internal patient surrogate ID. Required for desk intake; auto-resolved for portal patients."
    )
    patient_data: Optional[PatientCreate] = Field(
        default=None, description="Demographic profile to atomically provision/link for self-registering portal patients."
    )


class RegistrationUpdate(BaseModel):
    """Payload to update an editable intake encounter while in DRAFT status."""
    contact_mobile: Optional[str] = None
    contact_email: Optional[str] = None
    residential_address: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_relationship: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    existing_conditions: Optional[str] = None
    previous_surgeries: Optional[str] = None
    current_medications: Optional[str] = None
    allergy_status: Optional[str] = None
    allergies_detail: Optional[str] = None
    medical_history: Optional[str] = None
    disability_accommodations: Optional[str] = None
    has_insurance: Optional[int] = Field(default=None, ge=0, le=1)
    insurance_provider: Optional[str] = None
    insurance_policy_number: Optional[str] = None
    insurance_policy_holder: Optional[str] = None
    insurance_expiry_date: Optional[str] = None
    preferred_doctor: Optional[str] = None
    department: Optional[str] = None
    reason_for_visit: Optional[str] = None
    preferred_appointment_date: Optional[str] = None


class RegistrationReviewRequest(BaseModel):
    """Payload for staff clinical review: approve or reject."""
    action: str = Field(..., pattern=r"^(APPROVE|REJECT)$", description="'APPROVE' or 'REJECT'")
    rejection_reason: Optional[str] = Field(
        default=None,
        max_length=255,
        description="Mandatory concise administrative reason if action == 'REJECT'",
    )


class RegistrationResponse(RegistrationBase):
    """Full registration dossier representation."""
    id: int
    registration_id: str = Field(..., description="Business identifier (AEGIS-YYYY-XXXXX)")
    patient_id: int
    patient: Optional[PatientResponse] = Field(default=None, description="Linked patient demographic dossier")
    created_by_user_id: int
    submitted_by_user_id: Optional[int] = None
    reviewed_by_user_id: Optional[int] = None
    status: str
    rejection_reason: Optional[str] = None
    idempotency_key: Optional[str] = None
    age_at_registration: int
    pdf_status: str
    pdf_path: Optional[str] = None
    pdf_checksum_sha256: Optional[str] = None
    pdf_generated_at: Optional[str] = None
    pdf_error_message: Optional[str] = None
    can_regenerate: bool = Field(default=False, description="True if submitted dossier can be recompiled")
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def handle_unloaded_patient(cls, data: Any) -> Any:
        if hasattr(data, "__table__"):
            from sqlalchemy import inspect
            from sqlalchemy.orm.base import LoaderCallableStatus
            ins = inspect(data)
            if "patient" in ins.unloaded or ins.attrs.patient.loaded_value is LoaderCallableStatus.NO_VALUE:
                d = {c.key: getattr(data, c.key) for c in ins.mapper.column_attrs}
                d["patient"] = None
                return d
        return data

    @model_validator(mode="after")
    def compute_can_regenerate(self) -> "RegistrationResponse":
        self.can_regenerate = bool(self.status == "SUBMITTED" and self.pdf_status in ("FAILED", "PENDING"))
        return self


class RegistrationListResponse(BaseModel):
    """Paginated collection of registration records."""
    items: List[RegistrationResponse]
    total: int
    page: int
    limit: int
    total_pages: int

