from datetime import date
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas import CategorySpendItem, PayeeSpendItem, MonthlySpendItem
from ..services.report_service import ReportService

router = APIRouter()


@router.get("/spending-by-category", response_model=list[CategorySpendItem])
def spending_by_category(
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    account_id: list[int] | None = Query(None),
    category_id: list[int] | None = Query(None),
    include_transfers: bool = Query(False),
    group_by_parent: bool = Query(True),
    db: Session = Depends(get_db),
):
    service = ReportService(db)
    rows = service.spending_by_category(
        start_date=start_date,
        end_date=end_date,
        account_ids=account_id,
        category_ids=category_id,
        include_transfers=include_transfers,
        group_by_parent=group_by_parent,
    )

    return [
        CategorySpendItem(**row)
        for row in rows
    ]


@router.get("/spending-by-category/{parent_id}/children", response_model=list[CategorySpendItem])
def spending_by_category_children(
    parent_id: int,
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    account_id: list[int] | None = Query(None),
    include_transfers: bool = Query(False),
    db: Session = Depends(get_db),
):
    service = ReportService(db)
    rows = service.spending_by_category_children(
        parent_category_id=parent_id,
        start_date=start_date,
        end_date=end_date,
        account_ids=account_id,
        include_transfers=include_transfers,
    )

    return [
        CategorySpendItem(**row)
        for row in rows
    ]


@router.get("/spending-by-payee", response_model=list[PayeeSpendItem])
def spending_by_payee(
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    account_id: list[int] | None = Query(None),
    category_id: list[int] | None = Query(None),
    include_transfers: bool = Query(False),
    db: Session = Depends(get_db),
):
    service = ReportService(db)
    rows = service.spending_by_payee(
        start_date=start_date,
        end_date=end_date,
        account_ids=account_id,
        category_ids=category_id,
        include_transfers=include_transfers,
    )

    return [
        PayeeSpendItem(
            payee_name=row.payee_name,
            income_cents=int(row.income_cents or 0),
            expense_cents=int(row.expense_cents or 0),
            transaction_count=int(row.transaction_count or 0),
        )
        for row in rows
    ]


@router.get("/spending-trends", response_model=list[MonthlySpendItem])
def spending_trends(
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    account_id: list[int] | None = Query(None),
    category_id: list[int] | None = Query(None),
    include_transfers: bool = Query(False),
    db: Session = Depends(get_db),
):
    service = ReportService(db)
    rows = service.spending_trends(
        start_date=start_date,
        end_date=end_date,
        account_ids=account_id,
        category_ids=category_id,
        include_transfers=include_transfers,
    )

    return [
        MonthlySpendItem(
            year=int(row.year),
            month=int(row.month),
            income_cents=int(row.income_cents or 0),
            expense_cents=int(row.expense_cents or 0),
        )
        for row in rows
    ]
