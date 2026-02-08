from datetime import date
from sqlalchemy.orm import Session
from sqlalchemy import func, extract

from ..models import Budget, BudgetItem, BudgetAccount, Transaction, TransactionType, Category


class BudgetService:
    def __init__(self, db: Session):
        self.db = db

    def list_budgets(self) -> list[Budget]:
        return self.db.query(Budget).order_by(Budget.name).all()

    def get_budget(self, budget_id: int) -> Budget | None:
        return self.db.query(Budget).filter(Budget.id == budget_id).first()

    def create_budget(
        self,
        name: str,
        account_ids: list[int],
        items: list[dict],
    ) -> Budget:
        budget = Budget(name=name)
        self.db.add(budget)
        self.db.flush()

        for aid in account_ids:
            self.db.add(BudgetAccount(budget_id=budget.id, account_id=aid))

        for item in items:
            self.db.add(BudgetItem(
                budget_id=budget.id,
                category_id=item["category_id"],
                amount_cents=item["amount_cents"],
            ))

        self.db.flush()
        return budget

    def update_budget(
        self,
        budget: Budget,
        name: str | None = None,
        is_active: bool | None = None,
        account_ids: list[int] | None = None,
        items: list[dict] | None = None,
    ) -> Budget:
        if name is not None:
            budget.name = name
        if is_active is not None:
            budget.is_active = is_active

        if account_ids is not None:
            # Full replacement
            self.db.query(BudgetAccount).filter(
                BudgetAccount.budget_id == budget.id
            ).delete()
            for aid in account_ids:
                self.db.add(BudgetAccount(budget_id=budget.id, account_id=aid))

        if items is not None:
            # Full replacement
            self.db.query(BudgetItem).filter(
                BudgetItem.budget_id == budget.id
            ).delete()
            for item in items:
                self.db.add(BudgetItem(
                    budget_id=budget.id,
                    category_id=item["category_id"],
                    amount_cents=item["amount_cents"],
                ))

        self.db.flush()
        # Refresh to pick up new relationships
        self.db.refresh(budget)
        return budget

    def delete_budget(self, budget: Budget) -> None:
        self.db.delete(budget)

    def auto_populate(
        self,
        budget: Budget,
        start_date: date,
        end_date: date,
        account_ids: list[int] | None = None,
    ) -> Budget:
        """Replace budget items with historical average spending per category."""
        # Use the budget's own accounts if none specified
        if account_ids is None:
            account_ids = [ba.account_id for ba in budget.accounts]

        # Query transactions grouped by category
        query = (
            self.db.query(
                Transaction.category_id,
                func.sum(Transaction.amount_cents).label("total_cents"),
            )
            .filter(
                Transaction.transaction_type.in_([
                    TransactionType.ACTUAL,
                    TransactionType.TRANSFER,
                ]),
                Transaction.posted_date >= start_date,
                Transaction.posted_date <= end_date,
            )
        )

        if account_ids:
            query = query.filter(Transaction.account_id.in_(account_ids))

        rows = query.group_by(Transaction.category_id).all()

        # Count months in the range
        num_months = (
            (end_date.year * 12 + end_date.month)
            - (start_date.year * 12 + start_date.month)
            + 1
        )
        if num_months < 1:
            num_months = 1

        # Build new items
        new_items = []
        for row in rows:
            if row.category_id is None:
                continue
            avg = round(row.total_cents / num_months)
            new_items.append({
                "category_id": row.category_id,
                "amount_cents": avg,
            })

        return self.update_budget(budget, items=new_items)

    def budget_vs_actual(
        self,
        budget: Budget,
        start_date: date,
        end_date: date,
    ) -> dict:
        """Compare budget targets vs actual spending, broken down by month."""
        account_ids = [ba.account_id for ba in budget.accounts]

        # Build category info map
        all_categories = self.db.query(Category).all()
        cat_map = {c.id: c for c in all_categories}

        # Budget items keyed by category_id
        budget_items = {bi.category_id: bi.amount_cents for bi in budget.items}

        # Find which budget items are on parent categories (for rolling up children)
        parent_budget_ids = set()
        for cat_id in budget_items:
            cat = cat_map.get(cat_id)
            if cat and cat.parent_id is None:
                # Check if this parent has children
                children = [c for c in all_categories if c.parent_id == cat_id]
                if children:
                    parent_budget_ids.add(cat_id)

        # Query actual transactions grouped by year, month, category
        query = (
            self.db.query(
                extract("year", Transaction.posted_date).label("year"),
                extract("month", Transaction.posted_date).label("month"),
                Transaction.category_id,
                func.sum(Transaction.amount_cents).label("actual_cents"),
            )
            .filter(
                Transaction.transaction_type.in_([
                    TransactionType.ACTUAL,
                    TransactionType.TRANSFER,
                ]),
                Transaction.posted_date >= start_date,
                Transaction.posted_date <= end_date,
            )
        )

        if account_ids:
            query = query.filter(Transaction.account_id.in_(account_ids))

        rows = query.group_by("year", "month", Transaction.category_id).all()

        # Organize actuals: {(year, month): {category_id: cents}}
        actuals: dict[tuple[int, int], dict[int | None, int]] = {}
        for row in rows:
            key = (int(row.year), int(row.month))
            if key not in actuals:
                actuals[key] = {}
            actuals[key][row.category_id] = int(row.actual_cents)

        # Generate month list
        months = []
        y, m = start_date.year, start_date.month
        while (y, m) <= (end_date.year, end_date.month):
            months.append((y, m))
            m += 1
            if m > 12:
                m = 1
                y += 1

        result_months = []
        for year, month in months:
            month_actuals = actuals.get((year, month), {})

            # Roll up child actuals to parent if budget is on parent
            rolled_up: dict[int | None, int] = {}
            for cat_id, cents in month_actuals.items():
                if cat_id is not None:
                    cat = cat_map.get(cat_id)
                    if cat and cat.parent_id and cat.parent_id in parent_budget_ids:
                        # Roll up to parent
                        rolled_up[cat.parent_id] = rolled_up.get(cat.parent_id, 0) + cents
                        continue
                rolled_up[cat_id] = rolled_up.get(cat_id, 0) + cents

            # Merge budget items with actuals
            all_cat_ids = set(budget_items.keys()) | set(rolled_up.keys())
            items = []

            for cat_id in all_cat_ids:
                if cat_id is None:
                    continue
                budget_cents = budget_items.get(cat_id, 0)
                actual_cents = rolled_up.get(cat_id, 0)
                cat = cat_map.get(cat_id)
                cat_name = cat.name if cat else "Unknown"
                parent_id = cat.parent_id if cat else None

                # Determine if this is income based on budget sign or actual sign
                is_income = budget_cents > 0 if budget_cents != 0 else actual_cents > 0

                # Difference: positive = favorable
                if is_income:
                    difference = actual_cents - budget_cents
                else:
                    # For expenses (negative), less spending is favorable
                    difference = budget_cents - actual_cents

                items.append({
                    "category_id": cat_id,
                    "category_name": cat_name,
                    "parent_category_id": parent_id,
                    "budget_cents": budget_cents,
                    "actual_cents": actual_cents,
                    "difference_cents": difference,
                    "is_income": is_income,
                })

            # Sort: income first, then expenses
            items.sort(key=lambda x: (not x["is_income"], x["category_name"]))

            # Compute totals
            total_budget_income = sum(i["budget_cents"] for i in items if i["is_income"])
            total_actual_income = sum(i["actual_cents"] for i in items if i["is_income"])
            total_budget_expense = sum(i["budget_cents"] for i in items if not i["is_income"])
            total_actual_expense = sum(i["actual_cents"] for i in items if not i["is_income"])

            result_months.append({
                "year": year,
                "month": month,
                "items": items,
                "total_budget_income": total_budget_income,
                "total_actual_income": total_actual_income,
                "total_budget_expense": total_budget_expense,
                "total_actual_expense": total_actual_expense,
            })

        return {
            "budget_id": budget.id,
            "budget_name": budget.name,
            "months": result_months,
        }
