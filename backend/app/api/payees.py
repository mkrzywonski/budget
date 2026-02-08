from datetime import date as date_type
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Payee, Transaction, TransactionType, RecurringTemplate, AmountMethod, Frequency
from ..schemas.payee import (
    PayeeCreate, PayeeUpdate, PayeeResponse, RematchResponse, RecurringRule, MatchPattern
)
from ..services.payee_matcher import rematch_all, matches_payee, matches_patterns, rematch_payee

router = APIRouter()


def _build_recurring_rule(template: RecurringTemplate) -> RecurringRule:
    """Convert a RecurringTemplate model to a RecurringRule schema."""
    return RecurringRule(
        account_id=template.account_id,
        frequency=template.frequency.value,
        frequency_n=template.frequency_n,
        day_of_month=template.day_of_month,
        amount_method=template.amount_method.value,
        fixed_amount_cents=template.fixed_amount_cents,
        average_count=template.average_count,
        start_date=template.start_date.isoformat(),
        end_date=template.end_date.isoformat() if template.end_date else None,
        category_id=template.category_id,
    )


def _build_response(payee: Payee, db: Session) -> PayeeResponse:
    """Build PayeeResponse including recurring_rule from linked template."""
    template = db.query(RecurringTemplate).filter(
        RecurringTemplate.payee_id == payee.id,
        RecurringTemplate.is_active == True,
    ).first()

    return PayeeResponse(
        id=payee.id,
        name=payee.name,
        match_patterns=[MatchPattern(**p) for p in payee.match_patterns],
        default_category_id=payee.default_category_id,
        recurring_rule=_build_recurring_rule(template) if template else None,
        created_at=payee.created_at,
        updated_at=payee.updated_at,
    )


def _upsert_recurring_template(
    db: Session, payee: Payee, rule: RecurringRule
) -> None:
    """Create or update the RecurringTemplate linked to this payee."""
    template = db.query(RecurringTemplate).filter(
        RecurringTemplate.payee_id == payee.id
    ).first()

    if template is None:
        template = RecurringTemplate(payee_id=payee.id)
        db.add(template)

    template.account_id = rule.account_id
    template.name = payee.name
    template.payee = payee.name
    template.frequency = Frequency(rule.frequency)
    template.frequency_n = rule.frequency_n
    template.day_of_month = rule.day_of_month
    template.amount_method = AmountMethod(rule.amount_method)
    template.fixed_amount_cents = rule.fixed_amount_cents
    template.average_count = rule.average_count
    template.start_date = date_type.fromisoformat(rule.start_date)
    template.end_date = date_type.fromisoformat(rule.end_date) if rule.end_date else None
    template.category_id = rule.category_id
    template.is_active = True


def _delete_recurring_template(db: Session, payee_id: int) -> None:
    """Delete any RecurringTemplate linked to this payee."""
    db.query(RecurringTemplate).filter(
        RecurringTemplate.payee_id == payee_id
    ).delete()


@router.get("/")
def list_payees(db: Session = Depends(get_db)):
    """Get all payees."""
    payees = db.query(Payee).order_by(Payee.name).all()
    return [_build_response(p, db) for p in payees]


@router.get("/{payee_id}")
def get_payee(payee_id: int, db: Session = Depends(get_db)):
    """Get a single payee by ID."""
    payee = db.query(Payee).filter(Payee.id == payee_id).first()
    if not payee:
        raise HTTPException(status_code=404, detail="Payee not found")
    return _build_response(payee, db)


@router.post("/", status_code=201)
def create_payee(payee: PayeeCreate, db: Session = Depends(get_db)):
    """Create a new payee."""
    db_payee = Payee(
        name=payee.name,
        match_patterns=[p.model_dump() for p in payee.match_patterns],
        default_category_id=payee.default_category_id
    )
    db.add(db_payee)
    db.flush()

    if payee.recurring_rule:
        _upsert_recurring_template(db, db_payee, payee.recurring_rule)
        db.flush()

    db.refresh(db_payee)
    return _build_response(db_payee, db)


