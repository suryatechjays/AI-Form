"""Registration encounter model capturing 7 clinical intake sections and PDF status."""

from typing import TYPE_CHECKING, List, Optional
from sqlalchemy import CheckConstraint, ForeignKey, Index, Integer, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.patient import Patient
    from app.models.user import User
    from app.models.document import UploadedDocument


class Registration(Base):
    """Encounter-specific intake data across seven approved registration sections."""

    __tablename__ = "registrations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    registration_id: Mapped[str] = mapped_column(String(30), nullable=False, unique=True)
    patient_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("patients.id", ondelete="RESTRICT"), nullable=False
    )
    created_by_user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    submitted_by_user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=True, default=None
    )
    reviewed_by_user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=True, default=None
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default=text("'DRAFT'")
    )
    rejection_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default=None)
    idempotency_key: Mapped[Optional[str]] = mapped_column(
        String(36), nullable=True, unique=True, default=None
    )
    age_at_registration: Mapped[int] = mapped_column(Integer, nullable=False)

    # Section 2: Contact Snapshot
    contact_mobile: Mapped[str] = mapped_column(String(25), nullable=False)
    contact_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    residential_address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Section 3: Emergency Contact
    emergency_contact_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    emergency_contact_relationship: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    emergency_contact_phone: Mapped[Optional[str]] = mapped_column(String(25), nullable=True)

    # Section 4: Medical Information (Clinical Safety Defaults)
    existing_conditions: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=text("'Not Provided'")
    )
    previous_surgeries: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=text("'None Reported'")
    )
    current_medications: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=text("'Not Provided'")
    )
    allergy_status: Mapped[str] = mapped_column(
        String(50), nullable=False, server_default=text("'Not Provided / Unknown'")
    )
    allergies_detail: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    medical_history: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=text("'Not Provided'")
    )
    disability_accommodations: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Section 5: Insurance Information
    has_insurance: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("0")
    )
    insurance_provider: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    insurance_policy_number: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    insurance_policy_holder: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    insurance_expiry_date: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)

    # Section 6: Appointment Information
    preferred_doctor: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    department: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    reason_for_visit: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    preferred_appointment_date: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)

    # Section 7 & Authoritative PDF
    pdf_status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default=text("'PENDING'")
    )
    pdf_path: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    pdf_checksum_sha256: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    pdf_generated_at: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    pdf_error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=text("(STRFTIME('%Y-%m-%dT%H:%M:%SZ', 'now'))")
    )
    updated_at: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=text("(STRFTIME('%Y-%m-%dT%H:%M:%SZ', 'now'))")
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('DRAFT', 'PENDING_REVIEW', 'SUBMITTED', 'REJECTED')",
            name="ck_registrations_status",
        ),
        CheckConstraint(
            "status != 'REJECTED' OR (rejection_reason IS NOT NULL AND LENGTH(TRIM(rejection_reason)) > 0)",
            name="ck_registrations_rejection_reason",
        ),
        CheckConstraint(
            "age_at_registration >= 0 AND age_at_registration <= 125",
            name="ck_registrations_age_bounds",
        ),
        CheckConstraint(
            "allergy_status IN ('Active Allergies Listed', 'No Known Allergies (NKDA)', 'Not Provided / Unknown')",
            name="ck_registrations_allergy_status",
        ),
        CheckConstraint("has_insurance IN (0, 1)", name="ck_registrations_has_insurance"),
        CheckConstraint(
            "pdf_status IN ('PENDING', 'GENERATED', 'FAILED')",
            name="ck_registrations_pdf_status",
        ),
        Index("idx_registrations_patient_id", "patient_id"),
        Index("idx_registrations_status_created", "status", "created_at"),
        Index("idx_registrations_contact_mobile", "contact_mobile"),
        Index("idx_registrations_pdf_status", "pdf_status"),
    )

    # Relationships
    patient: Mapped["Patient"] = relationship("Patient", back_populates="registrations")
    created_by_user: Mapped["User"] = relationship(
        "User", foreign_keys=[created_by_user_id], back_populates="created_registrations"
    )
    submitted_by_user: Mapped[Optional["User"]] = relationship(
        "User", foreign_keys=[submitted_by_user_id], back_populates="submitted_registrations"
    )
    reviewed_by_user: Mapped[Optional["User"]] = relationship(
        "User", foreign_keys=[reviewed_by_user_id], back_populates="reviewed_registrations"
    )
    uploaded_documents: Mapped[List["UploadedDocument"]] = relationship(
        "UploadedDocument", back_populates="registration"
    )

