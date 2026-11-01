"""AEGIS Business and Orchestration Services."""

from app.services.ai_service import execute_heuristic_regex_fallback, extract_entities_with_groq
from app.services.audit_service import log_audit_event
from app.services.auth_service import authenticate_user, issue_tokens, rotate_refresh_token
from app.services.document_service import get_document_by_uuid, list_documents, validate_and_save_document
from app.services.extraction_service import extract_document_text
from app.services.patient_service import (
    check_patient_duplicates,
    create_patient,
    get_patient_by_id,
    get_patient_for_user,
    list_patients,
    update_patient,
)
from app.services.pdf_service import (
    compile_registration_pdf_task,
    get_registration_pdf_file,
    regenerate_registration_pdf,
    sweep_stale_pending_pdf_jobs,
)
from app.services.permission_service import check_assistant_admin_scope
from app.services.registration_service import (
    calculate_age_at_registration,
    create_registration_draft,
    get_registration_by_id,
    list_registrations,
    review_registration,
    submit_registration,
    update_registration_draft,
)

__all__ = [
    "log_audit_event",
    "authenticate_user",
    "issue_tokens",
    "rotate_refresh_token",
    "check_assistant_admin_scope",
    "create_patient",
    "get_patient_by_id",
    "get_patient_for_user",
    "list_patients",
    "update_patient",
    "check_patient_duplicates",
    "create_registration_draft",
    "get_registration_by_id",
    "list_registrations",
    "update_registration_draft",
    "submit_registration",
    "review_registration",
    "calculate_age_at_registration",
    "validate_and_save_document",
    "get_document_by_uuid",
    "list_documents",
    "extract_document_text",
    "extract_entities_with_groq",
    "execute_heuristic_regex_fallback",
    "compile_registration_pdf_task",
    "regenerate_registration_pdf",
    "get_registration_pdf_file",
    "sweep_stale_pending_pdf_jobs",
]

