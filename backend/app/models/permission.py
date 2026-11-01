"""PermissionScope and UserPermission models for granular dynamic RBAC."""

from typing import TYPE_CHECKING, List
from sqlalchemy import ForeignKey, Index, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.user import User


class PermissionScope(Base):
    """Master catalog of granular permissions configurable for Assistant Administrators."""

    __tablename__ = "permission_scopes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    scope_name: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=text("(STRFTIME('%Y-%m-%dT%H:%M:%SZ', 'now'))")
    )

    # Relationships
    user_permissions: Mapped[List["UserPermission"]] = relationship(
        "UserPermission", back_populates="permission_scope", cascade="all, delete-orphan"
    )


class UserPermission(Base):
    """Associative mapping linking Assistant Administrator accounts to assigned permission scopes."""

    __tablename__ = "user_permissions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    permission_scope_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("permission_scopes.id", ondelete="CASCADE"), nullable=False
    )
    granted_by_user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    granted_at: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=text("(STRFTIME('%Y-%m-%dT%H:%M:%SZ', 'now'))")
    )

    __table_args__ = (
        UniqueConstraint("user_id", "permission_scope_id", name="uq_user_permissions_user_scope"),
        Index("idx_user_permissions_user", "user_id"),
    )

    # Relationships
    user: Mapped["User"] = relationship(
        "User", foreign_keys=[user_id], back_populates="assigned_permissions"
    )
    permission_scope: Mapped["PermissionScope"] = relationship(
        "PermissionScope", back_populates="user_permissions", lazy="selectin"
    )
    granted_by_user: Mapped["User"] = relationship(
        "User", foreign_keys=[granted_by_user_id], back_populates="granted_permissions", lazy="selectin"
    )
