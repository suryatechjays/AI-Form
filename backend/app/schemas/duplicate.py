"""Schemas for duplicate patient detection and resolution workflows."""

from typing import List, Optional
from pydantic import BaseModel, Field


class DuplicateMatch(BaseModel):
    """Demographic match details returned on duplicate detection (PHI-safe)."""
    matched_patient_id: str = Field(..., description="Business ID of matching patient master record")
    matched_field: str = Field(..., description="Field on which similarity occurred: mobile, email, or composite_name_dob")
    match_type: str = Field(..., description="Type of match: EXACT or COMPOSITE")


class DuplicateCheckResponse(BaseModel):
    """Duplicate pre-commit check response."""
    is_duplicate: bool
    matches: List[DuplicateMatch] = Field(default_factory=list)
    warning_message: Optional[str] = None


class DuplicateOverrideRequest(BaseModel):
    """Payload to override duplicate warning and force creation of new patient."""
    registration_id: str = Field(..., description="Business registration ID")
    justification: str = Field(
        ...,
        min_length=5,
        max_length=255,
        description="Mandatory concise administrative explanation for duplicate override",
    )


class DuplicateLinkRequest(BaseModel):
    """Payload to link an intake registration to an existing patient master record."""
    registration_id: str = Field(..., description="Business registration ID")
    existing_patient_id: str = Field(..., description="Target permanent patient business ID (PID-YYYY-XXXXX)")

