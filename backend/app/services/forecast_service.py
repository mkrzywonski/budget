import calendar
from datetime import date
from sqlalchemy.orm import Session

from ..models import RecurringTemplate, Transaction, Payee, ForecastDismissal
from ..models.recurring_template import AmountMethod, Frequency


def _add_months(d: date, months: int) -> date:
    """Add months to a date, clamping day to valid range."""
    month = d.month - 1 + months
    year = d.year + month // 12
    month = month % 12 + 1
    max_day = calendar.monthrange(year, month)[1]
    return date(year, month, min(d.day, max_day))


def _clamp_day(year: int, month: int, day: int) -> date:
    """Create a date, clamping day to the last day of the month."""
    max_day = calendar.monthrange(year, month)[1]
    return date(year, month, min(day, max_day))


def _step_months(frequency: Frequency, frequency_n: int) -> int:
    """Return the number of months per step for a frequency."""
    if frequency == Frequency.MONTHLY:
        return 1
    elif frequency == Frequency.EVERY_N_MONTHS:
        return frequency_n
    elif frequency == Frequency.ANNUAL:
        return 12
    return 1


def _compute_amount(
    db: Session,
    template: RecurringTemplate,
    payee_name: str,
) -> int | None:
    """Compute the forecast amount in cents based on the template's method."""
    if template.amount_method == AmountMethod.FIXED:
        return template.fixed_amount_cents

    # Find past transactions for this payee across all accounts
    query = db.query(Transaction.amount_cents).filter(
        Transaction.display_name == payee_name,
    ).order_by(Transaction.posted_date.desc())

    if template.amount_method == AmountMethod.COPY_LAST:
        row = query.first()
        return row[0] if row else template.fixed_amount_cents

    if template.amount_method == AmountMethod.AVERAGE:
        rows = query.limit(template.average_count).all()
        if not rows:
            return template.fixed_amount_cents
        return int(round(sum(r[0] for r in rows) / len(rows)))

    return template.fixed_amount_cents


def _generate_schedule_dates(
    template_start: date,
    step_months: int,
    day_of_month: int,
    window_start: date,
    window_end: date,
    template_end: date | None,
) -> list[tuple[date, date]]:
    """
    Generate (forecast_date, period_first) tuples for a template within a window.

    Walks from template_start forward by step_months, yielding dates that fall
    within [window_start, window_end] and before template_end.
    """
    results = []
    # Use first-of-month for iteration
    cursor = date(template_start.year, template_start.month, 1)
    window_end_month = date(window_end.year, window_end.month, 1)

    while cursor <= window_end_month:
        forecast_date = _clamp_day(cursor.year, cursor.month, day_of_month)
        if forecast_date >= window_start and forecast_date <= window_end:
            if template_end is None or forecast_date <= template_end:
                results.append((forecast_date, cursor))
        elif cursor > window_end_month:
            break
        cursor = _add_months(cursor, step_months)

    return results


def generate_forecasts(
    db: Session,
    account_id: int,
    start_date: date,
    end_date: date,
) -> list[dict]:
    """
    Generate forecast transactions for an account within a date range.

    Returns list of dicts matching the Transaction response shape.
    """
    templates = db.query(RecurringTemplate).filter(
        RecurringTemplate.account_id == account_id,
        RecurringTemplate.is_active == True,
        RecurringTemplate.payee_id.isnot(None),
    ).all()

    # Pre-load dismissals for the date range
    dismissals = db.query(ForecastDismissal).filter(
        ForecastDismissal.account_id == account_id,
        ForecastDismissal.period_date >= date(start_date.year, start_date.month, 1),
        ForecastDismissal.period_date <= date(end_date.year, end_date.month, 1),
    ).all()
    dismissed_set = {
        (d.payee_id, d.period_date) for d in dismissals
    }

    forecasts = []

    for template in templates:
        payee = db.query(Payee).filter(Payee.id == template.payee_id).first()
        if not payee:
            continue

        payee_name = payee.name
        step = _step_months(template.frequency, template.frequency_n)
        amount = _compute_amount(db, template, payee_name)
        if amount is None:
            continue

        schedule = _generate_schedule_dates(
            template.start_date, step, template.day_of_month,
            start_date, end_date, template.end_date,
        )

        for forecast_date, period_first in schedule:
            # Skip if dismissed
            if (template.payee_id, period_first) in dismissed_set:
                continue

            # Synthetic negative ID: -(template_id * 100000 + YYYYMM)
            synthetic_id = -(template.id * 100000 + period_first.year * 100 + period_first.month)

            forecasts.append({
                "id": synthetic_id,
                "account_id": account_id,
                "posted_date": forecast_date.isoformat(),
                "amount_cents": amount,
                "amount": amount / 100.0,
                "payee_raw": None,
                "payee_normalized": None,
                "display_name": payee_name,
                "memo": None,
                "notes": None,
                "category_id": template.category_id,
                "transaction_type": "forecast",
                "source": "system",
                "is_cleared": False,
                "transfer_link_id": None,
                "recurring_template_id": template.id,
                "created_at": "",
                "updated_at": "",
                # Extra fields for frontend confirm/dismiss
                "payee_id": template.payee_id,
                "period_date": period_first.isoformat(),
            })

    return forecasts
