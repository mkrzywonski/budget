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
    db: Session = Depends(get_db),
):
    service = ReportService(db)
    rows = service.spending_by_category(
        start_date=start_date,
        end_date=end_date,
        account_ids=account_id,
        category_ids=category_id,
        include_transfers=include_transfers,
    )

    return [
        CategorySpendItem(
            category_id=row.category_id,
            category_name=row.category_name,
            total_cents=int(row.total_cents or 0),
            transaction_count=int(row.transaction_count or 0),
        )
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
            total_cents=int(row.total_cents or 0),
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
            total_cents=int(row.total_cents or 0),
        )
        for row in rows
    ]
