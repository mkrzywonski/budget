from __future__ import annotations
from datetime import datetime, date
from pydantic import BaseModel


# --- Input schemas ---

class BudgetItemInput(BaseModel):
    category_id: int
    amount_cents: int


class BudgetCreate(BaseModel):
    name: str
    account_ids: list[int] = []
    items: list[BudgetItemInput] = []


class BudgetUpdate(BaseModel):
    name: str | None = None
    is_active: bool | None = None
    account_ids: list[int] | None = None
    items: list[BudgetItemInput] | None = None


class AutoPopulateRequest(BaseModel):
    start_date: date
    end_date: date
    account_ids: list[int] | None = None


# --- Response schemas ---

class BudgetItemResponse(BaseModel):
    id: int
    category_id: int
    amount_cents: int

    class Config:
        from_attributes = True


class BudgetResponse(BaseModel):
    id: int
    name: str
    is_active: bool
    account_ids: list[int]
    items: list[BudgetItemResponse]
    created_at: datetime
    updated_at: datetime


# --- Budget vs Actual schemas ---

class BudgetVsActualItem(BaseModel):
    category_id: int | None
    category_name: str
    parent_category_id: int | None = None
    budget_cents: int
    actual_cents: int
    difference_cents: int
    is_income: bool


class BudgetVsActualMonth(BaseModel):
    year: int
    month: int
    items: list[BudgetVsActualItem]
    total_budget_income: int
    total_actual_income: int
    total_budget_expense: int
    total_actual_expense: int


class BudgetVsActualResponse(BaseModel):
    budget_id: int
    budget_name: str
    months: list[BudgetVsActualMonth]
