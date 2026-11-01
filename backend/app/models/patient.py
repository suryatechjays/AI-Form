"""Patient master record model for AEGIS clinical demographics."""

from typing import TYPE_CHECKING, List, Optional
from sqlalchemy import CheckConstraint, ForeignKey, Index, Integer, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.registration import Registration
    from app.models.document import UploadedDocument


class Patient(Base):
    """Authoritative clinical master record for a patient."""

    __tablename__ = "patients"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    patient_id: Mapped[str] = mapped_column(String(30), nullable=False, unique=True)
    user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, unique=True
    )
    full_name: Mapped[str] = mapped_column(String(100), nullable=False)
    date_of_birth: Mapped[str] = mapped_column(String(10), nullable=False)  # ISO-8601 Date: YYYY-MM-DD
    gender: Mapped[str] = mapped_column(String(20), nullable=False)
    blood_group: Mapped[str] = mapped_column(
        String(10), nullable=False, server_default=text("'Unknown'")
    )
    primary_mobile: Mapped[str] = mapped_column(String(25), nullable=False)  # ITU-T E.164, NOT unique
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)  # RFC 5322, NOT unique
    street_address: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    state: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    country: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True, server_default=text("'India'")
    )
    postal_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    photo_path: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    photo_checksum_sha256: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    is_active: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("1"))
    created_at: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=text("(STRFTIME('%Y-%m-%dT%H:%M:%SZ', 'now'))")
    )
    updated_at: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=text("(STRFTIME('%Y-%m-%dT%H:%M:%SZ', 'now'))")
    )

    __table_args__ = (
        CheckConstraint(
            "gender IN ('Male', 'Female', 'Other', 'Prefer Not to Say')",
            name="ck_patients_gender",
        ),
        CheckConstraint(
            "blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown')",
            name="ck_patients_blood_group",
        ),
        CheckConstraint("is_active IN (0, 1)", name="ck_patients_is_active"),
        Index("idx_patients_mobile", "primary_mobile"),
        Index("idx_patients_email", "email"),
        Index("idx_patients_name_dob", "full_name", "date_of_birth"),
    )

    # Relationships
    user: Mapped[Optional["User"]] = relationship("User", back_populates="patient")
    registrations: Mapped[List["Registration"]] = relationship("Registration", back_populates="patient")
    uploaded_documents: Mapped[List["UploadedDocument"]] = relationship(
        "UploadedDocument", back_populates="patient"
    )

