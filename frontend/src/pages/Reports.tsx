import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, startOfMonth, endOfMonth, addMonths, subMonths, startOfYear, parseISO } from 'date-fns'
import { useAccounts } from '../hooks/useAccounts'
import { useCategories } from '../hooks/useCategories'
import {
  useSpendingByCategory,
  useCategoryChildren,
  useSpendingByPayee,
  useSpendingTrends,
  useReportTransactions,
  ReportFilters,
  DrillDownFilters,
} from '../hooks/useReports'
import { Account, CategorySpendItem, PayeeSpendItem, MonthlySpendItem, Transaction, Category, BudgetVsActualResponse } from '../api/client'
import { useBudgets, useBudgetVsActual } from '../hooks/useBudgets'
import { formatCurrency } from '../utils/format'
import clsx from 'clsx'

const TABS = ['Category', 'Payee', 'Trends', 'Budget vs Actual'] as const
type Tab = (typeof TABS)[number]

type DateMode = 'month' | 'custom'

function getPresetRange(preset: string): { start: string; end: string } {
  const today = new Date()
  const thisMonthStart = startOfMonth(today)
  const thisMonthEnd = endOfMonth(today)
  switch (preset) {
    case 'this-month':
      return {
        start: format(thisMonthStart, 'yyyy-MM-dd'),
        end: format(thisMonthEnd, 'yyyy-MM-dd'),
      }
    case 'last-3':
      return {
        start: format(subMonths(thisMonthStart, 2), 'yyyy-MM-dd'),
        end: format(thisMonthEnd, 'yyyy-MM-dd'),
      }
    case 'ytd':
      return {
        start: format(startOfYear(today), 'yyyy-MM-dd'),
        end: format(thisMonthEnd, 'yyyy-MM-dd'),
      }
    case 'last-12':
      return {
        start: format(subMonths(thisMonthStart, 11), 'yyyy-MM-dd'),
        end: format(thisMonthEnd, 'yyyy-MM-dd'),
      }
    default:
      return {
        start: format(thisMonthStart, 'yyyy-MM-dd'),
        end: format(thisMonthEnd, 'yyyy-MM-dd'),
      }
  }
}

