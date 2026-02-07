from pydantic import BaseModel


class CategorySpendItem(BaseModel):
    category_id: int | None
    category_name: str
    total_cents: int
    transaction_count: int


class PayeeSpendItem(BaseModel):
    payee_name: str
    total_cents: int
    transaction_count: int


class MonthlySpendItem(BaseModel):
    year: int
    month: int
    total_cents: int
