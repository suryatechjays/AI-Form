"""Audit logging service for regulatory compliance and activity tracking."""

import json
import logging
from typing import Any, Dict, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from app.models.audit import AuditEvent

logger = logging.getLogger("aegis.audit")

# Redacted keys that must never be serialized to audit metadata
SENSITIVE_KEYS = {
    "password",
    "hashed_password",
    "token",
    "access_token",
    "refresh_token",
    "secret",
    "cookie",
    "new_password",
    "old_password",
}


def sanitize_audit_metadata(metadata: Optional[Dict[str, Any]]) -> Optional[str]:
    """Sanitize and serialize audit metadata dictionary to JSON string.
    
    Guarantees that sensitive attributes (passwords, tokens, cookies) are strictly redacted.
    """
    if metadata is None:
        return None

    cleaned: Dict[str, Any] = {}
    for k, v in metadata.items():
        if any(sensitive in k.lower() for sensitive in SENSITIVE_KEYS):
            cleaned[k] = "[REDACTED]"
        elif isinstance(v, dict):
            cleaned[k] = json.loads(sanitize_audit_metadata(v) or "{}")
        else:
            cleaned[k] = v

    return json.dumps(cleaned, separators=(",", ":"))


async def log_audit_event(
    db: AsyncSession,
    actor_user_id: Optional[int],
    actor_username: str,
    actor_role: str,
    action_type: str,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
    target_type: Optional[str] = None,
    target_id: Optional[str] = None,
    justification: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> AuditEvent:
    """Record an immutable audit event in the database."""
    sanitized_json = sanitize_audit_metadata(metadata)

    event = AuditEvent(
        actor_user_id=actor_user_id,
        actor_username=actor_username or "anonymous",
        actor_role=actor_role or "UNAUTHENTICATED",
        ip_address=ip_address,
        user_agent=user_agent,
        action_type=action_type,
        target_entity_type=target_type,
        target_entity_id=str(target_id) if target_id is not None else None,
        clinical_justification=justification[:255] if justification else None,
        metadata_json=sanitized_json,
    )
    db.add(event)
    await db.flush()
    logger.info("Audit logged: action=%s, actor=%s, target=%s/%s",
                action_type, actor_username, target_type, target_id)
    return event

