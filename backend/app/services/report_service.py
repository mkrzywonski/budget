from datetime import date
from sqlalchemy.orm import Session
from sqlalchemy import func, extract

from ..models import Transaction, TransactionType, Category


class ReportService:
    def __init__(self, db: Session):
        self.db = db

    def _base_query(
        self,
        start_date: date | None,
        end_date: date | None,
        account_ids: list[int] | None,
        category_ids: list[int] | None,
        include_transfers: bool,
    ):
        if include_transfers:
            allowed_types = [TransactionType.ACTUAL, TransactionType.TRANSFER]
        else:
            allowed_types = [TransactionType.ACTUAL]

        query = self.db.query(Transaction).filter(
            Transaction.transaction_type.in_(allowed_types)
        )

        if start_date:
            query = query.filter(Transaction.posted_date >= start_date)
        if end_date:
            query = query.filter(Transaction.posted_date <= end_date)
        if account_ids:
            query = query.filter(Transaction.account_id.in_(account_ids))
        if category_ids:
            query = query.filter(Transaction.category_id.in_(category_ids))

        return query

    def spending_by_category(
        self,
        start_date: date | None,
        end_date: date | None,
        account_ids: list[int] | None,
        category_ids: list[int] | None,
        include_transfers: bool,
    ):
        query = self._base_query(
            start_date=start_date,
            end_date=end_date,
            account_ids=account_ids,
            category_ids=category_ids,
            include_transfers=include_transfers,
        )

        rows = (
            query.join(Category, Transaction.category_id == Category.id, isouter=True)
            .with_entities(
                Transaction.category_id.label("category_id"),
                func.coalesce(Category.name, "Uncategorized").label("category_name"),
                (-func.coalesce(func.sum(Transaction.amount_cents), 0)).label("total_cents"),
                func.count(Transaction.id).label("transaction_count"),
            )
            .group_by(Transaction.category_id, Category.name)
            .order_by(func.abs(func.sum(Transaction.amount_cents)).desc())
            .all()
        )

        return rows

    def spending_by_payee(
        self,
        start_date: date | None,
        end_date: date | None,
        account_ids: list[int] | None,
        category_ids: list[int] | None,
        include_transfers: bool,
    ):
        query = self._base_query(
            start_date=start_date,
            end_date=end_date,
            account_ids=account_ids,
            category_ids=category_ids,
            include_transfers=include_transfers,
        )

        payee_label = func.coalesce(
            Transaction.display_name,
            Transaction.payee_normalized,
            Transaction.payee_raw,
            "Unknown",
        )

        rows = (
            query.with_entities(
                payee_label.label("payee_name"),
                (-func.coalesce(func.sum(Transaction.amount_cents), 0)).label("total_cents"),
                func.count(Transaction.id).label("transaction_count"),
            )
            .group_by(payee_label)
            .order_by(func.abs(func.sum(Transaction.amount_cents)).desc())
            .all()
        )

        return rows

    def spending_trends(
        self,
        start_date: date | None,
        end_date: date | None,
        account_ids: list[int] | None,
        category_ids: list[int] | None,
        include_transfers: bool,
    ):
        query = self._base_query(
            start_date=start_date,
            end_date=end_date,
            account_ids=account_ids,
            category_ids=category_ids,
            include_transfers=include_transfers,
        )

        year_col = extract("year", Transaction.posted_date)
        month_col = extract("month", Transaction.posted_date)

        rows = (
            query.with_entities(
                year_col.label("year"),
                month_col.label("month"),
                (-func.coalesce(func.sum(Transaction.amount_cents), 0)).label("total_cents"),
            )
            .group_by(year_col, month_col)
            .order_by(year_col, month_col)
            .all()
        )

        return rows
