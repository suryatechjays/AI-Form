"""RFC 7807 Problem Details error schema for AEGIS API responses."""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class InvalidParam(BaseModel):
    """Specific invalid parameter detail."""
    name: str = Field(..., description="Field or parameter name")
    reason: str = Field(..., description="Validation failure explanation")


class ProblemDetails(BaseModel):
    """Pure RFC 7807 Problem Details response structure."""

    type: str = Field(
        default="about:blank",
        description="URI reference that identifies the problem type",
    )
    title: str = Field(..., description="Short, human-readable summary of the problem type")
    status: int = Field(..., description="HTTP status code")
    detail: str = Field(..., description="Human-readable explanation specific to this occurrence")
    instance: Optional[str] = Field(
        default=None, description="URI reference identifying the specific occurrence"
    )
    code: str = Field(..., description="Machine-readable AEGIS error classification code")
    correlation_id: Optional[str] = Field(
        default=None, description="Request correlation identifier for tracing"
    )
    invalid_params: Optional[List[InvalidParam]] = Field(
        default=None, description="List of specific field validation errors, if applicable"
    )

