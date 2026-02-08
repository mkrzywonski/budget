import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  usePayees,
  useCreatePayee,
  useUpdatePayee,
  useDeletePayee,
  useRematchPayees,
  useRematchPayee,
  usePreviewPayeeMatches,
  useLatestPayeeTransaction,
} from '../hooks/usePayees'
import { Payee, MatchPattern, RecurringRule } from '../api/client'
import { useCategories } from '../hooks/useCategories'
import { useAccounts } from '../hooks/useAccounts'
import { useDismissalCount, useClearDismissals } from '../hooks/useForecasts'
import { formatCurrency } from '../utils/format'

const MATCH_TYPES = [
  { value: 'starts_with', label: 'Starts with' },
  { value: 'contains', label: 'Contains' },
  { value: 'exact', label: 'Exact' },
  { value: 'regex', label: 'Regex' }
] as const

const EMPTY_PATTERN: MatchPattern = { type: 'starts_with', pattern: '' }

export default function Payees() {
  const location = useLocation()
  const navigate = useNavigate()
  const { data: payees, isLoading } = usePayees()
  const createMutation = useCreatePayee()
  const updateMutation = useUpdatePayee()
  const deleteMutation = useDeletePayee()
  const rematchMutation = useRematchPayees()
  const rematchPayeeMutation = useRematchPayee()
  const { data: categories } = useCategories()
  const { data: accounts } = useAccounts()

  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [rematchResult, setRematchResult] = useState<number | null>(null)

  useEffect(() => {
    const state = location.state as { editPayeeId?: number } | null
    if (state?.editPayeeId) {
      setEditingId(state.editPayeeId)
      setShowAdd(false)
      navigate('/payees', { replace: true, state: {} })
    }
  }, [location.state, navigate])

  const handleRematch = async () => {
    const result = await rematchMutation.mutateAsync()
    setRematchResult(result.updated_count)
    setTimeout(() => setRematchResult(null), 5000)
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="bg-surface border-b px-6 py-4">
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-semibold">Payees</h1>
          <div className="flex items-center gap-3">
            {rematchResult !== null && (
              <span className="text-sm text-green-600">
                Updated {rematchResult} transaction{rematchResult !== 1 ? 's' : ''}
              </span>
            )}
            <button
              onClick={handleRematch}
              disabled={rematchMutation.isPending}
              className="px-3 py-1.5 text-sm border border-border-strong rounded hover:bg-hover disabled:opacity-50"
            >
              {rematchMutation.isPending ? 'Matching...' : 'Re-match All Transactions'}
            </button>
            <button
              onClick={() => setShowAdd(true)}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Add Payee
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="text-content-secondary">Loading payees...</div>
        ) : (
          <div className="space-y-3">
            {showAdd && (
              <PayeeForm
                categories={categories || []}
                accounts={accounts || []}
                onSave={async (name, patterns, defaultCategoryId, recurringRule) => {
                  await createMutation.mutateAsync({
                    name,
                    match_patterns: patterns,
                    default_category_id: defaultCategoryId,
                    recurring_rule: recurringRule
                  })
                  setShowAdd(false)
                }}
                onCancel={() => setShowAdd(false)}
                isSaving={createMutation.isPending}
              />
            )}

            {(!payees || payees.length === 0) && !showAdd && (
              <div className="text-center py-12 text-content-secondary">
                No payees defined yet. Add one to start matching transaction names.
              </div>
            )}

            {payees?.map((payee) =>
              editingId === payee.id ? (
                <PayeeForm
                  key={payee.id}
                  payee={payee}
                  categories={categories || []}
                  accounts={accounts || []}
                  onSave={async (name, patterns, defaultCategoryId, recurringRule) => {
                    const updated = await updateMutation.mutateAsync({
                      id: payee.id,
                      name,
                      match_patterns: patterns,
                      default_category_id: defaultCategoryId,
                      recurring_rule: recurringRule,
                      remove_recurring_rule: recurringRule === null && payee.recurring_rule !== null
                    })
                    await rematchPayeeMutation.mutateAsync(updated.id)
                    setEditingId(null)
                  }}
                  onCancel={() => setEditingId(null)}
                  isSaving={updateMutation.isPending}
                />
              ) : (
                <PayeeCard
                  key={payee.id}
                  payee={payee}
                  categories={categories || []}
                  accounts={accounts || []}
                  onEdit={() => setEditingId(payee.id)}
                  onDelete={() => deleteMutation.mutate(payee.id)}
                />
              )
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// --- Read-only payee card ---

function PayeeCard({
  payee,
  categories,
  accounts,
  onEdit,
  onDelete
}: {
  payee: Payee
  categories: { id: number; name: string; parent_id: number | null }[]
  accounts: { id: number; name: string }[]
  onEdit: () => void
  onDelete: () => void
}) {
  const categoryName =
    categories.find((category) => category.id === payee.default_category_id)?.name ||
    '—'

  const rule = payee.recurring_rule
  const accountName = rule
    ? accounts.find((a) => a.id === rule.account_id)?.name || 'Unknown'
    : null

  const freqLabel = rule
    ? rule.frequency === 'monthly'
      ? 'Monthly'
      : rule.frequency === 'annual'
        ? 'Annual'
        : `Every ${rule.frequency_n} months`
    : null

  const methodLabel = rule
    ? rule.amount_method === 'fixed'
      ? `fixed ${formatCurrency(rule.fixed_amount_cents ?? 0)}`
      : rule.amount_method === 'copy_last'
        ? 'copy last'
        : `avg last ${rule.average_count}`
    : null

  return (
    <div className="bg-surface border rounded-lg p-4 group">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="font-medium text-lg">{payee.name}</h3>
          <div className="mt-1 text-sm text-content-secondary">
            Default category: {categoryName}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {payee.match_patterns.map((p, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 px-2 py-1 bg-surface-tertiary text-sm rounded"
              >
                <span className="text-content-secondary text-xs font-medium uppercase">
                  {p.type.replace('_', ' ')}
                </span>
                <span className="font-mono text-content">{p.pattern}</span>
              </span>
            ))}
          </div>
          {rule && (
            <div className="mt-2 text-sm text-amber-700 dark:text-amber-400">
              Recurring: {freqLabel} on day {rule.day_of_month} in {accountName} — {methodLabel}
            </div>
          )}
        </div>
        <div className="invisible group-hover:visible flex gap-1">
          <button
            onClick={onEdit}
            className="p-1.5 text-content-tertiary hover:text-blue-600 rounded"
            title="Edit"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 text-content-tertiary hover:text-red-600 rounded"
            title="Delete"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

    </div>
  )
}

// --- Add/Edit payee form ---

function PayeeForm({
  payee,
  categories,
  accounts,
  onSave,
  onCancel,
  isSaving
}: {
  payee?: Payee
  categories: { id: number; name: string; parent_id: number | null }[]
  accounts: { id: number; name: string }[]
  onSave: (
    name: string,
    patterns: MatchPattern[],
    defaultCategoryId: number | null,
    recurringRule: RecurringRule | null
  ) => Promise<void>
  onCancel: () => void
  isSaving: boolean
}) {
  const [name, setName] = useState(payee?.name || '')
  const [defaultCategoryId, setDefaultCategoryId] = useState<number | null>(
    payee?.default_category_id ?? null
  )
  const [patterns, setPatterns] = useState<MatchPattern[]>(
    payee?.match_patterns?.length ? payee.match_patterns : [{ ...EMPTY_PATTERN }]
  )
  const [previewMatches, setPreviewMatches] = useState<string[] | null>(null)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const previewMutation = usePreviewPayeeMatches()

  // Recurring rule state
  const existingRule = payee?.recurring_rule
  const [recurringEnabled, setRecurringEnabled] = useState(!!existingRule)
  const [ruleAccountId, setRuleAccountId] = useState<number | null>(existingRule?.account_id ?? null)
  const [ruleFrequency, setRuleFrequency] = useState<string>(existingRule?.frequency ?? 'monthly')
  const [ruleFrequencyN, setRuleFrequencyN] = useState(existingRule?.frequency_n ?? 2)
  const [ruleDayOfMonth, setRuleDayOfMonth] = useState(existingRule?.day_of_month ?? new Date().getDate())
  const [ruleAmountMethod, setRuleAmountMethod] = useState<string>(existingRule?.amount_method ?? 'copy_last')
  const [ruleFixedAmount, setRuleFixedAmount] = useState(
    existingRule?.fixed_amount_cents != null ? (Math.abs(existingRule.fixed_amount_cents) / 100).toFixed(2) : ''
  )
  const [ruleFixedIsExpense, setRuleFixedIsExpense] = useState(
    existingRule?.fixed_amount_cents != null ? existingRule.fixed_amount_cents < 0 : true
  )
  const [ruleAverageCount, setRuleAverageCount] = useState(existingRule?.average_count ?? 3)
  const [ruleStartDate, setRuleStartDate] = useState(existingRule?.start_date ?? new Date().toISOString().slice(0, 10))
  const [ruleEndDate, setRuleEndDate] = useState(existingRule?.end_date ?? '')
  const [ruleCategoryId, setRuleCategoryId] = useState<number | null>(existingRule?.category_id ?? null)

  // Fetch latest transaction for auto-populating recurring fields
  const { data: latestTx } = useLatestPayeeTransaction(payee?.id ?? null)
  const [hasAutoPopulated, setHasAutoPopulated] = useState(false)

  // Forecast dismissals
  const { data: dismissalData } = useDismissalCount(payee?.id ?? null)
  const clearDismissals = useClearDismissals()

  // Auto-populate recurring fields from latest transaction when checkbox is toggled on
  useEffect(() => {
    if (recurringEnabled && !existingRule && latestTx && !hasAutoPopulated) {
      setRuleAccountId(latestTx.account_id)
      setRuleFrequency('monthly')
      setRuleAmountMethod('copy_last')
      setRuleCategoryId(null) // "Use default category"
      setRuleStartDate(latestTx.posted_date)
      const day = parseInt(latestTx.posted_date.split('-')[2], 10)
      if (day >= 1 && day <= 31) setRuleDayOfMonth(day)
      setRuleEndDate('')
      setHasAutoPopulated(true)
    }
  }, [recurringEnabled, existingRule, latestTx, hasAutoPopulated])

  const updatePattern = (index: number, field: keyof MatchPattern, value: string) => {
    setPatterns((prev) =>
      prev.map((p, i) =>
        i === index ? { ...p, [field]: value } : p
      )
    )
  }

  const addPattern = () => {
    setPatterns((prev) => [...prev, { ...EMPTY_PATTERN }])
  }

  const removePattern = (index: number) => {
    setPatterns((prev) => prev.filter((_, i) => i !== index))
  }

  const hasAnyPattern = patterns.some((p) => p.pattern.trim().length > 0)

  useEffect(() => {
    if (!hasAnyPattern) {
      setPreviewMatches(null)
      return
    }

    const handle = setTimeout(async () => {
      setIsPreviewing(true)
      try {
        const results = await previewMutation.mutateAsync({
          name: name || 'Preview',
          match_patterns: patterns
        })
        setPreviewMatches(results)
      } catch (error) {
        console.error('Failed to preview matches', error)
        setPreviewMatches(null)
      } finally {
        setIsPreviewing(false)
      }
    }, 300)

    return () => clearTimeout(handle)
  }, [name, patterns, hasAnyPattern])

  const buildRecurringRule = (): RecurringRule | null => {
    if (!recurringEnabled || !ruleAccountId) return null
    const fixedCents = ruleAmountMethod === 'fixed' && ruleFixedAmount
      ? Math.round(parseFloat(ruleFixedAmount) * 100) * (ruleFixedIsExpense ? -1 : 1)
      : null
    return {
      account_id: ruleAccountId,
      frequency: ruleFrequency as RecurringRule['frequency'],
      frequency_n: ruleFrequencyN,
      day_of_month: ruleDayOfMonth,
      amount_method: ruleAmountMethod as RecurringRule['amount_method'],
      fixed_amount_cents: fixedCents,
      average_count: ruleAverageCount,
      start_date: ruleStartDate,
      end_date: ruleEndDate || null,
      category_id: ruleCategoryId,
    }
  }

  const handleSubmit = () => {
    if (!name.trim()) return
    const validPatterns = patterns.filter((p) => p.pattern.trim())
    if (validPatterns.length === 0) return
    onSave(name.trim(), validPatterns, defaultCategoryId, buildRecurringRule())
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
    if (e.key === 'Escape') {
      onCancel()
    }
  }

  return (
    <div className="bg-surface border-2 border-blue-200 rounded-lg p-4">
      <div className="space-y-4">
        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-content mb-1">
            Display Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g., Institute for Justice"
            className="w-full px-3 py-2 border border-input-border rounded bg-input"
            autoFocus
          />
        </div>

        {/* Default Category */}
        <div>
          <label className="block text-sm font-medium text-content mb-1">
            Default Category
          </label>
          <select
            value={defaultCategoryId ?? ''}
            onChange={(e) => {
              const value = e.target.value
              setDefaultCategoryId(value ? Number(value) : null)
            }}
            className="w-full px-3 py-2 border border-input-border rounded bg-input"
          >
            <option value="">None</option>
            {categories.filter((c) => !c.parent_id).map((parent) => (
              <optgroup key={parent.id} label={parent.name}>
                <option value={parent.id}>{parent.name}</option>
                {categories.filter((c) => c.parent_id === parent.id).map((child) => (
                  <option key={child.id} value={child.id}>{child.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* Match patterns */}
        <div>
          <label className="block text-sm font-medium text-content mb-1">
            Match Patterns
          </label>
          <div className="space-y-2">
            {patterns.map((p, i) => (
              <div key={i} className="flex gap-2 items-center">
                <select
                  value={p.type}
                  onChange={(e) => updatePattern(i, 'type', e.target.value)}
                  className="px-2 py-2 border border-input-border rounded text-sm w-36 bg-input"
                >
                  {MATCH_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={p.pattern}
                  onChange={(e) => updatePattern(i, 'pattern', e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Pattern to match..."
                  className="flex-1 px-3 py-2 border border-input-border rounded font-mono text-sm bg-input"
                />
                {patterns.length > 1 && (
                  <button
                    onClick={() => removePattern(i)}
                    className="p-1.5 text-content-tertiary hover:text-red-600 rounded"
                    title="Remove pattern"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            onClick={addPattern}
            className="mt-2 text-sm text-blue-600 hover:text-blue-700"
          >
            + Add another pattern
          </button>
        </div>

        <div className="border-t pt-3">
          <div className="text-xs text-content-secondary mb-2">Preview matching payees</div>
          {!hasAnyPattern ? (
            <div className="text-xs text-content-tertiary">Enter a pattern to see matches</div>
          ) : isPreviewing ? (
            <div className="text-xs text-content-tertiary">Matching...</div>
          ) : !previewMatches || previewMatches.length === 0 ? (
            <div className="text-xs text-content-tertiary">No matches</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {previewMatches.map((value) => (
                <span
                  key={value}
                  className="inline-flex items-center px-2 py-1 bg-surface-tertiary text-xs rounded font-mono text-content"
                >
                  {value}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Recurring Transaction Rule */}
        <div className="border-t pt-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={recurringEnabled}
              onChange={(e) => setRecurringEnabled(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm font-medium text-content">Recurring Transaction</span>
          </label>

          {recurringEnabled && (
            <div className="mt-3 space-y-3 pl-6 border-l-2 border-amber-300 dark:border-amber-700">
              {/* Account */}
              <div>
                <label className="block text-xs font-medium text-content-secondary mb-1">Account</label>
                <select
                  value={ruleAccountId ?? ''}
                  onChange={(e) => setRuleAccountId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full px-2 py-1.5 text-sm border border-input-border rounded bg-input"
                >
                  <option value="">Select account...</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>

              {/* Frequency */}
              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-content-secondary mb-1">Frequency</label>
                  <select
                    value={ruleFrequency}
                    onChange={(e) => setRuleFrequency(e.target.value)}
                    className="w-full px-2 py-1.5 text-sm border border-input-border rounded bg-input"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="every_n_months">Every N Months</option>
                    <option value="annual">Annual</option>
                  </select>
                </div>
                {ruleFrequency === 'every_n_months' && (
                  <div className="w-20">
                    <label className="block text-xs font-medium text-content-secondary mb-1">N</label>
                    <input
                      type="number"
                      min={2}
                      max={12}
                      value={ruleFrequencyN}
                      onChange={(e) => setRuleFrequencyN(Number(e.target.value))}
                      className="w-full px-2 py-1.5 text-sm border border-input-border rounded bg-input"
                    />
                  </div>
                )}
                <div className="w-24">
                  <label className="block text-xs font-medium text-content-secondary mb-1">Day</label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={ruleDayOfMonth}
                    onChange={(e) => setRuleDayOfMonth(Number(e.target.value))}
                    className="w-full px-2 py-1.5 text-sm border border-input-border rounded bg-input"
                  />
                </div>
              </div>

              {/* Amount Method */}
              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-content-secondary mb-1">Amount</label>
                  <select
                    value={ruleAmountMethod}
                    onChange={(e) => setRuleAmountMethod(e.target.value)}
                    className="w-full px-2 py-1.5 text-sm border border-input-border rounded bg-input"
                  >
                    <option value="copy_last">Copy Last Transaction</option>
                    <option value="average">Average Last N</option>
                    <option value="fixed">Fixed Amount</option>
                  </select>
                </div>
                {ruleAmountMethod === 'average' && (
                  <div className="w-20">
                    <label className="block text-xs font-medium text-content-secondary mb-1">Count</label>
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={ruleAverageCount}
                      onChange={(e) => setRuleAverageCount(Number(e.target.value))}
                      className="w-full px-2 py-1.5 text-sm border border-input-border rounded bg-input"
                    />
                  </div>
                )}
                {ruleAmountMethod === 'fixed' && (
                  <>
                    <div className="w-20">
                      <label className="block text-xs font-medium text-content-secondary mb-1">Type</label>
                      <select
                        value={ruleFixedIsExpense ? 'expense' : 'income'}
                        onChange={(e) => setRuleFixedIsExpense(e.target.value === 'expense')}
                        className="w-full px-2 py-1.5 text-sm border border-input-border rounded bg-input"
                      >
                        <option value="expense">Expense</option>
                        <option value="income">Income</option>
                      </select>
                    </div>
                    <div className="w-28">
                      <label className="block text-xs font-medium text-content-secondary mb-1">Amount</label>
                      <input
                        type="text"
                        value={ruleFixedAmount}
                        onChange={(e) => setRuleFixedAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full px-2 py-1.5 text-sm text-right font-mono border border-input-border rounded bg-input"
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Category */}
              <div>
                <label className="block text-xs font-medium text-content-secondary mb-1">Category</label>
                <select
                  value={ruleCategoryId ?? ''}
                  onChange={(e) => setRuleCategoryId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full px-2 py-1.5 text-sm border border-input-border rounded bg-input"
                >
                  <option value="">Use default category</option>
                  {categories.filter((c) => !c.parent_id).map((parent) => (
                    <optgroup key={parent.id} label={parent.name}>
                      <option value={parent.id}>{parent.name}</option>
                      {categories.filter((c) => c.parent_id === parent.id).map((child) => (
                        <option key={child.id} value={child.id}>{child.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              {/* Dates */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-content-secondary mb-1">Start Date</label>
                  <input
                    type="date"
                    value={ruleStartDate}
                    onChange={(e) => {
                      setRuleStartDate(e.target.value)
                      const day = parseInt(e.target.value.split('-')[2], 10)
                      if (day >= 1 && day <= 31) setRuleDayOfMonth(day)
                    }}
                    className="w-full px-2 py-1.5 text-sm border border-input-border rounded bg-input"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-content-secondary mb-1">End Date (optional)</label>
                  <input
                    type="date"
                    value={ruleEndDate}
                    onChange={(e) => setRuleEndDate(e.target.value)}
                    className="w-full px-2 py-1.5 text-sm border border-input-border rounded bg-input"
                  />
                </div>
              </div>

              {/* Clear dismissed forecasts */}
              {payee && dismissalData && dismissalData.count > 0 && (
                <div className="flex items-center justify-between pt-2 border-t border-amber-200 dark:border-amber-800">
                  <span className="text-xs text-content-secondary">
                    {dismissalData.count} dismissed forecast{dismissalData.count !== 1 ? 's' : ''}
                  </span>
                  <button
                    type="button"
                    onClick={() => clearDismissals.mutate(payee.id)}
                    disabled={clearDismissals.isPending}
                    className="text-xs text-amber-600 hover:text-amber-700 hover:underline disabled:opacity-50"
                  >
                    {clearDismissals.isPending ? 'Clearing...' : 'Clear dismissed forecasts'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm border border-border-strong rounded hover:bg-hover"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSaving || !name.trim() || !patterns.some((p) => p.pattern.trim())}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : payee ? 'Save Changes' : 'Create Payee'}
          </button>
        </div>
      </div>
    </div>
  )
}