@router.patch("/{payee_id}")
def update_payee(
    payee_id: int,
    payee: PayeeUpdate,
    db: Session = Depends(get_db)
):
    """Update a payee."""
    db_payee = db.query(Payee).filter(Payee.id == payee_id).first()
    if not db_payee:
        raise HTTPException(status_code=404, detail="Payee not found")

    update_data = payee.model_dump(exclude_unset=True)

    # Handle recurring rule separately
    recurring_rule = update_data.pop("recurring_rule", None)
    remove_recurring = update_data.pop("remove_recurring_rule", False)

    if "match_patterns" in update_data and update_data["match_patterns"] is not None:
        update_data["match_patterns"] = [
            p.model_dump() if hasattr(p, "model_dump") else p
            for p in update_data["match_patterns"]
        ]

    for field, value in update_data.items():
        setattr(db_payee, field, value)

    if remove_recurring:
        _delete_recurring_template(db, payee_id)
    elif recurring_rule is not None:
        rule = RecurringRule(**recurring_rule) if isinstance(recurring_rule, dict) else recurring_rule
        _upsert_recurring_template(db, db_payee, rule)

    db.flush()
    db.refresh(db_payee)
    return _build_response(db_payee, db)


@router.delete("/{payee_id}", status_code=204)
def delete_payee(payee_id: int, db: Session = Depends(get_db)):
    """Delete a payee."""
    db_payee = db.query(Payee).filter(Payee.id == payee_id).first()
    if not db_payee:
        raise HTTPException(status_code=404, detail="Payee not found")
    _delete_recurring_template(db, payee_id)
    db.delete(db_payee)
    return None


@router.post("/rematch", response_model=RematchResponse)
def rematch_payees(db: Session = Depends(get_db)):
    """Re-run payee matching on all transactions."""
    updated_count = rematch_all(db)
    return RematchResponse(updated_count=updated_count)


@router.post("/{payee_id}/rematch", response_model=RematchResponse)
def rematch_single_payee(payee_id: int, db: Session = Depends(get_db)):
    """Re-run payee matching for a single payee."""
    payee = db.query(Payee).filter(Payee.id == payee_id).first()
    if not payee:
        raise HTTPException(status_code=404, detail="Payee not found")
    updated_count = rematch_payee(db, payee)
    return RematchResponse(updated_count=updated_count)


@router.get("/{payee_id}/latest-transaction")
def latest_transaction(payee_id: int, db: Session = Depends(get_db)):
    """Find the most recent actual transaction matching this payee's display_name."""
    payee = db.query(Payee).filter(Payee.id == payee_id).first()
    if not payee:
        raise HTTPException(status_code=404, detail="Payee not found")

    tx = (
        db.query(Transaction)
        .filter(
            Transaction.display_name == payee.name,
            Transaction.transaction_type.in_([TransactionType.ACTUAL, TransactionType.TRANSFER]),
        )
        .order_by(Transaction.posted_date.desc(), Transaction.created_at.desc())
        .first()
    )

    if not tx:
        return None

    return {
        "id": tx.id,
        "account_id": tx.account_id,
        "posted_date": tx.posted_date.isoformat(),
        "amount_cents": tx.amount_cents,
        "category_id": tx.category_id,
    }


@router.get("/{payee_id}/matches", response_model=list[str])
def list_payee_matches(payee_id: int, db: Session = Depends(get_db)):
    """List distinct raw payees that match this payee's patterns."""
    payee = db.query(Payee).filter(Payee.id == payee_id).first()
    if not payee:
        raise HTTPException(status_code=404, detail="Payee not found")

    transactions = db.query(Transaction).filter(
        Transaction.payee_raw.isnot(None)
    ).all()

    matches = {
        tx.payee_raw
        for tx in transactions
        if tx.payee_raw and matches_payee(payee, tx.payee_raw)
    }

    return sorted(matches, key=lambda value: value.lower())


@router.post("/preview-matches", response_model=list[str])
def preview_payee_matches(payee: PayeeCreate, db: Session = Depends(get_db)):
    """Preview distinct raw payees that would match the provided patterns."""
    transactions = db.query(Transaction).filter(
        Transaction.payee_raw.isnot(None)
    ).all()

    matches = {
        tx.payee_raw
        for tx in transactions
        if tx.payee_raw and matches_patterns(
            [p.model_dump() for p in payee.match_patterns],
            tx.payee_raw
        )
    }

    return sorted(matches, key=lambda value: value.lower())
