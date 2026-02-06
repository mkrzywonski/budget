from datetime import datetime
from pydantic import BaseModel


class MatchPattern(BaseModel):
    """A single match pattern for a payee."""
    type: str  # starts_with, contains, exact, regex
    pattern: str


class PayeeCreate(BaseModel):
    """Fields for creating a payee."""
    name: str
    match_patterns: list[MatchPattern]
    default_category_id: int | None = None


class PayeeUpdate(BaseModel):
    """Fields for updating a payee (all optional)."""
    name: str | None = None
    match_patterns: list[MatchPattern] | None = None
    default_category_id: int | None = None


class PayeeResponse(BaseModel):
    """Payee response with all fields."""
    id: int
    name: str
    match_patterns: list[MatchPattern]
    default_category_id: int | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class RematchResponse(BaseModel):
    """Response from bulk re-match."""
    updated_count: int
