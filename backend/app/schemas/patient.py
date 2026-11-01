"""Schemas for patient master records and clinical demographics."""

from typing import List, Optional
from pydantic import BaseModel, Field


class PatientBase(BaseModel):
    """Core patient demographic fields."""
    full_name: str = Field(..., min_length=2, max_length=100, description="Patient legal full name")
    date_of_birth: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$", description="Authoritative DOB (YYYY-MM-DD)")
    gender: str = Field(..., description="Gender: Male, Female, Other, or Prefer Not to Say")
    blood_group: str = Field(default="Unknown", description="Clinical blood group")
    primary_mobile: str = Field(..., min_length=7, max_length=25, description="Primary mobile phone (ITU-T E.164)")
    email: Optional[str] = Field(default=None, max_length=255, description="Contact email address")
    street_address: Optional[str] = Field(default=None, max_length=255, description="Street address")
    city: Optional[str] = Field(default=None, max_length=100, description="City")
    state: Optional[str] = Field(default=None, max_length=100, description="State / Province")
    country: Optional[str] = Field(default="India", max_length=100, description="Country")
    postal_code: Optional[str] = Field(default=None, max_length=20, description="Postal / PIN code")


class PatientCreate(PatientBase):
    """Payload to create a new patient master record."""
    override_duplicate: bool = Field(default=False, description="Flag to force creation despite duplicate warning")
    justification: Optional[str] = Field(
        default=None, max_length=255, description="Mandatory administrative justification if override_duplicate is True"
    )


class PatientUpdate(BaseModel):
    """Payload to update an existing patient record."""
    full_name: Optional[str] = Field(default=None, min_length=2, max_length=100)
    gender: Optional[str] = None
    blood_group: Optional[str] = None
    primary_mobile: Optional[str] = Field(default=None, min_length=7, max_length=25)
    email: Optional[str] = Field(default=None, max_length=255)
    street_address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    postal_code: Optional[str] = None


class PatientResponse(PatientBase):
    """Full patient demographic response."""
    id: int
    patient_id: str = Field(..., description="Permanent business identifier (PID-YYYY-XXXXX)")
    user_id: Optional[int] = Field(default=None, description="Linked portal user account ID, if registered")
    is_active: bool
    photo_path: Optional[str] = None
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}


class PatientListResponse(BaseModel):
    """Paginated collection of patient records."""
    items: List[PatientResponse]
    total: int
    page: int
    limit: int
    total_pages: int

