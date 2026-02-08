from datetime import date
from sqlalchemy.orm import Session, aliased
from sqlalchemy import func, extract, case

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

    @staticmethod
    def _income_expense_columns():
        income = func.coalesce(
            func.sum(case((Transaction.amount_cents > 0, Transaction.amount_cents))),
            0,
        ).label("income_cents")
        expense = func.coalesce(
            func.sum(case((Transaction.amount_cents < 0, -Transaction.amount_cents))),
            0,
        ).label("expense_cents")
        return income, expense

    def spending_by_category(
        self,
        start_date: date | None,
        end_date: date | None,
        account_ids: list[int] | None,
        category_ids: list[int] | None,
        include_transfers: bool,
        group_by_parent: bool = True,
    ):
        query = self._base_query(
            start_date=start_date,
            end_date=end_date,
            account_ids=account_ids,
            category_ids=category_ids,
            include_transfers=include_transfers,
        )

        income, expense = self._income_expense_columns()

        if group_by_parent:
            parent_cat = aliased(Category, name="parent_cat")

            group_id = func.coalesce(Category.parent_id, Category.id).label("group_id")
            group_name = func.coalesce(parent_cat.name, Category.name, "Uncategorized").label("category_name")

            rows = (
                query.join(Category, Transaction.category_id == Category.id, isouter=True)
                .outerjoin(parent_cat, Category.parent_id == parent_cat.id)
                .with_entities(
                    group_id,
                    group_name,
                    income,
                    expense,
                    func.count(Transaction.id).label("transaction_count"),
                )
                .group_by(group_id, group_name)
                .order_by(expense.desc())
                .all()
            )

            return [
                {
                    "category_id": row.group_id,
                    "category_name": row.category_name or "Uncategorized",
                    "income_cents": int(row.income_cents or 0),
                    "expense_cents": int(row.expense_cents or 0),
                    "transaction_count": int(row.transaction_count or 0),
                    "children": None,
                }
                for row in rows
            ]
        else:
            rows = (
                query.join(Category, Transaction.category_id == Category.id, isouter=True)
                .with_entities(
                    Transaction.category_id.label("category_id"),
                    func.coalesce(Category.name, "Uncategorized").label("category_name"),
                    income,
                    expense,
                    func.count(Transaction.id).label("transaction_count"),
                )
                .group_by(Transaction.category_id, Category.name)
                .order_by(expense.desc())
                .all()
            )

            return [
                {
                    "category_id": row.category_id,
                    "category_name": row.category_name,
                    "income_cents": int(row.income_cents or 0),
                    "expense_cents": int(row.expense_cents or 0),
                    "transaction_count": int(row.transaction_count or 0),
                    "children": None,
                }
                for row in rows
            ]

    def spending_by_category_children(
        self,
        parent_category_id: int,
        start_date: date | None,
        end_date: date | None,
        account_ids: list[int] | None,
        include_transfers: bool,
    ):
        """Get child category breakdown for a specific parent category."""
        query = self._base_query(
            start_date=start_date,
            end_date=end_date,
            account_ids=account_ids,
            category_ids=None,
            include_transfers=include_transfers,
        )

        income, expense = self._income_expense_columns()

        # Get transactions that belong to the parent or any of its children
        child_ids = (
            self.db.query(Category.id)
            .filter(Category.parent_id == parent_category_id)
            .all()
        )
        child_id_list = [c.id for c in child_ids]
        all_ids = [parent_category_id] + child_id_list

        rows = (
            query.filter(Transaction.category_id.in_(all_ids))
            .join(Category, Transaction.category_id == Category.id, isouter=True)
            .with_entities(
                Transaction.category_id.label("category_id"),
                func.coalesce(Category.name, "Uncategorized").label("category_name"),
                income,
                expense,
                func.count(Transaction.id).label("transaction_count"),
            )
            .group_by(Transaction.category_id, Category.name)
            .order_by(expense.desc())
            .all()
        )

        return [
            {
                "category_id": row.category_id,
                "category_name": row.category_name,
                "income_cents": int(row.income_cents or 0),
                "expense_cents": int(row.expense_cents or 0),
                "transaction_count": int(row.transaction_count or 0),
                "children": None,
            }
            for row in rows
        ]

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

        income, expense = self._income_expense_columns()

        payee_label = func.coalesce(
            Transaction.display_name,
            Transaction.payee_normalized,
            Transaction.payee_raw,
            "Unknown",
        )

        rows = (
            query.with_entities(
                payee_label.label("payee_name"),
                income,
                expense,
                func.count(Transaction.id).label("transaction_count"),
            )
            .group_by(payee_label)
            .order_by(expense.desc())
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

        income, expense = self._income_expense_columns()

        year_col = extract("year", Transaction.posted_date)
        month_col = extract("month", Transaction.posted_date)

        rows = (
            query.with_entities(
                year_col.label("year"),
                month_col.label("month"),
                income,
                expense,
            )
            .group_by(year_col, month_col)
            .order_by(year_col, month_col)
            .all()
        )

        return rows
