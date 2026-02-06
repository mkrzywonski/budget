from datetime import date, datetime
from pydantic import BaseModel, computed_field

from ..models.transaction import TransactionType, TransactionSource


class TransactionBase(BaseModel):
    """Base transaction fields."""
    posted_date: date
    amount_cents: int
    payee_raw: str | None = None
    payee_normalized: str | None = None
    memo: str | None = None
    notes: str | None = None
    category_id: int | None = None
    is_cleared: bool = False


class TransactionCreate(TransactionBase):
    """Fields for creating a transaction."""
    account_id: int
    transaction_type: TransactionType = TransactionType.ACTUAL
    source: TransactionSource = TransactionSource.MANUAL
    transfer_to_account_id: int | None = None  # For transfer transactions


class TransactionUpdate(BaseModel):
    """Fields for updating a transaction (all optional)."""
    posted_date: date | None = None
    amount_cents: int | None = None
    payee_raw: str | None = None
    payee_normalized: str | None = None
    memo: str | None = None
    notes: str | None = None
    category_id: int | None = None
    is_cleared: bool | None = None


class TransactionResponse(TransactionBase):
    """Transaction response with all fields."""
    id: int
    account_id: int
    transaction_type: TransactionType
    source: TransactionSource
    import_batch_id: str | None = None
    external_id: str | None = None
    transfer_link_id: int | None = None
    recurring_template_id: int | None = None
    created_at: datetime
    updated_at: datetime

    @computed_field
    @property
    def amount(self) -> float:
        """Amount in dollars."""
        return self.amount_cents / 100.0

    class Config:
        from_attributes = True
