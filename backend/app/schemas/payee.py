from datetime import datetime
from pydantic import BaseModel


class MatchPattern(BaseModel):
    """A single match pattern for a payee."""
    type: str  # starts_with, contains, exact, regex
    pattern: str


class RecurringRule(BaseModel):
    """Recurring transaction rule attached to a payee."""
    account_id: int
    frequency: str  # 'monthly' | 'every_n_months' | 'annual'
    frequency_n: int = 1
    day_of_month: int = 1
    amount_method: str  # 'fixed' | 'copy_last' | 'average'
    fixed_amount_cents: int | None = None
    average_count: int = 3
    start_date: str  # ISO date
    end_date: str | None = None
    category_id: int | None = None


class PayeeCreate(BaseModel):
    """Fields for creating a payee."""
    name: str
    match_patterns: list[MatchPattern]
    default_category_id: int | None = None
    recurring_rule: RecurringRule | None = None


class PayeeUpdate(BaseModel):
    """Fields for updating a payee (all optional)."""
    name: str | None = None
    match_patterns: list[MatchPattern] | None = None
    default_category_id: int | None = None
    recurring_rule: RecurringRule | None = None
    remove_recurring_rule: bool = False


class PayeeResponse(BaseModel):
    """Payee response with all fields."""
    id: int
    name: str
    match_patterns: list[MatchPattern]
    default_category_id: int | None = None
    recurring_rule: RecurringRule | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class RematchResponse(BaseModel):
    """Response from bulk re-match."""
    updated_count: int
