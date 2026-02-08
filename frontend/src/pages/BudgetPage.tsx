import { useState, useMemo, useEffect } from 'react'
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns'
import { useAccounts } from '../hooks/useAccounts'
import { useCategories } from '../hooks/useCategories'
import {
  useBudgets,
  useBudget,
  useCreateBudget,
  useUpdateBudget,
  useDeleteBudget,
  useAutoPopulateBudget,
  useBudgetVsActual,
} from '../hooks/useBudgets'
import { Budget, Category } from '../api/client'
import { formatCurrency, parseCurrency } from '../utils/format'
import clsx from 'clsx'

export default function BudgetPage() {
  const { data: budgets } = useBudgets()
  const { data: accounts } = useAccounts()
  const { data: categories } = useCategories()

  const [selectedBudgetId, setSelectedBudgetId] = useState<number | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showNewForm, setShowNewForm] = useState(false)

  // Month navigation
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()))
  const startDate = format(currentMonth, 'yyyy-MM-dd')
  const endDate = format(endOfMonth(currentMonth), 'yyyy-MM-dd')

  // Auto-select first budget
  useEffect(() => {
    if (budgets && budgets.length > 0 && selectedBudgetId === null) {
      setSelectedBudgetId(budgets[0].id)
    }
  }, [budgets, selectedBudgetId])

  const { data: budget } = useBudget(selectedBudgetId)
  const vsActual = useBudgetVsActual(selectedBudgetId, startDate, endDate)

  const prevMonth = () => setCurrentMonth((d) => subMonths(d, 1))
  const nextMonth = () => setCurrentMonth((d) => addMonths(d, 1))

  const hasBudgets = budgets && budgets.length > 0

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Budget</h1>
          {hasBudgets && (
            <select
              value={selectedBudgetId ?? ''}
              onChange={(e) => setSelectedBudgetId(Number(e.target.value))}
              className="px-3 py-1.5 text-sm border border-input-border rounded bg-input"
            >
              {budgets.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasBudgets && (
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="px-3 py-1.5 text-sm border border-border rounded hover:bg-hover"
            >
              Settings
            </button>
          )}
          <button
            onClick={() => setShowNewForm(!showNewForm)}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            New Budget
          </button>
        </div>
      </div>

      {/* New Budget Form */}
      {showNewForm && (
        <NewBudgetForm
          accounts={accounts || []}
          onCreated={(id) => {
            setSelectedBudgetId(id)
            setShowNewForm(false)
          }}
          onCancel={() => setShowNewForm(false)}
        />
      )}

      {/* Settings Panel */}
      {showSettings && budget && (
        <BudgetSettings
          budget={budget}
          accounts={accounts || []}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* Month Navigation */}
      {hasBudgets && (
        <div className="bg-surface rounded-lg border border-border p-4">
          <div className="flex items-center gap-2">
            <button onClick={prevMonth} className="p-2 hover:bg-hover rounded">&larr;</button>
            <span className="px-3 py-1 text-sm font-medium w-36 text-center">
              {format(currentMonth, 'MMMM yyyy')}
            </span>
            <button onClick={nextMonth} className="p-2 hover:bg-hover rounded">&rarr;</button>
          </div>
        </div>
      )}

      {/* Budget Table */}
      {vsActual.data && budget && categories && (
        <BudgetMonthTable
          budget={budget}
          month={vsActual.data.months[0]}
          categories={categories}
        />
      )}

      {!hasBudgets && !showNewForm && (
        <div className="bg-surface rounded-lg border border-border p-8 text-center text-content-secondary">
          <p className="mb-2">No budgets yet.</p>
          <button
            onClick={() => setShowNewForm(true)}
            className="text-blue-600 hover:underline"
          >
            Create your first budget
          </button>
        </div>
      )}
    </div>
  )
}

// --- New Budget Form ---

function NewBudgetForm({
  accounts,
  onCreated,
  onCancel,
}: {
  accounts: { id: number; name: string }[]
  onCreated: (id: number) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [selectedAccounts, setSelectedAccounts] = useState<number[]>([])
  const createBudget = useCreateBudget()

  const toggleAccount = (id: number) => {
    setSelectedAccounts((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    )
  }

  const handleSubmit = () => {
    if (!name.trim()) return
    createBudget.mutate(
      { name: name.trim(), account_ids: selectedAccounts },
      { onSuccess: (b) => onCreated(b.id) }
    )
  }

  return (
    <div className="bg-surface rounded-lg border border-border p-4 space-y-3">
      <h2 className="text-lg font-semibold">New Budget</h2>
      <div>
        <label className="block text-sm text-content-secondary mb-1">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Monthly Budget"
          className="w-full px-3 py-2 border border-input-border rounded bg-input text-sm"
          autoFocus
        />
      </div>
      <div>
        <label className="block text-sm text-content-secondary mb-1">Accounts (for actuals)</label>
        <div className="flex flex-wrap gap-2">
          {accounts.map((a) => (
            <label key={a.id} className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={selectedAccounts.includes(a.id)}
                onChange={() => toggleAccount(a.id)}
              />
              {a.name}
            </label>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={!name.trim() || createBudget.isPending}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {createBudget.isPending ? 'Creating...' : 'Create'}
        </button>
        <button onClick={onCancel} className="px-4 py-2 text-sm border border-border rounded hover:bg-hover">
          Cancel
        </button>
      </div>
    </div>
  )
}

// --- Budget Settings ---

function BudgetSettings({
  budget,
  accounts,
  onClose,
}: {
  budget: Budget
  accounts: { id: number; name: string }[]
  onClose: () => void
}) {
  const [name, setName] = useState(budget.name)
  const [selectedAccounts, setSelectedAccounts] = useState<number[]>(budget.account_ids)
  const [showAutoPopulate, setShowAutoPopulate] = useState(false)
  const [autoStart, setAutoStart] = useState(() =>
    format(subMonths(startOfMonth(new Date()), 5), 'yyyy-MM-dd')
  )
  const [autoEnd, setAutoEnd] = useState(() =>
    format(endOfMonth(subMonths(new Date(), 0)), 'yyyy-MM-dd')
  )

  const updateBudget = useUpdateBudget()
  const deleteBudget = useDeleteBudget()
  const autoPopulate = useAutoPopulateBudget()

  const toggleAccount = (id: number) => {
    setSelectedAccounts((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    )
  }

  const handleSave = () => {
    updateBudget.mutate({
      id: budget.id,
      name: name.trim() || budget.name,
      account_ids: selectedAccounts,
    })
  }

  const handleDelete = () => {
    if (confirm('Delete this budget? This cannot be undone.')) {
      deleteBudget.mutate(budget.id, { onSuccess: () => window.location.reload() })
    }
  }

  const handleAutoPopulate = () => {
    autoPopulate.mutate({
      id: budget.id,
      start_date: autoStart,
      end_date: autoEnd,
      account_ids: selectedAccounts.length > 0 ? selectedAccounts : undefined,
    })
  }

  return (
    <div className="bg-surface rounded-lg border border-border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Budget Settings</h2>
        <button onClick={onClose} className="p-1 hover:bg-hover rounded text-content-tertiary">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div>
        <label className="block text-sm text-content-secondary mb-1">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-2 border border-input-border rounded bg-input text-sm"
        />
      </div>

      <div>
        <label className="block text-sm text-content-secondary mb-1">Accounts</label>
        <div className="flex flex-wrap gap-2">
          {accounts.map((a) => (
            <label key={a.id} className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={selectedAccounts.includes(a.id)}
                onChange={() => toggleAccount(a.id)}
              />
              {a.name}
            </label>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={updateBudget.isPending}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {updateBudget.isPending ? 'Saving...' : 'Save'}
        </button>
        <button
          onClick={() => setShowAutoPopulate(!showAutoPopulate)}
          className="px-4 py-2 text-sm border border-border rounded hover:bg-hover"
        >
          Auto-populate from History
        </button>
        <button
          onClick={handleDelete}
          className="px-4 py-2 text-sm text-red-600 border border-red-300 rounded hover:bg-red-50 dark:hover:bg-red-900/20 ml-auto"
        >
          Delete Budget
        </button>
      </div>

      {showAutoPopulate && (
        <div className="border border-border rounded p-3 space-y-2 bg-surface-secondary">
          <p className="text-sm text-content-secondary">
            Compute average monthly spending per category from historical transactions and set as budget targets.
          </p>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={autoStart}
              onChange={(e) => setAutoStart(e.target.value)}
              className="px-2 py-1 text-sm border border-input-border rounded bg-input"
            />
            <span className="text-content-secondary text-sm">to</span>
            <input
              type="date"
              value={autoEnd}
              onChange={(e) => setAutoEnd(e.target.value)}
              className="px-2 py-1 text-sm border border-input-border rounded bg-input"
            />
          </div>
          <button
            onClick={handleAutoPopulate}
            disabled={autoPopulate.isPending}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {autoPopulate.isPending ? 'Populating...' : 'Populate'}
          </button>
        </div>
      )}
    </div>
  )
}

// --- Month Table ---

function BudgetMonthTable({
  budget,
  month,
  categories,
}: {
  budget: Budget
  month: { year: number; month: number; items: any[]; total_budget_income: number; total_actual_income: number; total_budget_expense: number; total_actual_expense: number } | undefined
  categories: Category[]
}) {
  const updateBudget = useUpdateBudget()
  const [editingItemId, setEditingItemId] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')
  const [addingSection, setAddingSection] = useState<'income' | 'expense' | null>(null)
  const [newCategoryId, setNewCategoryId] = useState<number | null>(null)
  const [newAmount, setNewAmount] = useState('')

  // Organized categories for dropdown
  const categoryGroups = useMemo(() => {
    const parents = categories.filter((c) => !c.parent_id).sort((a, b) => a.display_order - b.display_order)
    return parents.map((p) => ({
      parent: p,
      children: categories.filter((c) => c.parent_id === p.id).sort((a, b) => a.display_order - b.display_order),
    }))
  }, [categories])

  // Items split by type
  const items = month?.items || []
  const incomeItems = items.filter((i) => i.is_income)
  const expenseItems = items.filter((i) => !i.is_income && i.budget_cents !== 0)
  const unbudgetedItems = items.filter((i) => !i.is_income && i.budget_cents === 0)

  // Set of already-budgeted category IDs
  const budgetedCategoryIds = useMemo(() => {
    return new Set(budget.items.map((i) => i.category_id))
  }, [budget.items])

  const startEdit = (categoryId: number, currentAmount: number) => {
    setEditingItemId(categoryId)
    setEditValue((currentAmount / 100).toFixed(2))
  }

  const saveEdit = (categoryId: number) => {
    const newCents = parseCurrency(editValue)
    const newItems = budget.items.map((item) =>
      item.category_id === categoryId
        ? { category_id: item.category_id, amount_cents: newCents }
        : { category_id: item.category_id, amount_cents: item.amount_cents }
    )
    updateBudget.mutate({ id: budget.id, items: newItems })
    setEditingItemId(null)
  }

  const addItem = () => {
    if (newCategoryId === null) return
    const cents = parseCurrency(newAmount)
    // For expense section, store as negative
    const amount = addingSection === 'expense' ? -Math.abs(cents) : Math.abs(cents)
    const newItems = [
      ...budget.items.map((i) => ({ category_id: i.category_id, amount_cents: i.amount_cents })),
      { category_id: newCategoryId, amount_cents: amount },
    ]
    updateBudget.mutate({ id: budget.id, items: newItems })
    setAddingSection(null)
    setNewCategoryId(null)
    setNewAmount('')
  }

  const removeItem = (categoryId: number) => {
    const newItems = budget.items
      .filter((i) => i.category_id !== categoryId)
      .map((i) => ({ category_id: i.category_id, amount_cents: i.amount_cents }))
    updateBudget.mutate({ id: budget.id, items: newItems })
  }

  if (!month) {
    return (
      <div className="bg-surface rounded-lg border border-border p-8 text-center text-content-secondary">
        No data for this month.
      </div>
    )
  }

  const addUnbudgetedItem = (categoryId: number, actualCents: number) => {
    const amount = actualCents < 0 ? -Math.abs(actualCents) : Math.abs(actualCents)
    const newItems = [
      ...budget.items.map((i) => ({ category_id: i.category_id, amount_cents: i.amount_cents })),
      { category_id: categoryId, amount_cents: amount },
    ]
    updateBudget.mutate({ id: budget.id, items: newItems })
  }

  const renderRow = (item: any, isBudgeted: boolean) => {
    const budgetAbs = Math.abs(item.budget_cents)
    const actualAbs = Math.abs(item.actual_cents)
    const pct = budgetAbs > 0 ? Math.min((actualAbs / budgetAbs) * 100, 100) : 0
    const overflowPct = budgetAbs > 0 && actualAbs > budgetAbs
      ? Math.min(((actualAbs - budgetAbs) / budgetAbs) * 100, 100) : 0

    // Difference sign: positive = favorable
    const diffFavorable = item.difference_cents >= 0

    const isEditing = editingItemId === item.category_id

    return (
      <tr key={item.category_id} className="group hover:bg-hover">
        <td className="px-3 py-2 text-sm">
          <div className="flex items-center gap-1">
            {item.category_name}
            <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 ml-1">
              {isBudgeted ? (
                <>
                  <button
                    onClick={() => startEdit(item.category_id, item.budget_cents)}
                    className="p-0.5 text-content-tertiary hover:text-blue-600 rounded"
                    title="Edit budget amount"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => removeItem(item.category_id)}
                    className="p-0.5 text-content-tertiary hover:text-red-600 rounded"
                    title="Remove from budget"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </>
              ) : (
                <button
                  onClick={() => addUnbudgetedItem(item.category_id, item.actual_cents)}
                  className="p-0.5 text-content-tertiary hover:text-green-600 rounded"
                  title="Add to budget"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </td>
        <td className="px-3 py-2 text-sm text-right font-mono">
          {isEditing ? (
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={() => saveEdit(item.category_id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveEdit(item.category_id)
                if (e.key === 'Escape') setEditingItemId(null)
              }}
              className="w-24 px-2 py-0.5 text-right text-sm border border-input-border rounded bg-input font-mono"
              autoFocus
            />
          ) : (
            <span className={clsx(!isBudgeted && 'text-content-tertiary')}>
              {formatCurrency(item.budget_cents)}
            </span>
          )}
        </td>
        <td className="px-3 py-2 text-sm text-right font-mono">
          {formatCurrency(item.actual_cents)}
        </td>
        <td className={clsx(
          'px-3 py-2 text-sm text-right font-mono',
          diffFavorable ? 'text-green-600' : 'text-red-600'
        )}>
          {item.difference_cents > 0 ? '+' : ''}{formatCurrency(item.difference_cents)}
        </td>
        <td className="px-3 py-2 w-32">
          {isBudgeted && budgetAbs > 0 && (
            <div className="w-full bg-surface-tertiary rounded h-2 overflow-hidden">
              <div
                className={clsx(
                  'h-2 rounded-l transition-all',
                  overflowPct > 0
                    ? (item.is_income ? 'bg-green-500' : 'bg-red-500')
                    : (item.is_income ? 'bg-green-400' : 'bg-blue-400')
                )}
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
            </div>
          )}
        </td>
      </tr>
    )
  }

  return (
    <div className="space-y-4">
      {/* Income Section */}
      <div className="bg-surface rounded-lg border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-surface-secondary text-left text-content-secondary text-sm">
              <th className="px-3 py-2 font-semibold" colSpan={5}>
                <div className="flex items-center justify-between">
                  <span>Income</span>
                  <button
                    onClick={() => setAddingSection(addingSection === 'income' ? null : 'income')}
                    className="text-xs text-blue-600 hover:underline font-normal"
                  >
                    + Add
                  </button>
                </div>
              </th>
            </tr>
            <tr className="text-xs text-content-tertiary">
              <th className="px-3 py-1 text-left font-normal w-1/3">Category</th>
              <th className="px-3 py-1 text-right font-normal">Budget</th>
              <th className="px-3 py-1 text-right font-normal">Actual</th>
              <th className="px-3 py-1 text-right font-normal">Difference</th>
              <th className="px-3 py-1 font-normal w-32">Progress</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {incomeItems.map((item) => renderRow(item, true))}
            {incomeItems.length === 0 && !addingSection && (
              <tr><td colSpan={5} className="px-3 py-3 text-sm text-content-tertiary text-center">No income items budgeted</td></tr>
            )}
            {addingSection === 'income' && (
              <AddItemRow
                categoryGroups={categoryGroups}
                budgetedCategoryIds={budgetedCategoryIds}
                newCategoryId={newCategoryId}
                setNewCategoryId={setNewCategoryId}
                newAmount={newAmount}
                setNewAmount={setNewAmount}
                onAdd={addItem}
                onCancel={() => setAddingSection(null)}
              />
            )}
          </tbody>
          <tfoot>
            <tr className="bg-surface-secondary font-semibold text-sm">
              <td className="px-3 py-2">Total Income</td>
              <td className="px-3 py-2 text-right font-mono">{formatCurrency(month.total_budget_income)}</td>
              <td className="px-3 py-2 text-right font-mono">{formatCurrency(month.total_actual_income)}</td>
              <td className={clsx(
                'px-3 py-2 text-right font-mono',
                month.total_actual_income - month.total_budget_income >= 0 ? 'text-green-600' : 'text-red-600'
              )}>
                {month.total_actual_income - month.total_budget_income >= 0 ? '+' : ''}
                {formatCurrency(month.total_actual_income - month.total_budget_income)}
              </td>
              <td className="px-3 py-2"></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Expense Section */}
      <div className="bg-surface rounded-lg border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-surface-secondary text-left text-content-secondary text-sm">
              <th className="px-3 py-2 font-semibold" colSpan={5}>
                <div className="flex items-center justify-between">
                  <span>Expenses</span>
                  <button
                    onClick={() => setAddingSection(addingSection === 'expense' ? null : 'expense')}
                    className="text-xs text-blue-600 hover:underline font-normal"
                  >
                    + Add
                  </button>
                </div>
              </th>
            </tr>
            <tr className="text-xs text-content-tertiary">
              <th className="px-3 py-1 text-left font-normal w-1/3">Category</th>
              <th className="px-3 py-1 text-right font-normal">Budget</th>
              <th className="px-3 py-1 text-right font-normal">Actual</th>
              <th className="px-3 py-1 text-right font-normal">Difference</th>
              <th className="px-3 py-1 font-normal w-32">Progress</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {expenseItems.map((item) => renderRow(item, true))}
            {expenseItems.length === 0 && !addingSection && (
              <tr><td colSpan={5} className="px-3 py-3 text-sm text-content-tertiary text-center">No expense items budgeted</td></tr>
            )}
            {addingSection === 'expense' && (
              <AddItemRow
                categoryGroups={categoryGroups}
                budgetedCategoryIds={budgetedCategoryIds}
                newCategoryId={newCategoryId}
                setNewCategoryId={setNewCategoryId}
                newAmount={newAmount}
                setNewAmount={setNewAmount}
                onAdd={addItem}
                onCancel={() => setAddingSection(null)}
              />
            )}
          </tbody>
          <tfoot>
            <tr className="bg-surface-secondary font-semibold text-sm">
              <td className="px-3 py-2">Total Expenses</td>
              <td className="px-3 py-2 text-right font-mono">{formatCurrency(month.total_budget_expense)}</td>
              <td className="px-3 py-2 text-right font-mono">{formatCurrency(month.total_actual_expense)}</td>
              <td className={clsx(
                'px-3 py-2 text-right font-mono',
                month.total_budget_expense - month.total_actual_expense >= 0 ? 'text-green-600' : 'text-red-600'
              )}>
                {month.total_budget_expense - month.total_actual_expense >= 0 ? '+' : ''}
                {formatCurrency(month.total_budget_expense - month.total_actual_expense)}
              </td>
              <td className="px-3 py-2"></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Unbudgeted Section */}
      {unbudgetedItems.length > 0 && (
        <div className="bg-surface rounded-lg border border-border overflow-hidden opacity-75">
          <table className="w-full">
            <thead>
              <tr className="bg-surface-secondary text-left text-content-secondary text-sm">
                <th className="px-3 py-2 font-semibold" colSpan={5}>Unbudgeted</th>
              </tr>
              <tr className="text-xs text-content-tertiary">
                <th className="px-3 py-1 text-left font-normal w-1/3">Category</th>
                <th className="px-3 py-1 text-right font-normal">Budget</th>
                <th className="px-3 py-1 text-right font-normal">Actual</th>
                <th className="px-3 py-1 text-right font-normal">Difference</th>
                <th className="px-3 py-1 font-normal w-32">Progress</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {unbudgetedItems.map((item) => renderRow(item, false))}
            </tbody>
          </table>
        </div>
      )}

      {/* Net Summary */}
      <div className="bg-surface rounded-lg border border-border p-4">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-xs text-content-secondary mb-1">Budgeted Net</div>
            <div className={clsx(
              'text-lg font-semibold font-mono',
              month.total_budget_income + month.total_budget_expense >= 0 ? 'text-green-600' : 'text-red-600'
            )}>
              {formatCurrency(month.total_budget_income + month.total_budget_expense)}
            </div>
          </div>
          <div>
            <div className="text-xs text-content-secondary mb-1">Actual Net</div>
            <div className={clsx(
              'text-lg font-semibold font-mono',
              month.total_actual_income + month.total_actual_expense >= 0 ? 'text-green-600' : 'text-red-600'
            )}>
              {formatCurrency(month.total_actual_income + month.total_actual_expense)}
            </div>
          </div>
          <div>
            <div className="text-xs text-content-secondary mb-1">Difference</div>
            <div className={clsx(
              'text-lg font-semibold font-mono',
              (month.total_actual_income + month.total_actual_expense) - (month.total_budget_income + month.total_budget_expense) >= 0
                ? 'text-green-600' : 'text-red-600'
            )}>
              {(month.total_actual_income + month.total_actual_expense) - (month.total_budget_income + month.total_budget_expense) >= 0 ? '+' : ''}
              {formatCurrency(
                (month.total_actual_income + month.total_actual_expense) - (month.total_budget_income + month.total_budget_expense)
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// --- Add Item Row ---

function AddItemRow({
  categoryGroups,
  budgetedCategoryIds,
  newCategoryId,
  setNewCategoryId,
  newAmount,
  setNewAmount,
  onAdd,
  onCancel,
}: {
  categoryGroups: { parent: Category; children: Category[] }[]
  budgetedCategoryIds: Set<number>
  newCategoryId: number | null
  setNewCategoryId: (id: number | null) => void
  newAmount: string
  setNewAmount: (v: string) => void
  onAdd: () => void
  onCancel: () => void
}) {
  return (
    <tr>
      <td className="px-3 py-2">
        <select
          value={newCategoryId ?? ''}
          onChange={(e) => setNewCategoryId(e.target.value ? Number(e.target.value) : null)}
          className="w-full px-2 py-1 text-sm border border-input-border rounded bg-input"
        >
          <option value="">Select category...</option>
          {categoryGroups.map((group) => (
            <optgroup key={group.parent.id} label={group.parent.name}>
              {!budgetedCategoryIds.has(group.parent.id) && group.children.length === 0 && (
                <option value={group.parent.id}>{group.parent.name}</option>
              )}
              {!budgetedCategoryIds.has(group.parent.id) && group.children.length > 0 && (
                <option value={group.parent.id}>{group.parent.name} (all)</option>
              )}
              {group.children.map((child) =>
                !budgetedCategoryIds.has(child.id) ? (
                  <option key={child.id} value={child.id}>{child.name}</option>
                ) : null
              )}
            </optgroup>
          ))}
        </select>
      </td>
      <td className="px-3 py-2">
        <input
          type="text"
          value={newAmount}
          onChange={(e) => setNewAmount(e.target.value)}
          placeholder="0.00"
          className="w-24 px-2 py-1 text-right text-sm border border-input-border rounded bg-input font-mono"
          onKeyDown={(e) => { if (e.key === 'Enter') onAdd() }}
        />
      </td>
      <td colSpan={3} className="px-3 py-2">
        <div className="flex gap-1">
          <button
            onClick={onAdd}
            disabled={newCategoryId === null}
            className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            Add
          </button>
          <button
            onClick={onCancel}
            className="px-2 py-1 text-xs border border-border rounded hover:bg-hover"
          >
            Cancel
          </button>
        </div>
      </td>
    </tr>
  )
}
