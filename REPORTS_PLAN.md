# Spending Reports and Graphs Plan

Last updated: 2026-02-07

## Goals
- Deliver core spending reports that match the ledger-first workflow.
- Provide clear category/payee insights with drill-down to transactions.
- Keep filters consistent across all reports.

## Scope (MVP)
- Spending by Category report with chart + table + drill-down.
- Spending Trends report with monthly totals and optional category stacks.
- Spending by Payee report with chart + table + drill-down.
- Shared filter bar: date range, accounts, categories, include transfers toggle.

## Out of Scope (Phase 2)
- Cash flow report (income vs expense by month).
- Sankey diagram or advanced flow visualizations.

## Milestones and Tasks

### 1. Requirements and UX Spec
1. Define the report data contract for each report.
2. Specify filter behavior and defaults.
3. Define drill-down UX to ledger view or modal transaction list.
4. Choose chart library (reuse existing if present).

### 2. Backend Data API
1. Add report query services for:
   - category totals
   - payee totals
   - monthly totals (with optional category split)
2. Ensure transfers can be excluded by default.
3. Ensure forecast transactions are excluded from reports.
4. Add API routes and schemas.
5. Add unit tests for report queries.

### 3. Frontend Report Shell
1. Add Reports route and navigation entry.
2. Implement shared filter bar and state management.
3. Wire filter state to report queries.

### 4. Spending by Category Report
1. Implement chart (pie/donut) and table.
2. Add drill-down into transactions.
3. Validate totals match ledger filters.

### 5. Spending Trends Report
1. Implement monthly bar chart with totals.
2. Optional category stack toggle.
3. Validate date range handling.

### 6. Spending by Payee Report
1. Implement bar chart and table.
2. Add drill-down into transactions.
3. Validate sorting and top-N behavior.

### 7. QA and Polish
1. Cross-check totals vs ledger for multiple accounts and months.
2. Verify filter combinations and empty states.
3. Add loading, error, and no-data UI states.

## Acceptance Criteria
- Reports exclude forecast transactions and exclude transfers by default.
- Filters persist across report tabs during a session.
- Drill-down returns the same transactions as the ledger for matching filters.
- Performance is acceptable for multi-month ranges.

## Open Questions
- Preferred chart library for consistency with current UI?
- Drill-down target: ledger view or inline transaction table?
- Default date range: current month vs last 3 months?

## Progress Tracking
- [x] Requirements and UX Spec
- [x] Backend Data API
- [x] Frontend Report Shell
- [x] Spending by Category Report
- [x] Spending Trends Report
- [x] Spending by Payee Report
- [ ] QA and Polish