export default function Reports() {
  const navigate = useNavigate()
  const { data: accounts } = useAccounts()
  const { data: categories } = useCategories()

  // Date navigation
  const [dateMode, setDateMode] = useState<DateMode>('month')
  const [currentMonth, setCurrentMonth] = useState(() => {
    const saved = sessionStorage.getItem('reports-month')
    return saved ? startOfMonth(parseISO(saved)) : startOfMonth(new Date())
  })
  const [customStart, setCustomStart] = useState(() => format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [customEnd, setCustomEnd] = useState(() => format(endOfMonth(new Date()), 'yyyy-MM-dd'))

  const startDate =
    dateMode === 'month' ? format(currentMonth, 'yyyy-MM-dd') : customStart
  const endDate =
    dateMode === 'month' ? format(endOfMonth(currentMonth), 'yyyy-MM-dd') : customEnd

  const prevMonth = () => {
    setCurrentMonth((d) => {
      const next = subMonths(d, 1)
      sessionStorage.setItem('reports-month', format(next, 'yyyy-MM-dd'))
      return next
    })
  }
  const nextMonth = () => {
    setCurrentMonth((d) => {
      const next = addMonths(d, 1)
      sessionStorage.setItem('reports-month', format(next, 'yyyy-MM-dd'))
      return next
    })
  }

  const applyPreset = (preset: string) => {
    const { start, end } = getPresetRange(preset)
    setDateMode('custom')
    setCustomStart(start)
    setCustomEnd(end)
  }

  // Tab state
  const [tab, setTab] = useState<Tab>('Category')

  // Filters
  const [showFilters, setShowFilters] = useState(false)
  const [accountIds, setAccountIds] = useState<number[]>([])
  const [includeTransfers, setIncludeTransfers] = useState(false)

  // Drill-down
  const [drillDown, setDrillDown] = useState<DrillDownFilters | null>(null)
  const [drillDownLabel, setDrillDownLabel] = useState('')

  // Category expansion
  const [expandedCategoryId, setExpandedCategoryId] = useState<number | null>(null)

  const filters: ReportFilters = useMemo(
    () => ({
      startDate,
      endDate,
      accountIds: accountIds.length ? accountIds : undefined,
      includeTransfers,
      groupByParent: true,
    }),
    [startDate, endDate, accountIds, includeTransfers]
  )

  // Trends always fetches last 12 months regardless of current date selection
  const trendsFilters: ReportFilters = useMemo(() => {
    const today = new Date()
    return {
      startDate: format(subMonths(startOfMonth(today), 11), 'yyyy-MM-dd'),
      endDate: format(endOfMonth(today), 'yyyy-MM-dd'),
      accountIds: accountIds.length ? accountIds : undefined,
      includeTransfers,
    }
  }, [accountIds, includeTransfers])

  // Budget vs Actual
  const { data: budgets } = useBudgets()
  const [selectedBudgetId, setSelectedBudgetId] = useState<number | null>(null)
  // Auto-select first budget when loaded
  if (budgets && budgets.length > 0 && selectedBudgetId === null) {
    setSelectedBudgetId(budgets[0].id)
  }
  const budgetVsActual = useBudgetVsActual(
    tab === 'Budget vs Actual' ? selectedBudgetId : null,
    startDate,
    endDate,
  )

  const categoryReport = useSpendingByCategory(filters)
  const payeeReport = useSpendingByPayee(filters)
  const trendsReport = useSpendingTrends(trendsFilters)
  const childrenReport = useCategoryChildren(expandedCategoryId, filters)
  const drillDownTxs = useReportTransactions(drillDown)

  // Build category ID map for drill-down (to find children of a parent)
  const categoryChildMap = useMemo(() => {
    const map = new Map<number, number[]>()
    if (!categories) return map
    for (const cat of categories) {
      if (cat.parent_id) {
        const existing = map.get(cat.parent_id) || []
        existing.push(cat.id)
        map.set(cat.parent_id, existing)
      }
    }
    return map
  }, [categories])

  // Summary from trends data
  const periodTotals = useMemo(() => {
    const data = categoryReport.data
    if (!data) return { income: 0, expense: 0 }
    let income = 0
    let expense = 0
    for (const item of data) {
      income += item.income_cents
      expense += item.expense_cents
    }
    return { income, expense }
  }, [categoryReport.data])

  const openCategoryDrillDown = (item: CategorySpendItem, side: 'expense' | 'income') => {
    const amountSign = side === 'expense' ? 'negative' as const : 'positive' as const
    if (item.category_id === null) {
      setDrillDown({
        startDate,
        endDate,
        uncategorized: true,
        amountSign,
        accountIds: accountIds.length ? accountIds : undefined,
        includeTransfers,
      })
    } else {
      const childIds = categoryChildMap.get(item.category_id) || []
      setDrillDown({
        startDate,
        endDate,
        categoryIds: [item.category_id, ...childIds],
        amountSign,
        accountIds: accountIds.length ? accountIds : undefined,
        includeTransfers,
      })
    }
    setDrillDownLabel(item.category_name)
  }

  const openPayeeDrillDown = (item: PayeeSpendItem) => {
    setDrillDown({
      startDate,
      endDate,
      payeeName: item.payee_name,
      accountIds: accountIds.length ? accountIds : undefined,
      includeTransfers,
    })
    setDrillDownLabel(item.payee_name)
  }

  const openTrendDrillDown = (item: MonthlySpendItem) => {
    const monthStart = format(new Date(item.year, item.month - 1, 1), 'yyyy-MM-dd')
    const monthEnd = format(endOfMonth(new Date(item.year, item.month - 1, 1)), 'yyyy-MM-dd')
    setDrillDown({
      startDate: monthStart,
      endDate: monthEnd,
      accountIds: accountIds.length ? accountIds : undefined,
      includeTransfers,
    })
    setDrillDownLabel(format(new Date(item.year, item.month - 1, 1), 'MMMM yyyy'))
  }

  const closeDrillDown = () => {
    setDrillDown(null)
    setDrillDownLabel('')
  }

  // Close drill-down when switching tabs
  const handleTabChange = (newTab: Tab) => {
    setTab(newTab)
    closeDrillDown()
    setExpandedCategoryId(null)
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Reports</h1>
      </div>

      {/* Date Navigation */}
      <div className="bg-surface rounded-lg border border-border p-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          {dateMode === 'month' ? (
            <div className="flex items-center gap-2">
              <button onClick={prevMonth} className="p-2 hover:bg-hover rounded">
                &larr;
              </button>
              <span className="px-3 py-1 text-sm font-medium w-36 text-center">
                {format(currentMonth, 'MMMM yyyy')}
              </span>
              <button onClick={nextMonth} className="p-2 hover:bg-hover rounded">
                &rarr;
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="px-2 py-1 text-sm border border-input-border rounded bg-input"
              />
              <span className="text-content-secondary text-sm">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="px-2 py-1 text-sm border border-input-border rounded bg-input"
              />
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => {
                setDateMode(dateMode === 'month' ? 'custom' : 'month')
                closeDrillDown()
              }}
              className="px-3 py-1 text-xs border border-border rounded hover:bg-hover"
            >
              {dateMode === 'month' ? 'Custom Range' : 'Month View'}
            </button>
            <span className="text-content-tertiary text-xs">|</span>
            <button
              onClick={() => applyPreset('this-month')}
              className="px-2 py-1 text-xs border border-border rounded hover:bg-hover"
            >
              This Month
            </button>
            <button
              onClick={() => applyPreset('last-3')}
              className="px-2 py-1 text-xs border border-border rounded hover:bg-hover"
            >
              Last 3 Mo
            </button>
            <button
              onClick={() => applyPreset('ytd')}
              className="px-2 py-1 text-xs border border-border rounded hover:bg-hover"
            >
              YTD
            </button>
            <button
              onClick={() => applyPreset('last-12')}
              className="px-2 py-1 text-xs border border-border rounded hover:bg-hover"
            >
              Last 12 Mo
            </button>
            <span className="text-content-tertiary text-xs">|</span>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="px-2 py-1 text-xs border border-border rounded hover:bg-hover"
            >
              Filters {showFilters ? '\u25B2' : '\u25BC'}
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="mt-3 pt-3 border-t border-border flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-xs text-content-secondary">Accounts:</label>
              <select
                multiple
                value={accountIds.map(String)}
                onChange={(e) => {
                  const ids = Array.from(e.target.selectedOptions).map((o) => Number(o.value))
                  setAccountIds(ids)
                }}
                className="px-2 py-1 text-xs border border-input-border rounded bg-input min-w-[140px]"
                size={Math.min(accounts?.length || 2, 4)}
              >
                {accounts?.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
              {accountIds.length > 0 && (
                <button
                  onClick={() => setAccountIds([])}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                id="includeTransfersReport"
                type="checkbox"
                checked={includeTransfers}
                onChange={(e) => setIncludeTransfers(e.target.checked)}
              />
              <label htmlFor="includeTransfersReport" className="text-xs text-content-secondary">
                Include transfers
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-surface rounded-lg border border-border p-4">
          <div className="text-xs text-content-secondary mb-1">Income</div>
          <div className="text-lg font-semibold text-green-600">
            {formatCurrency(periodTotals.income)}
          </div>
        </div>
        <div className="bg-surface rounded-lg border border-border p-4">
          <div className="text-xs text-content-secondary mb-1">Expenses</div>
          <div className="text-lg font-semibold text-red-600">
            {formatCurrency(periodTotals.expense)}
          </div>
        </div>
        <div className="bg-surface rounded-lg border border-border p-4">
          <div className="text-xs text-content-secondary mb-1">Net</div>
          <div
            className={clsx(
              'text-lg font-semibold',
              periodTotals.income - periodTotals.expense >= 0 ? 'text-green-600' : 'text-red-600'
            )}
          >
            {formatCurrency(periodTotals.income - periodTotals.expense)}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {TABS.map((item) => (
          <button
            key={item}
            onClick={() => handleTabChange(item)}
            className={clsx(
              'px-4 py-2 rounded border',
              tab === item
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-surface text-content border-border hover:bg-hover'
            )}
          >
            {item}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'Category' && (
        <CategoryTab
          data={categoryReport.data}
          isLoading={categoryReport.isLoading}
          children_data={childrenReport.data}
          childrenLoading={childrenReport.isLoading}
          expandedCategoryId={expandedCategoryId}
          onExpand={(id) => {
            setExpandedCategoryId(expandedCategoryId === id ? null : id)
            closeDrillDown()
          }}
          onDrillDown={openCategoryDrillDown}
          categoryChildMap={categoryChildMap}
        />
      )}

      {tab === 'Payee' && (
        <PayeeTab
          data={payeeReport.data}
          isLoading={payeeReport.isLoading}
          onDrillDown={openPayeeDrillDown}
        />
      )}

      {tab === 'Trends' && (
        <TrendsTab
          data={trendsReport.data}
          isLoading={trendsReport.isLoading}
          onDrillDown={openTrendDrillDown}
        />
      )}

      {tab === 'Budget vs Actual' && (
        <BudgetVsActualTab
          budgets={budgets || []}
          selectedBudgetId={selectedBudgetId}
          onSelectBudget={setSelectedBudgetId}
          data={budgetVsActual.data}
          isLoading={budgetVsActual.isLoading}
          onDrillDown={(categoryIds, year, month, accountIds) => {
            const monthStart = format(new Date(year, month - 1, 1), 'yyyy-MM-dd')
            const monthEnd = format(endOfMonth(new Date(year, month - 1, 1)), 'yyyy-MM-dd')
            setDrillDown({
              startDate: monthStart,
              endDate: monthEnd,
              categoryIds,
              accountIds,
            })
            setDrillDownLabel(`Budget vs Actual - ${format(new Date(year, month - 1, 1), 'MMMM yyyy')}`)
          }}
        />
      )}

      {/* Drill-down panel */}
      {drillDown && (
        <DrillDownPanel
          label={drillDownLabel}
          transactions={drillDownTxs.data}
          isLoading={drillDownTxs.isLoading}
          accounts={accounts || []}
          categories={categories || []}
          onClose={closeDrillDown}
          onNavigateToLedger={(accountId, postedDate) => {
            const monthStart = format(startOfMonth(parseISO(postedDate)), 'yyyy-MM-dd')
            sessionStorage.setItem('ledger-month', monthStart)
            navigate(`/accounts/${accountId}`)
          }}
        />
      )}
    </div>
  )
}

// --- Category Tab ---

function CategoryTab({
  data,
  isLoading,
  children_data,
  childrenLoading,
  expandedCategoryId,
  onExpand,
  onDrillDown,
  categoryChildMap,
}: {
  data: CategorySpendItem[] | undefined
  isLoading: boolean
  children_data: CategorySpendItem[] | undefined
  childrenLoading: boolean
  expandedCategoryId: number | null
  onExpand: (id: number) => void
  onDrillDown: (item: CategorySpendItem, side: 'expense' | 'income') => void
  categoryChildMap: Map<number, number[]>
}) {
  const expenseItems = useMemo(
    () => (data ?? []).filter((c) => c.expense_cents > 0).sort((a, b) => b.expense_cents - a.expense_cents),
    [data]
  )
  const incomeItems = useMemo(
    () => (data ?? []).filter((c) => c.income_cents > 0).sort((a, b) => b.income_cents - a.income_cents),
    [data]
  )
  const maxExpense = Math.max(0, ...expenseItems.map((c) => c.expense_cents))
  const maxIncome = Math.max(0, ...incomeItems.map((c) => c.income_cents))

  // Filter children to only show the relevant side
  const expenseChildren = useMemo(
    () => (children_data ?? []).filter((c) => c.expense_cents > 0).sort((a, b) => b.expense_cents - a.expense_cents),
    [children_data]
  )
  const incomeChildren = useMemo(
    () => (children_data ?? []).filter((c) => c.income_cents > 0).sort((a, b) => b.income_cents - a.income_cents),
    [children_data]
  )

  if (isLoading) return <div className="text-content-secondary p-4">Loading...</div>
  if (!data || data.length === 0)
    return <div className="text-content-secondary p-4">No data for this period.</div>

  const renderRow = (
    item: CategorySpendItem,
    amount: number,
    maxVal: number,
    barColor: string,
    amountColor: string,
    prefix: string,
    children: CategorySpendItem[],
    childBarColor: string,
    side: 'expense' | 'income',
  ) => {
    const hasChildren = item.category_id ? (categoryChildMap.get(item.category_id)?.length ?? 0) > 0 : false
    const isExpanded = expandedCategoryId === item.category_id

    return (
      <div key={item.category_id ?? 'uncategorized'}>
        <div
          className="grid grid-cols-12 gap-2 items-center py-1.5 px-2 rounded hover:bg-hover cursor-pointer"
          onClick={() => {
            if (hasChildren && item.category_id) {
              onExpand(item.category_id)
            } else {
              onDrillDown(item, side)
            }
          }}
        >
          <div className="col-span-3 text-sm font-medium text-content-secondary truncate flex items-center gap-1">
            {hasChildren && (
              <span className="text-xs text-content-tertiary">{isExpanded ? '\u25BC' : '\u25B6'}</span>
            )}
            {item.category_name}
          </div>
          <div className="col-span-7">
            <div className="w-full bg-surface-tertiary rounded h-2.5">
              <div
                className={`h-2.5 rounded ${barColor}`}
                style={{ width: `${maxVal ? (amount / maxVal) * 100 : 0}%` }}
              />
            </div>
          </div>
          <div className={`col-span-2 text-right text-sm font-mono ${amountColor}`}>
            {prefix}{formatCurrency(amount)}
          </div>
        </div>

        {isExpanded && (
          <div className="ml-6 border-l border-border pl-2">
            {childrenLoading ? (
              <div className="text-xs text-content-tertiary py-1 px-2">Loading...</div>
            ) : children.length > 0 ? (
              children.map((child) => {
                const childAmount = prefix === '-' ? child.expense_cents : child.income_cents
                return (
                  <div
                    key={child.category_id ?? 'unc'}
                    className="grid grid-cols-12 gap-2 items-center py-1 px-2 rounded hover:bg-hover cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDrillDown(child, side)
                    }}
                  >
                    <div className="col-span-3 text-xs text-content-secondary truncate">
                      {child.category_name}
                    </div>
                    <div className="col-span-7">
                      <div className="w-full bg-surface-tertiary rounded h-2">
                        <div
                          className={`h-2 rounded ${childBarColor}`}
                          style={{ width: `${maxVal ? (childAmount / maxVal) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                    <div className={`col-span-2 text-right text-xs font-mono ${amountColor}`}>
                      {prefix}{formatCurrency(childAmount)}
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="text-xs text-content-tertiary py-1 px-2">No child categories.</div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {expenseItems.length > 0 && (
        <div className="bg-surface rounded-lg border border-border p-4 space-y-1">
          <h2 className="text-lg font-semibold mb-3">Spending by Category</h2>
          {expenseItems.map((item) =>
            renderRow(item, item.expense_cents, maxExpense, 'bg-blue-500', 'text-red-600', '-', expenseChildren, 'bg-blue-400', 'expense')
          )}
        </div>
      )}

      {incomeItems.length > 0 && (
        <div className="bg-surface rounded-lg border border-border p-4 space-y-1">
          <h2 className="text-lg font-semibold mb-3">Income by Category</h2>
          {incomeItems.map((item) =>
            renderRow(item, item.income_cents, maxIncome, 'bg-green-500', 'text-green-600', '', incomeChildren, 'bg-green-400', 'income')
          )}
        </div>
      )}

      {expenseItems.length === 0 && incomeItems.length === 0 && (
        <div className="text-content-secondary p-4">No data for this period.</div>
      )}
    </div>
  )
}

// --- Payee Tab ---

function PayeeTab({
  data,
  isLoading,
  onDrillDown,
}: {
  data: PayeeSpendItem[] | undefined
  isLoading: boolean
  onDrillDown: (item: PayeeSpendItem) => void
}) {
  if (isLoading) return <div className="text-content-secondary p-4">Loading...</div>
  if (!data || data.length === 0)
    return <div className="text-content-secondary p-4">No data for this period.</div>

  const topExpenses = data
    .filter((p) => p.expense_cents > 0)
    .sort((a, b) => b.expense_cents - a.expense_cents)
    .slice(0, 15)
  const topIncome = data
    .filter((p) => p.income_cents > 0)
    .sort((a, b) => b.income_cents - a.income_cents)
    .slice(0, 15)
  const maxExpense = Math.max(0, ...topExpenses.map((p) => p.expense_cents))
  const maxIncome = Math.max(0, ...topIncome.map((p) => p.income_cents))

  return (
    <div className="space-y-4">
      {topExpenses.length > 0 && (
        <div className="bg-surface rounded-lg border border-border p-4">
          <h2 className="text-lg font-semibold mb-3">Top Expenses by Payee</h2>
          <div className="space-y-1">
            {topExpenses.map((item) => (
              <div
                key={item.payee_name}
                className="grid grid-cols-12 gap-2 items-center py-1.5 px-2 rounded hover:bg-hover cursor-pointer"
                onClick={() => onDrillDown(item)}
              >
                <div className="col-span-4 text-sm text-content-secondary truncate">
                  {item.payee_name}
                </div>
                <div className="col-span-6">
                  <div className="w-full bg-surface-tertiary rounded h-2.5">
                    <div
                      className="h-2.5 rounded bg-blue-500"
                      style={{ width: `${maxExpense ? (item.expense_cents / maxExpense) * 100 : 0}%` }}
                    />
                  </div>
                </div>
                <div className="col-span-2 text-sm text-right text-red-600 font-mono">
                  -{formatCurrency(item.expense_cents)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {topIncome.length > 0 && (
        <div className="bg-surface rounded-lg border border-border p-4">
          <h2 className="text-lg font-semibold mb-3">Top Income by Payee</h2>
          <div className="space-y-1">
            {topIncome.map((item) => (
              <div
                key={item.payee_name}
                className="grid grid-cols-12 gap-2 items-center py-1.5 px-2 rounded hover:bg-hover cursor-pointer"
                onClick={() => onDrillDown(item)}
              >
                <div className="col-span-4 text-sm text-content-secondary truncate">
                  {item.payee_name}
                </div>
                <div className="col-span-6">
                  <div className="w-full bg-surface-tertiary rounded h-2.5">
                    <div
                      className="h-2.5 rounded bg-green-500"
                      style={{ width: `${maxIncome ? (item.income_cents / maxIncome) * 100 : 0}%` }}
                    />
                  </div>
                </div>
                <div className="col-span-2 text-sm text-right text-green-600 font-mono">
                  {formatCurrency(item.income_cents)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// --- Trends Tab ---

function TrendsTab({
  data,
  isLoading,
  onDrillDown,
}: {
  data: MonthlySpendItem[] | undefined
  isLoading: boolean
  onDrillDown: (item: MonthlySpendItem) => void
}) {
  if (isLoading) return <div className="text-content-secondary p-4">Loading...</div>
  if (!data || data.length === 0)
    return <div className="text-content-secondary p-4">No data for this period.</div>

  const maxVal = Math.max(
    0,
    ...data.map((m) => Math.max(m.income_cents, m.expense_cents))
  )

  return (
    <div className="bg-surface rounded-lg border border-border p-4">
      <h2 className="text-lg font-semibold mb-3">Monthly Trends</h2>
      <div className="flex items-stretch gap-1 h-52">
        <div className="w-16 shrink-0" />
        {data.map((item) => {
          const incomeH = maxVal ? (item.income_cents / maxVal) * 100 : 0
          const expenseH = maxVal ? (item.expense_cents / maxVal) * 100 : 0
          const net = item.income_cents - item.expense_cents
          const label = format(new Date(item.year, item.month - 1, 1), 'MMM yyyy')

          return (
            <div
              key={`${item.year}-${item.month}`}
              className="flex-1 flex flex-col items-center cursor-pointer group"
              onClick={() => onDrillDown(item)}
              title={`${label}\nIncome: ${formatCurrency(item.income_cents)}\nExpenses: ${formatCurrency(item.expense_cents)}\nNet: ${formatCurrency(net)}`}
            >
              <div className="w-full flex-1 flex items-end justify-center gap-px">
                <div
                  className="flex-1 bg-green-500 rounded-t group-hover:bg-green-400 transition-colors max-w-[20px]"
                  style={{ height: `${incomeH}%`, minHeight: item.income_cents > 0 ? '2px' : '0' }}
                />
                <div
                  className="flex-1 bg-blue-500 rounded-t group-hover:bg-blue-400 transition-colors max-w-[20px]"
                  style={{ height: `${expenseH}%`, minHeight: item.expense_cents > 0 ? '2px' : '0' }}
                />
              </div>
              <div className="text-[10px] text-content-tertiary mt-1.5 text-center leading-tight">
                {format(new Date(item.year, item.month - 1, 1), 'MMM')}
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-3 border-t border-border pt-2 text-[11px] font-mono space-y-0.5">
        <div className="flex gap-1">
          <div className="w-16 shrink-0 pr-2 text-content-secondary font-sans whitespace-nowrap">
            <span className="inline-block w-2 h-2 rounded bg-green-500 mr-1" />Income
          </div>
          {data.map((item) => (
            <div key={`i-${item.year}-${item.month}`} className="flex-1 text-right text-green-600">
              {formatCurrency(item.income_cents)}
            </div>
          ))}
        </div>
        <div className="flex gap-1">
          <div className="w-16 shrink-0 pr-2 text-content-secondary font-sans whitespace-nowrap">
            <span className="inline-block w-2 h-2 rounded bg-blue-500 mr-1" />Expenses
          </div>
          {data.map((item) => (
            <div key={`e-${item.year}-${item.month}`} className="flex-1 text-right text-red-600">
              {formatCurrency(item.expense_cents)}
            </div>
          ))}
        </div>
        <div className="flex gap-1 border-t border-border pt-0.5">
          <div className="w-16 shrink-0 pr-2 text-content-secondary font-sans whitespace-nowrap">Net</div>
          {data.map((item) => {
            const net = item.income_cents - item.expense_cents
            return (
              <div key={`n-${item.year}-${item.month}`} className={clsx('flex-1 text-right', net >= 0 ? 'text-green-600' : 'text-red-600')}>
                {net >= 0 ? '+' : ''}{formatCurrency(net)}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// --- Drill-down Panel ---

function DrillDownPanel({
  label,
  transactions,
  isLoading,
  accounts,
  categories,
  onClose,
  onNavigateToLedger,
}: {
  label: string
  transactions: Transaction[] | undefined
  isLoading: boolean
  accounts: Account[]
  categories: Category[]
  onClose: () => void
  onNavigateToLedger: (accountId: number, postedDate: string) => void
}) {
  const accountMap = useMemo(() => {
    const map = new Map<number, string>()
    for (const a of accounts) map.set(a.id, a.name)
    return map
  }, [accounts])

  const categoryMap = useMemo(() => {
    const map = new Map<number, string>()
    if (!categories) return map
    const byId = new Map(categories.map((c) => [c.id, c]))
    for (const cat of categories) {
      if (cat.parent_id) {
        const parent = byId.get(cat.parent_id)
        map.set(cat.id, parent ? `${parent.name} > ${cat.name}` : cat.name)
      } else {
        map.set(cat.id, cat.name)
      }
    }
    return map
  }, [categories])

  return (
    <div className="bg-surface rounded-lg border border-border p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">
          Transactions: {label}
          {transactions && (
            <span className="text-content-tertiary font-normal ml-2">
              ({transactions.length} transaction{transactions.length !== 1 ? 's' : ''})
            </span>
          )}
        </h3>
        <button
          onClick={onClose}
          className="p-1 hover:bg-hover rounded text-content-tertiary hover:text-content"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {isLoading ? (
        <div className="text-content-secondary text-sm">Loading transactions...</div>
      ) : transactions && transactions.length > 0 ? (
        <div className="overflow-auto max-h-80">
          <table className="w-full text-sm">
            <thead className="bg-surface-secondary">
              <tr className="text-left text-content-secondary">
                <th className="px-3 py-1.5">Date</th>
                <th className="px-3 py-1.5">Account</th>
                <th className="px-3 py-1.5">Payee</th>
                <th className="px-3 py-1.5">Category</th>
                <th className="px-3 py-1.5 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {transactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-hover">
                  <td className="px-3 py-1.5">{format(parseISO(tx.posted_date), 'MM/dd/yyyy')}</td>
                  <td className="px-3 py-1.5">
                    <button
                      className="text-blue-600 hover:underline"
                      onClick={() => onNavigateToLedger(tx.account_id, tx.posted_date)}
                    >
                      {accountMap.get(tx.account_id) || '—'}
                    </button>
                  </td>
                  <td className="px-3 py-1.5">{tx.display_name || tx.payee_raw || '—'}</td>
                  <td className="px-3 py-1.5 text-content-secondary">
                    {tx.category_id ? categoryMap.get(tx.category_id) || '—' : '—'}
                  </td>
                  <td
                    className={clsx(
                      'px-3 py-1.5 text-right font-mono',
                      tx.amount_cents >= 0 ? 'text-green-600' : 'text-red-600'
                    )}
                  >
                    {formatCurrency(tx.amount_cents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-content-secondary text-sm">No transactions found.</div>
      )}
    </div>
  )
}

// --- Budget vs Actual Tab ---

function BudgetVsActualTab({
  budgets,
  selectedBudgetId,
  onSelectBudget,
  data,
  isLoading,
  onDrillDown,
}: {
  budgets: { id: number; name: string; account_ids: number[] }[]
  selectedBudgetId: number | null
  onSelectBudget: (id: number) => void
  data: BudgetVsActualResponse | undefined
  isLoading: boolean
  onDrillDown: (categoryIds: number[], year: number, month: number, accountIds: number[]) => void
}) {
  if (budgets.length === 0) {
    return <div className="text-content-secondary p-4">No budgets created yet. Create one on the Budget page.</div>
  }

  const selectedBudget = budgets.find((b) => b.id === selectedBudgetId)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="text-sm text-content-secondary">Budget:</label>
        <select
          value={selectedBudgetId ?? ''}
          onChange={(e) => onSelectBudget(Number(e.target.value))}
          className="px-3 py-1.5 text-sm border border-input-border rounded bg-input"
        >
          {budgets.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </div>

      {isLoading && <div className="text-content-secondary p-4">Loading...</div>}

      {data && data.months.length > 0 && (
        <div className="bg-surface rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-secondary">
                <th className="px-3 py-2 text-left font-semibold sticky left-0 bg-surface-secondary z-10 min-w-[160px]">Category</th>
                {data.months.map((m) => (
                  <th key={`${m.year}-${m.month}`} className="text-center font-semibold border-l border-border" colSpan={3}>
                    <div className="px-2 py-1">{format(new Date(m.year, m.month - 1, 1), 'MMM yyyy')}</div>
                  </th>
                ))}
              </tr>
              <tr className="text-xs text-content-tertiary">
                <th className="px-3 py-1 text-left font-normal sticky left-0 bg-surface z-10"></th>
                {data.months.map((m) => (
                  <React.Fragment key={`${m.year}-${m.month}-sub`}>
                    <th className="px-2 py-1 text-right font-normal border-l border-border">Budget</th>
                    <th className="px-2 py-1 text-right font-normal">Actual</th>
                    <th className="px-2 py-1 text-right font-normal">+/-</th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Income section */}
              <tr className="bg-surface-secondary">
                <td className="px-3 py-1.5 font-semibold text-content-secondary sticky left-0 bg-surface-secondary z-10" colSpan={1 + data.months.length * 3}>
                  INCOME
                </td>
              </tr>
              {renderBudgetVsActualRows(data, true, selectedBudget?.account_ids || [], onDrillDown)}

              {/* Income totals */}
              <tr className="font-semibold border-t border-border">
                <td className="px-3 py-1.5 sticky left-0 bg-surface z-10">Total Income</td>
                {data.months.map((m) => (
                  <React.Fragment key={`income-total-${m.year}-${m.month}`}>
                    <td className="px-2 py-1.5 text-right font-mono border-l border-border">{formatCurrency(m.total_budget_income)}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{formatCurrency(m.total_actual_income)}</td>
                    <td className={clsx('px-2 py-1.5 text-right font-mono', m.total_actual_income - m.total_budget_income >= 0 ? 'text-green-600' : 'text-red-600')}>
                      {m.total_actual_income - m.total_budget_income >= 0 ? '+' : ''}{formatCurrency(m.total_actual_income - m.total_budget_income)}
                    </td>
                  </React.Fragment>
                ))}
              </tr>

              {/* Expense section */}
              <tr className="bg-surface-secondary">
                <td className="px-3 py-1.5 font-semibold text-content-secondary sticky left-0 bg-surface-secondary z-10" colSpan={1 + data.months.length * 3}>
                  EXPENSES
                </td>
              </tr>
              {renderBudgetVsActualRows(data, false, selectedBudget?.account_ids || [], onDrillDown)}

              {/* Expense totals */}
              <tr className="font-semibold border-t border-border">
                <td className="px-3 py-1.5 sticky left-0 bg-surface z-10">Total Expenses</td>
                {data.months.map((m) => (
                  <React.Fragment key={`expense-total-${m.year}-${m.month}`}>
                    <td className="px-2 py-1.5 text-right font-mono border-l border-border">{formatCurrency(m.total_budget_expense)}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{formatCurrency(m.total_actual_expense)}</td>
                    <td className={clsx('px-2 py-1.5 text-right font-mono', m.total_budget_expense - m.total_actual_expense >= 0 ? 'text-green-600' : 'text-red-600')}>
                      {m.total_budget_expense - m.total_actual_expense >= 0 ? '+' : ''}{formatCurrency(m.total_budget_expense - m.total_actual_expense)}
                    </td>
                  </React.Fragment>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {data && data.months.length === 0 && (
        <div className="text-content-secondary p-4">No data for this period.</div>
      )}
    </div>
  )
}

function renderBudgetVsActualRows(
  data: BudgetVsActualResponse,
  isIncome: boolean,
  accountIds: number[],
  onDrillDown: (categoryIds: number[], year: number, month: number, accountIds: number[]) => void,
) {
  // Collect unique category names across all months for this section
  const categoryMap = new Map<number, string>()
  for (const m of data.months) {
    for (const item of m.items) {
      if (item.is_income === isIncome && item.category_id !== null) {
        categoryMap.set(item.category_id, item.category_name)
      }
    }
  }
  const categoryIds = Array.from(categoryMap.keys())
  categoryIds.sort((a, b) => (categoryMap.get(a) || '').localeCompare(categoryMap.get(b) || ''))

  return categoryIds.map((catId) => {
    const catName = categoryMap.get(catId) || 'Unknown'
    const hasBudget = data.months.some((m) =>
      m.items.some((i) => i.category_id === catId && i.budget_cents !== 0)
    )

    return (
      <tr key={catId} className={clsx('hover:bg-hover', !hasBudget && 'opacity-60')}>
        <td className={clsx('px-3 py-1.5 sticky left-0 bg-surface z-10', !hasBudget && 'italic')}>
          {!hasBudget && <span className="text-content-tertiary text-xs mr-1">(unbudgeted)</span>}
          {catName}
        </td>
        {data.months.map((m) => {
          const item = m.items.find((i) => i.category_id === catId)
          const budget = item?.budget_cents ?? 0
          const actual = item?.actual_cents ?? 0
          const diff = item?.difference_cents ?? 0

          return (
            <React.Fragment key={`${catId}-${m.year}-${m.month}`}>
              <td className="px-2 py-1.5 text-right font-mono text-xs border-l border-border">
                {budget !== 0 ? formatCurrency(budget) : <span className="text-content-tertiary">—</span>}
              </td>
              <td
                className="px-2 py-1.5 text-right font-mono text-xs cursor-pointer hover:underline"
                onClick={() => onDrillDown([catId], m.year, m.month, accountIds)}
              >
                {actual !== 0 ? formatCurrency(actual) : <span className="text-content-tertiary">—</span>}
              </td>
              <td className={clsx('px-2 py-1.5 text-right font-mono text-xs', diff >= 0 ? 'text-green-600' : 'text-red-600')}>
                {diff !== 0 ? `${diff > 0 ? '+' : ''}${formatCurrency(diff)}` : <span className="text-content-tertiary">—</span>}
              </td>
            </React.Fragment>
          )
        })}
      </tr>
    )
  })
}
