"""User and RevokedToken models for AEGIS authentication and RBAC."""

from typing import TYPE_CHECKING, List, Optional
from sqlalchemy import CheckConstraint, ForeignKey, Index, Integer, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.patient import Patient
    from app.models.registration import Registration
    from app.models.document import UploadedDocument
    from app.models.permission import UserPermission
    from app.models.audit import AuditEvent


class User(Base):
    """User account model governing credentials, roles, and deactivation states."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(50), nullable=False)
    is_active: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("1"))
    created_at: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=text("(STRFTIME('%Y-%m-%dT%H:%M:%SZ', 'now'))")
    )
    updated_at: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=text("(STRFTIME('%Y-%m-%dT%H:%M:%SZ', 'now'))")
    )
    last_login_at: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default=None)

    __table_args__ = (
        CheckConstraint(
            "role IN ('ROLE_PATIENT', 'ROLE_RECEPTIONIST', 'ROLE_ASSISTANT_ADMIN', 'ROLE_SUPER_USER')",
            name="ck_users_role",
        ),
        CheckConstraint("is_active IN (0, 1)", name="ck_users_is_active"),
        Index("idx_users_role_active", "role", "is_active"),
    )

    # Relationships
    patient: Mapped[Optional["Patient"]] = relationship("Patient", back_populates="user", uselist=False)
    created_registrations: Mapped[List["Registration"]] = relationship(
        "Registration", foreign_keys="Registration.created_by_user_id", back_populates="created_by_user"
    )
    submitted_registrations: Mapped[List["Registration"]] = relationship(
        "Registration", foreign_keys="Registration.submitted_by_user_id", back_populates="submitted_by_user"
    )
    reviewed_registrations: Mapped[List["Registration"]] = relationship(
        "Registration", foreign_keys="Registration.reviewed_by_user_id", back_populates="reviewed_by_user"
    )
    uploaded_documents: Mapped[List["UploadedDocument"]] = relationship(
        "UploadedDocument", foreign_keys="UploadedDocument.uploaded_by_user_id", back_populates="uploaded_by_user"
    )
    assigned_permissions: Mapped[List["UserPermission"]] = relationship(
        "UserPermission",
        foreign_keys="UserPermission.user_id",
        back_populates="user",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    granted_permissions: Mapped[List["UserPermission"]] = relationship(
        "UserPermission",
        foreign_keys="UserPermission.granted_by_user_id",
        back_populates="granted_by_user",
    )
    revoked_tokens: Mapped[List["RevokedToken"]] = relationship(
        "RevokedToken", back_populates="user", cascade="all, delete-orphan", lazy="selectin"
    )
    audit_events: Mapped[List["AuditEvent"]] = relationship(
        "AuditEvent", foreign_keys="AuditEvent.actor_user_id", back_populates="actor_user"
    )


class RevokedToken(Base):
    """Enforces refresh token revocation for session logout and termination."""

    __tablename__ = "revoked_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    revoked_at: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=text("(STRFTIME('%Y-%m-%dT%H:%M:%SZ', 'now'))")
    )
    expires_at: Mapped[str] = mapped_column(Text, nullable=False)

    __table_args__ = (
        Index("idx_revoked_tokens_expiry", "expires_at"),
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="revoked_tokens")
