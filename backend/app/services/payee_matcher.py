"""
Payee matching service.

Matches transaction payee_raw strings against Payee match_patterns
and populates display_name on transactions.
"""

import re
from sqlalchemy.orm import Session

from ..models import Payee, Transaction


def match_payee(db: Session, payee_raw: str) -> str | None:
    """
    Check payee_raw against all payee match patterns.

    Returns the matched payee's name, or None if no match.
    First match wins.
    """
    if not payee_raw:
        return None

    payees = db.query(Payee).all()
    raw_lower = payee_raw.lower()

    for payee in payees:
        for rule in payee.match_patterns or []:
            match_type = rule.get("type", "contains")
            pattern = rule.get("pattern", "")
            if not pattern:
                continue

            if _matches(raw_lower, pattern, match_type):
                return payee.name

    return None


def _matches(raw_lower: str, pattern: str, match_type: str) -> bool:
    """Check if a single pattern matches."""
    pattern_lower = pattern.lower()

    if match_type == "starts_with":
        return raw_lower.startswith(pattern_lower)
    elif match_type == "contains":
        return pattern_lower in raw_lower
    elif match_type == "exact":
        return raw_lower == pattern_lower
    elif match_type == "regex":
        try:
            return bool(re.search(pattern, raw_lower, re.IGNORECASE))
        except re.error:
            return False

    return False


def matches_patterns(patterns: list[dict], payee_raw: str) -> bool:
    """Check if any pattern in a list matches a raw payee string."""
    if not payee_raw:
        return False
    raw_lower = payee_raw.lower()
    for rule in patterns or []:
        match_type = rule.get("type", "contains")
        pattern = rule.get("pattern", "")
        if not pattern:
            continue
        if _matches(raw_lower, pattern, match_type):
            return True
    return False


def matches_payee(payee: Payee, payee_raw: str) -> bool:
    """Check if a payee's patterns match a raw payee string."""
    return matches_patterns(payee.match_patterns or [], payee_raw)


def apply_payee_match(db: Session, transaction: Transaction) -> None:
    """
    If the transaction has payee_raw, attempt to match it against
    payee rules and set display_name.
    """
    if not transaction.payee_raw:
        transaction.display_name = None
        return

    name = match_payee(db, transaction.payee_raw)
    transaction.display_name = name


def rematch_all(db: Session) -> int:
    """
    Re-run payee matching on all transactions.

    Clears existing display_name values and re-applies matches.
    Returns the number of transactions updated.
    """
    payees = db.query(Payee).all()
    if not payees:
        # Clear all display_names if no payees exist
        count = db.query(Transaction).filter(
            Transaction.display_name.isnot(None)
        ).update({"display_name": None})
        return count

    transactions = db.query(Transaction).filter(
        Transaction.payee_raw.isnot(None)
    ).all()

    updated = 0
    for tx in transactions:
        old_name = tx.display_name
        new_name = None

        for payee in payees:
            if matches_payee(payee, tx.payee_raw):
                new_name = payee.name
                break

        if new_name != old_name:
            tx.display_name = new_name
            updated += 1

    return updated
