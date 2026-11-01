"""UploadedDocument model for file metadata, optical extraction, and AI parsing."""

from typing import TYPE_CHECKING, Optional
from sqlalchemy import CheckConstraint, ForeignKey, Index, Integer, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.patient import Patient
    from app.models.registration import Registration
    from app.models.user import User


class UploadedDocument(Base):
    """Stores metadata, file checksums, physical paths, and extraction statuses for clinical files."""

    __tablename__ = "uploaded_documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    document_uuid: Mapped[str] = mapped_column(String(36), nullable=False, unique=True)
    patient_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("patients.id", ondelete="RESTRICT"), nullable=False
    )
    registration_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("registrations.id", ondelete="SET NULL"), nullable=True, default=None
    )
    uploaded_by_user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_path: Mapped[str] = mapped_column(Text, nullable=False)
    mime_type: Mapped[str] = mapped_column(String(50), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    checksum_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    extraction_engine: Mapped[Optional[str]] = mapped_column(
        String(30), nullable=True, server_default=text("'None'")
    )
    extraction_status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default=text("'PENDING'")
    )
    raw_extracted_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ai_extraction_status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default=text("'PENDING'")
    )
    ai_confidence_payload: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=text("(STRFTIME('%Y-%m-%dT%H:%M:%SZ', 'now'))")
    )

    __table_args__ = (
        CheckConstraint(
            "mime_type IN ('application/pdf', 'image/jpeg', 'image/png')",
            name="ck_uploaded_documents_mime_type",
        ),
        CheckConstraint(
            "file_size_bytes > 0 AND file_size_bytes <= 10485760",
            name="ck_uploaded_documents_file_size",
        ),
        CheckConstraint(
            "extraction_engine IN ('PyMuPDF', 'Tesseract', 'HeuristicFallback', 'None')",
            name="ck_uploaded_documents_extraction_engine",
        ),
        CheckConstraint(
            "extraction_status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')",
            name="ck_uploaded_documents_extraction_status",
        ),
        CheckConstraint(
            "ai_extraction_status IN ('PENDING', 'PROCESSED', 'FAILED', 'BYPASSED')",
            name="ck_uploaded_documents_ai_extraction_status",
        ),
        Index("idx_documents_patient_id", "patient_id"),
        Index("idx_documents_registration_id", "registration_id"),
    )

    # Relationships
    patient: Mapped["Patient"] = relationship("Patient", back_populates="uploaded_documents")
    registration: Mapped[Optional["Registration"]] = relationship(
        "Registration", back_populates="uploaded_documents"
    )
    uploaded_by_user: Mapped["User"] = relationship(
        "User", foreign_keys=[uploaded_by_user_id], back_populates="uploaded_documents"
    )

