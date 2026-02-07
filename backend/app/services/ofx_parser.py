"""
OFX/QFX parsing service.

Parses OFX/QFX files (standard bank download format) into the same
ParsedTransaction/CSVParseResult structures used by CSV import,
so the existing preview/commit pipeline works unchanged.
"""

import hashlib
from io import BytesIO

from ofxparse import OfxParser

from .csv_parser import ParsedTransaction, CSVParseResult


def parse_ofx_file(content: str) -> CSVParseResult:
    """
    Parse OFX/QFX file content and return a CSVParseResult.

    OFX files have a fixed structure, so no column mapping is needed.
    """
    try:
        ofx = OfxParser.parse(BytesIO(content.encode('latin-1')))
    except Exception as e:
        return CSVParseResult(
            headers=[],
            header_signature="ofx",
            transactions=[],
            errors=[f"Failed to parse OFX file: {e}"]
        )

    if not hasattr(ofx, 'account') or not hasattr(ofx.account, 'statement'):
        return CSVParseResult(
            headers=[],
            header_signature="ofx",
            transactions=[],
            errors=["OFX file has no account or statement data"]
        )

    transactions: list[ParsedTransaction] = []
    errors: list[str] = []

    for idx, tx in enumerate(ofx.account.statement.transactions):
        try:
            posted_date = tx.date.date()
            amount_cents = int(round(float(tx.amount) * 100))

            payee_raw = (tx.payee or "").strip() or (tx.memo or "").strip() or None
            memo_str = (tx.memo or "").strip() or None
            # Only keep memo if it's different from payee
            if memo_str and payee_raw and memo_str == payee_raw:
                memo_str = None

            fitid = getattr(tx, 'id', '') or ''
            tx_type = getattr(tx, 'type', '') or ''

            # FITID-based fingerprint is more reliable than payee-based
            fingerprint_parts = f"{fitid}|{posted_date.isoformat()}|{amount_cents}"
            fingerprint = hashlib.md5(fingerprint_parts.encode()).hexdigest()

            raw_data = {
                "FITID": fitid,
                "Type": str(tx_type),
                "Payee": payee_raw or "",
                "Memo": memo_str or "",
                "Date": posted_date.isoformat(),
                "Amount": str(amount_cents / 100),
            }

            transactions.append(ParsedTransaction(
                row_index=idx,
                posted_date=posted_date,
                amount_cents=amount_cents,
                payee_raw=payee_raw,
                memo=memo_str,
                fingerprint=fingerprint,
                raw_data=raw_data,
            ))
        except Exception as e:
            errors.append(f"Transaction {idx}: {e}")

    return CSVParseResult(
        headers=["Date", "Amount", "Payee", "Memo", "FITID"],
        header_signature="ofx",
        transactions=transactions,
        row_count=len(ofx.account.statement.transactions),
        error_count=len(errors),
        errors=errors,
    )
