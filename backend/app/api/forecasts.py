from datetime import date
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import ForecastDismissal
from ..services.forecast_service import generate_forecasts

router = APIRouter()


class DismissRequest(BaseModel):
    payee_id: int
    account_id: int
    period_date: str  # ISO date (first of month)


@router.get("/")
def get_forecasts(
    account_id: int = Query(...),
    start_date: str = Query(...),
    end_date: str = Query(...),
    db: Session = Depends(get_db),
):
    """Get generated forecast transactions for an account within a date range."""
    start = date.fromisoformat(start_date)
    end = date.fromisoformat(end_date)
    return generate_forecasts(db, account_id, start, end)


@router.post("/dismiss", status_code=201)
def dismiss_forecast(req: DismissRequest, db: Session = Depends(get_db)):
    """Dismiss a forecast for a specific payee/account/month."""
    period = date.fromisoformat(req.period_date)

    # Check if already dismissed
    existing = db.query(ForecastDismissal).filter(
        ForecastDismissal.payee_id == req.payee_id,
        ForecastDismissal.account_id == req.account_id,
        ForecastDismissal.period_date == period,
    ).first()

    if existing:
        return {"status": "already_dismissed"}

    dismissal = ForecastDismissal(
        payee_id=req.payee_id,
        account_id=req.account_id,
        period_date=period,
    )
    db.add(dismissal)
    db.flush()
    return {"status": "dismissed"}


@router.get("/dismissals/count")
def count_dismissals_for_payee(
    payee_id: int = Query(...),
    db: Session = Depends(get_db),
):
    """Count active dismissals (current month and future) for a payee."""
    current_month = date.today().replace(day=1)
    count = db.query(func.count(ForecastDismissal.id)).filter(
        ForecastDismissal.payee_id == payee_id,
        ForecastDismissal.period_date >= current_month,
    ).scalar()
    return {"count": count or 0}


@router.delete("/dismissals")
def clear_dismissals_for_payee(
    payee_id: int = Query(...),
    db: Session = Depends(get_db),
):
    """Clear all dismissals for a payee."""
    deleted = db.query(ForecastDismissal).filter(
        ForecastDismissal.payee_id == payee_id,
    ).delete()
    return {"deleted_count": deleted}
