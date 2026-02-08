from __future__ import annotations
from pydantic import BaseModel


class CategorySpendItem(BaseModel):
    category_id: int | None
    category_name: str
    income_cents: int
    expense_cents: int
    transaction_count: int
    children: list[CategorySpendItem] | None = None


class PayeeSpendItem(BaseModel):
    payee_name: str
    income_cents: int
    expense_cents: int
    transaction_count: int


class MonthlySpendItem(BaseModel):
    year: int
    month: int
    income_cents: int
    expense_cents: int
