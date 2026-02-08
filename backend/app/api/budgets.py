from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas.budget import (
    BudgetCreate,
    BudgetUpdate,
    BudgetResponse,
    BudgetItemResponse,
    AutoPopulateRequest,
    BudgetVsActualResponse,
)
from ..services.budget_service import BudgetService

router = APIRouter()


def _build_response(budget) -> dict:
    return {
        "id": budget.id,
        "name": budget.name,
        "is_active": budget.is_active,
        "account_ids": [ba.account_id for ba in budget.accounts],
        "items": [
            BudgetItemResponse.model_validate(item)
            for item in budget.items
        ],
        "created_at": budget.created_at,
        "updated_at": budget.updated_at,
    }


@router.get("/", response_model=list[BudgetResponse])
def list_budgets(db: Session = Depends(get_db)):
    service = BudgetService(db)
    budgets = service.list_budgets()
    return [_build_response(b) for b in budgets]


@router.get("/{budget_id}", response_model=BudgetResponse)
def get_budget(budget_id: int, db: Session = Depends(get_db)):
    service = BudgetService(db)
    budget = service.get_budget(budget_id)
    if not budget:
        raise HTTPException(status_code=404, detail="Budget not found")
    return _build_response(budget)


@router.post("/", response_model=BudgetResponse, status_code=201)
def create_budget(data: BudgetCreate, db: Session = Depends(get_db)):
    service = BudgetService(db)
    budget = service.create_budget(
        name=data.name,
        account_ids=data.account_ids,
        items=[item.model_dump() for item in data.items],
    )
    return _build_response(budget)


@router.patch("/{budget_id}", response_model=BudgetResponse)
def update_budget(budget_id: int, data: BudgetUpdate, db: Session = Depends(get_db)):
    service = BudgetService(db)
    budget = service.get_budget(budget_id)
    if not budget:
        raise HTTPException(status_code=404, detail="Budget not found")

    budget = service.update_budget(
        budget,
        name=data.name,
        is_active=data.is_active,
        account_ids=data.account_ids,
        items=[item.model_dump() for item in data.items] if data.items is not None else None,
    )
    return _build_response(budget)


@router.delete("/{budget_id}", status_code=204)
def delete_budget(budget_id: int, db: Session = Depends(get_db)):
    service = BudgetService(db)
    budget = service.get_budget(budget_id)
    if not budget:
        raise HTTPException(status_code=404, detail="Budget not found")
    service.delete_budget(budget)


@router.post("/{budget_id}/auto-populate", response_model=BudgetResponse)
def auto_populate(
    budget_id: int,
    data: AutoPopulateRequest,
    db: Session = Depends(get_db),
):
    service = BudgetService(db)
    budget = service.get_budget(budget_id)
    if not budget:
        raise HTTPException(status_code=404, detail="Budget not found")

    budget = service.auto_populate(
        budget,
        start_date=data.start_date,
        end_date=data.end_date,
        account_ids=data.account_ids,
    )
    return _build_response(budget)


@router.get("/{budget_id}/vs-actual", response_model=BudgetVsActualResponse)
def budget_vs_actual(
    budget_id: int,
    start_date: date = Query(...),
    end_date: date = Query(...),
    db: Session = Depends(get_db),
):
    service = BudgetService(db)
    budget = service.get_budget(budget_id)
    if not budget:
        raise HTTPException(status_code=404, detail="Budget not found")

    return service.budget_vs_actual(budget, start_date, end_date)
