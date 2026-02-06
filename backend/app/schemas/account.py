from datetime import datetime
from pydantic import BaseModel


class AccountBase(BaseModel):
    """Base account fields."""
    name: str
    account_type: str
    institution: str | None = None
    notes: str | None = None
    display_order: int = 0


class AccountCreate(AccountBase):
    """Fields for creating an account."""
    pass


class AccountUpdate(BaseModel):
    """Fields for updating an account (all optional)."""
    name: str | None = None
    account_type: str | None = None
    institution: str | None = None
    notes: str | None = None
    display_order: int | None = None


class AccountResponse(AccountBase):
    """Account response with all fields."""
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
