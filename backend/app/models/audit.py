"""AuditEvent model for append-only regulatory compliance and activity tracking."""

from typing import TYPE_CHECKING, Optional
from sqlalchemy import ForeignKey, Index, Integer, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.user import User


class AuditEvent(Base):
    """Append-only security and clinical audit trail."""

    __tablename__ = "audit_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    timestamp: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=text("(STRFTIME('%Y-%m-%dT%H:%M:%SZ', 'now'))")
    )
    actor_user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, default=None
    )
    actor_username: Mapped[str] = mapped_column(String(100), nullable=False)
    actor_role: Mapped[str] = mapped_column(String(50), nullable=False)
    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    action_type: Mapped[str] = mapped_column(String(100), nullable=False)
    target_entity_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    target_entity_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    clinical_justification: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    metadata_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    __table_args__ = (
        Index("idx_audit_timestamp", "timestamp"),
        Index("idx_audit_actor", "actor_user_id"),
        Index("idx_audit_action_target", "action_type", "target_entity_type", "target_entity_id"),
    )

    # Relationships
    actor_user: Mapped[Optional["User"]] = relationship(
        "User", foreign_keys=[actor_user_id], back_populates="audit_events"
    )

