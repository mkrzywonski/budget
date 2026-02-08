import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { format, startOfMonth, endOfMonth, addMonths, subMonths, parseISO } from 'date-fns'
import { useAccount, useAccounts } from '../hooks/useAccounts'
import {
  useTransactions,
  useBalanceBefore,
  useCreateTransaction,
  useUpdateTransaction,
  useDeleteTransaction,
  useCategorizeByPayee,
  useFindTransferMatch,
  useConvertToTransfer
} from '../hooks/useTransactions'
import { useCreatePayee } from '../hooks/usePayees'
import { usePayees } from '../hooks/usePayees'
import { useCategories } from '../hooks/useCategories'
import { Transaction, Account, Category, TransferMatch, Forecast, Payee } from '../api/client'
import { formatCurrency, parseCurrency } from '../utils/format'
import { useForecasts, useDismissForecast } from '../hooks/useForecasts'
import ImportModal from '../components/ImportModal'
import clsx from 'clsx'

type TxType = 'debit' | 'credit' | 'transfer'
type SortField = 'posted_date' | 'type' | 'payee' | 'category' | 'memo' | 'amount_cents'
type SortDir = 'asc' | 'desc'

function deriveTxType(tx: Transaction): TxType {
  if (tx.transaction_type === 'transfer') return 'transfer'
  return tx.amount_cents < 0 ? 'debit' : 'credit'
}

function applyTypeSign(type: TxType, cents: number): number {
  if (type === 'debit') return cents > 0 ? -cents : cents
  if (type === 'credit') return cents < 0 ? -cents : cents
  return cents // transfer: leave as-is
}

const TYPE_LABELS: Record<TxType, string> = {
  debit: 'Debit',
  credit: 'Credit',
  transfer: 'Transfer'
}

const TYPE_COLORS: Record<TxType, string> = {
  debit: 'text-red-600',
  credit: 'text-green-600',
  transfer: 'text-purple-600'
}

export default function Ledger() {
  const { accountId } = useParams<{ accountId: string }>()
  const id = Number(accountId)
  const navigate = useNavigate()

  const [currentDate, setCurrentDate] = useState(() => {
    const saved = sessionStorage.getItem('ledger-month')
    return saved ? startOfMonth(parseISO(saved)) : startOfMonth(new Date())
  })

  // Persist selected month across navigation
  useEffect(() => {
    sessionStorage.setItem('ledger-month', format(currentDate, 'yyyy-MM-dd'))
  }, [currentDate])
  const [showImport, setShowImport] = useState(false)
  const [sortField, setSortField] = useState<SortField>('posted_date')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [lastType, setLastType] = useState<TxType>('debit')

  const { data: account } = useAccount(id)
  const { data: transactions, isLoading } = useTransactions({
    accountId: id,
    year: currentDate.getFullYear(),
    month: currentDate.getMonth() + 1
  })

  // Opening balance = sum of all transactions before this month
  const monthStart = format(currentDate, 'yyyy-MM-dd')
  const { data: balanceBeforeData } = useBalanceBefore(id, monthStart)
  const openingBalance = balanceBeforeData?.balance_cents ?? 0

  const showBalance = (account?.show_running_balance ?? true) && sortField === 'posted_date' && sortDir === 'asc'

  const { data: accounts } = useAccounts()
  const createMutation = useCreateTransaction()
  const updateMutation = useUpdateTransaction()
  const deleteMutation = useDeleteTransaction()
  const convertToTransferMutation = useConvertToTransfer()
  const categorizeByPayeeMutation = useCategorizeByPayee()
  const createPayeeMutation = useCreatePayee()
  const { data: payees } = usePayees()
  const { data: categories } = useCategories()

  // Forecasts
  const monthEnd = format(endOfMonth(currentDate), 'yyyy-MM-dd')
  const { data: forecasts } = useForecasts(id, monthStart, monthEnd)
  const dismissForecastMutation = useDismissForecast()
  const [confirmingForecast, setConfirmingForecast] = useState<Forecast | null>(null)

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

  const entryDefaultDate = useMemo(() => {
    if (!transactions || transactions.length === 0) {
      return format(currentDate, 'yyyy-MM-dd')
    }
    const latest = transactions
      .map((tx) => tx.posted_date)
      .sort()
      .slice(-1)[0]
    return latest || format(currentDate, 'yyyy-MM-dd')
  }, [transactions, currentDate])

  const payeeSuggestions = useMemo(() => {
    if (!payees) return []
    const names = payees.map((payee) => payee.name).filter(Boolean)
    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b))
  }, [payees])

  // Sort transactions + merge forecasts (excluding fulfilled ones)
  const sorted = useMemo(() => {
    if (!transactions) return []
    // Build set of payee names that already exist in actual transactions
    const existingPayees = new Set<string>()
    for (const tx of transactions) {
      if (tx.display_name) existingPayees.add(tx.display_name)
      if (tx.payee_raw) existingPayees.add(tx.payee_raw)
    }
    // Only include forecasts whose display_name has no matching actual transaction
    const visibleForecasts = (forecasts || []).filter(
      (f) => !f.display_name || !existingPayees.has(f.display_name)
    )
    const list: Transaction[] = [...transactions, ...visibleForecasts]
    list.sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'posted_date':
          cmp = a.posted_date.localeCompare(b.posted_date)
          // Forecasts sort after actuals on same date
          if (cmp === 0) {
            const aF = a.transaction_type === 'forecast' ? 1 : 0
            const bF = b.transaction_type === 'forecast' ? 1 : 0
            cmp = aF - bF
          }
          break
        case 'type':
          cmp = deriveTxType(a).localeCompare(deriveTxType(b))
          break
        case 'payee':
          cmp = (a.display_name || a.payee_raw || '').localeCompare(
            b.display_name || b.payee_raw || ''
          )
          break
        case 'category':
          cmp = (a.category_id ?? 0) - (b.category_id ?? 0)
          break
        case 'memo':
          cmp = (a.memo || '').localeCompare(b.memo || '')
          break
        case 'amount_cents':
          cmp = a.amount_cents - b.amount_cents
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [transactions, forecasts, sortField, sortDir])

  // Calculate running balance from sorted list (actuals + forecasts)
  const balanceMap = useMemo(() => {
    if (!sorted.length) return new Map<number, number>()
    const map = new Map<number, number>()
    let balance = openingBalance
    for (const tx of sorted) {
      balance += tx.amount_cents
      map.set(tx.id, balance)
    }
    return map
  }, [sorted, openingBalance])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const findMatchingPayee = (tx: Transaction): Payee | undefined => {
    if (!tx.display_name || !payees) return undefined
    return payees.find((p) => p.name === tx.display_name)
  }

  const handleAddPayee = async (tx: Transaction) => {
    const rawPayee = tx.payee_raw || tx.display_name
    if (!rawPayee) return
    try {
      const created = await createPayeeMutation.mutateAsync({
        name: tx.display_name || rawPayee,
        match_patterns: [{ type: 'exact', pattern: rawPayee }]
      })
      navigate('/payees', { state: { editPayeeId: created.id } })
    } catch (error) {
      console.error('Failed to create payee', error)
      window.alert('Failed to create payee. Check the console for details.')
    }
  }

  const handleEditPayee = (payeeId: number) => {
    navigate('/payees', { state: { editPayeeId: payeeId } })
  }

  const handleCreate = async (data: {
    posted_date: string
    amount_cents: number
    payee_raw: string
    memo: string
    type: TxType
    category_id: number | null
    transfer_to_account_id?: number
    delete_match_id?: number
  }) => {
    setLastType(data.type)
    await createMutation.mutateAsync({
      account_id: id,
      posted_date: data.posted_date,
      amount_cents: applyTypeSign(data.type, data.amount_cents),
      payee_raw: data.type !== 'transfer' ? (data.payee_raw || undefined) : undefined,
      memo: data.memo || undefined,
      category_id: data.type !== 'transfer' ? (data.category_id ?? undefined) : undefined,
      transfer_to_account_id: data.transfer_to_account_id,
      delete_match_id: data.delete_match_id
    })
  }

  const handleConvertToTransfer = async (txId: number, targetAccountId: number, deleteMatchId?: number) => {
    await convertToTransferMutation.mutateAsync({ id: txId, target_account_id: targetAccountId, delete_match_id: deleteMatchId })
    setEditingId(null)
  }

  const handleUpdate = async (
    txId: number,
    data: {
      posted_date?: string
      amount_cents?: number
      payee_raw?: string
      memo?: string
      category_id?: number | null
    }
  ) => {
    const { category_id, ...rest } = data
    await updateMutation.mutateAsync({ id: txId, ...rest, category_id: category_id ?? undefined })
    setEditingId(null)
  }

  const handleDelete = async (txId: number) => {
    await deleteMutation.mutateAsync(txId)
  }

  const handleCategorize = async (tx: Transaction, categoryId: number) => {
    const payee = tx.display_name || tx.payee_raw
    if (!payee) return
    await categorizeByPayeeMutation.mutateAsync({
      account_id: id,
      payee,
      category_id: categoryId
    })
  }

  const handleDismissForecast = async (forecast: Forecast) => {
    await dismissForecastMutation.mutateAsync({
      payee_id: forecast.payee_id,
      account_id: forecast.account_id,
      period_date: forecast.period_date,
    })
  }

  const handleConfirmForecast = (forecast: Forecast) => {
    setConfirmingForecast(forecast)
  }

  const prevMonth = () => setCurrentDate((d) => subMonths(d, 1))
  const nextMonth = () => setCurrentDate((d) => addMonths(d, 1))
  const goToToday = () => setCurrentDate(startOfMonth(new Date()))

  const sortIndicator = (field: SortField) => {
    if (sortField !== field) return <span className="text-content-tertiary ml-1">↕</span>
    return <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="bg-surface border-b px-6 py-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-semibold">
              {account?.name || 'Loading...'}
            </h1>
            <button
              onClick={() => setShowImport(true)}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Import
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={prevMonth}
              className="p-2 hover:bg-hover rounded"
            >
              ←
            </button>
            <button
              onClick={goToToday}
              className="px-3 py-1 text-sm font-medium w-36 text-center"
            >
              {format(currentDate, 'MMMM yyyy')}
            </button>
            <button
              onClick={nextMonth}
              className="p-2 hover:bg-hover rounded"
            >
              →
            </button>
          </div>
        </div>
      </div>

      {/* Import Modal */}
      {showImport && account && (
        <ImportModal
          accountId={id}
          accountName={account.name}
          onClose={() => setShowImport(false)}
          onSuccess={() => {}}
        />
      )}

      {/* Transaction Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-6 text-content-secondary">Loading transactions...</div>
        ) : (
          <table className="w-full">
            <thead className="bg-surface-secondary sticky top-0">
              <tr className="text-left text-sm text-content-secondary">
                <th
                  className="px-4 py-2 w-28 cursor-pointer select-none hover:text-content"
                  onClick={() => handleSort('posted_date')}
                >
                  Date{sortIndicator('posted_date')}
                </th>
                <th
                  className="px-4 py-2 w-24 cursor-pointer select-none hover:text-content"
                  onClick={() => handleSort('type')}
                >
                  Type{sortIndicator('type')}
                </th>
                <th
                  className="px-4 py-2 cursor-pointer select-none hover:text-content"
                  onClick={() => handleSort('payee')}
                >
                  Payee{sortIndicator('payee')}
                </th>
                <th
                  className="px-4 py-2 cursor-pointer select-none hover:text-content"
                  onClick={() => handleSort('category')}
                >
                  Category{sortIndicator('category')}
                </th>
                <th
                  className="px-4 py-2 cursor-pointer select-none hover:text-content"
                  onClick={() => handleSort('memo')}
                >
                  Memo{sortIndicator('memo')}
                </th>
                <th
                  className="px-4 py-2 text-right w-28 cursor-pointer select-none hover:text-content"
                  onClick={() => handleSort('amount_cents')}
                >
                  Amount{sortIndicator('amount_cents')}
                </th>
                {showBalance && <th className="px-4 py-2 text-right w-28">Balance</th>}
                <th className="px-4 py-2 w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorted.length === 0 && (
                <tr>
                  <td
                    colSpan={showBalance ? 8 : 7}
                    className="px-4 py-8 text-center text-content-secondary"
                  >
                    No transactions this month
                  </td>
                </tr>
              )}
              {sorted.map((tx) =>
                editingId === tx.id ? (
                  <EditRow
                    key={tx.id}
                    transaction={tx}
                    categories={categories || []}
                    accounts={accounts || []}
                    currentAccountId={id}
                    showBalance={showBalance}
                    onSave={(data) => handleUpdate(tx.id, data)}
                    onConvertToTransfer={(targetAccountId, deleteMatchId) => handleConvertToTransfer(tx.id, targetAccountId, deleteMatchId)}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <TransactionRow
                    key={tx.id}
                    transaction={tx}
                    categories={categories || []}
                    categoryMap={categoryMap}
                    runningBalance={balanceMap.get(tx.id) ?? 0}
                    showBalance={showBalance}
                    matchingPayee={findMatchingPayee(tx)}
                    onEdit={() => setEditingId(tx.id)}
                    onDelete={() => handleDelete(tx.id)}
                    onAddPayee={() => handleAddPayee(tx)}
                    onEditPayee={(payeeId) => handleEditPayee(payeeId)}
                    onCategorize={(catId) => handleCategorize(tx, catId)}
                    onConfirmForecast={() => handleConfirmForecast(tx as Forecast)}
                    onDismissForecast={() => handleDismissForecast(tx as Forecast)}
                  />
                )
              )}
              {/* Confirm forecast entry row */}
              {confirmingForecast && (
                <EntryRow
                  key="confirm-forecast"
                  defaultDate={confirmingForecast.posted_date}
                  defaultType={confirmingForecast.amount_cents < 0 ? 'debit' : 'credit'}
                  categories={categories || []}
                  accounts={accounts || []}
                  currentAccountId={id}
                  showBalance={showBalance}
                  onSubmit={async (data) => {
                    await handleCreate(data)
                    setConfirmingForecast(null)
                  }}
                  isPending={createMutation.isPending}
                  payeeSuggestions={payeeSuggestions}
                  prefill={{
                    payee: confirmingForecast.display_name || '',
                    amount: (Math.abs(confirmingForecast.amount_cents) / 100).toFixed(2),
                    categoryId: confirmingForecast.category_id,
                  }}
                  onCancel={() => setConfirmingForecast(null)}
                />
              )}
              {/* Entry row */}
              <EntryRow
                defaultDate={entryDefaultDate}
                defaultType={lastType}
                categories={categories || []}
                accounts={accounts || []}
                currentAccountId={id}
                showBalance={showBalance}
                onSubmit={handleCreate}
                isPending={createMutation.isPending}
                payeeSuggestions={payeeSuggestions}
              />
            </tbody>
          </table>
        )}
      </div>

      {/* Footer with totals */}
      <div className="bg-surface-secondary border-t px-6 py-3">
        <div className="flex justify-end gap-8 text-sm">
          <div>
            <span className="text-content-secondary">Month Total: </span>
            <span className="font-medium">
              {formatCurrency(
                (transactions || []).filter(
                  (tx) => tx.transaction_type !== 'forecast'
                ).reduce(
                  (sum, tx) => sum + tx.amount_cents,
                  0
                )
              )}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// --- Transaction row (read-only) ---

interface TransactionRowProps {
  transaction: Transaction
  categories: Category[]
  categoryMap: Map<number, string>
  runningBalance: number
  showBalance: boolean
  matchingPayee?: Payee
  onEdit: () => void
  onDelete: () => void
  onAddPayee: () => void
  onEditPayee: (payeeId: number) => void
  onCategorize: (categoryId: number) => void
  onConfirmForecast: () => void
  onDismissForecast: () => void
}

function TransactionRow({
  transaction: tx,
  categories,
  categoryMap,
  runningBalance,
  showBalance,
  matchingPayee,
  onEdit,
  onDelete,
  onAddPayee,
  onEditPayee,
  onCategorize,
  onConfirmForecast,
  onDismissForecast,
}: TransactionRowProps) {
  const isForecast = tx.transaction_type === 'forecast'
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)

  const handlePayeeContext = (e: React.MouseEvent) => {
    if (!tx.payee_raw && !tx.display_name) return
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }

  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [contextMenu])

  return (
    <tr
      className={clsx(
        'group hover:bg-hover',
        isForecast && 'row-forecast'
      )}
    >
      <td className="px-4 py-2 text-sm">
        {format(parseISO(tx.posted_date), 'MM/dd')}
      </td>
      <td className={clsx('px-4 py-2 text-sm', TYPE_COLORS[deriveTxType(tx)])}>
        {TYPE_LABELS[deriveTxType(tx)]}
      </td>
      <td
        className="px-4 py-2 cursor-default"
        onContextMenu={handlePayeeContext}
      >
        {tx.display_name || tx.payee_raw || '—'}
        {contextMenu && (
          <div
            className="fixed z-50 bg-white dark:bg-gray-800 border border-border rounded shadow-lg py-1 min-w-[160px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {matchingPayee ? (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setContextMenu(null)
                  onEditPayee(matchingPayee.id)
                }}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-hover"
              >
                Edit payee rule
              </button>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setContextMenu(null)
                  onAddPayee()
                }}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-hover"
              >
                Create payee rule
              </button>
            )}
          </div>
        )}
      </td>
      <td className="px-4 py-2 text-sm text-content-secondary">
        {tx.transaction_type === 'transfer' ? (
          '—'
        ) : tx.category_id ? (
          categoryMap.get(tx.category_id) || '—'
        ) : (
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) onCategorize(Number(e.target.value))
            }}
            className="w-full px-1 py-0.5 text-sm border border-border rounded bg-transparent text-content-tertiary hover:border-border-strong cursor-pointer"
          >
            <option value="">—</option>
            {categories.filter((c) => !c.parent_id).map((parent) => (
              <optgroup key={parent.id} label={parent.name}>
                <option value={parent.id}>{parent.name}</option>
                {categories.filter((c) => c.parent_id === parent.id).map((child) => (
                  <option key={child.id} value={child.id}>{child.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        )}
      </td>
      <td className="px-4 py-2 text-sm text-content-secondary truncate max-w-xs">
        {tx.memo || ''}
      </td>
      <td
        className={clsx(
          'px-4 py-2 text-right font-mono text-sm',
          tx.amount_cents >= 0 ? 'amount-positive' : 'amount-negative'
        )}
      >
        {formatCurrency(tx.amount_cents)}
      </td>
      {showBalance && (
        <td className="px-4 py-2 text-right font-mono text-sm">
          {formatCurrency(runningBalance)}
        </td>
      )}
      <td className="px-4 py-1 text-right">
        {isForecast ? (
          <div className="invisible group-hover:visible flex justify-end gap-1">
            <button
              onClick={onConfirmForecast}
              className="p-1 text-green-600 hover:text-green-700 rounded"
              title="Confirm forecast"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </button>
            <button
              onClick={onDismissForecast}
              className="p-1 text-content-tertiary hover:text-red-600 rounded"
              title="Dismiss forecast"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ) : (
          <div className="invisible group-hover:visible flex justify-end gap-1">
            <button
              onClick={onEdit}
              className="p-1 text-content-tertiary hover:text-blue-600 rounded"
              title="Edit"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                />
              </svg>
            </button>
            <button
              onClick={onDelete}
              className="p-1 text-content-tertiary hover:text-red-600 rounded"
              title="Delete"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          </div>
        )}
      </td>
    </tr>
  )
}

// --- Inline edit row ---

interface EditRowProps {
  transaction: Transaction
  categories: Category[]
  accounts: Account[]
  currentAccountId: number
  showBalance: boolean
  onSave: (data: {
    posted_date: string
    amount_cents: number
    payee_raw: string
    memo: string
    category_id: number | null
  }) => void
  onConvertToTransfer: (targetAccountId: number, deleteMatchId?: number) => void
  onCancel: () => void
}

function EditRow({ transaction: tx, categories, accounts, currentAccountId, showBalance, onSave, onConvertToTransfer, onCancel }: EditRowProps) {
  const isExistingTransfer = tx.transaction_type === 'transfer'
  const [date, setDate] = useState(tx.posted_date)
  const [type, setType] = useState<TxType>(deriveTxType(tx))
  const [payee, setPayee] = useState(tx.payee_raw || '')
  const [memo, setMemo] = useState(tx.memo || '')
  const [amount, setAmount] = useState(
    (Math.abs(tx.amount_cents) / 100).toFixed(2)
  )
  const [categoryId, setCategoryId] = useState<number | null>(tx.category_id)
  const [transferAccountId, setTransferAccountId] = useState<number | null>(null)
  const [transferMatch, setTransferMatch] = useState<TransferMatch | null>(null)
  const [deleteMatchId, setDeleteMatchId] = useState<number | null>(null)
  const findMatch = useFindTransferMatch()

  const otherAccounts = accounts.filter(a => a.id !== currentAccountId)

  // The original tx sign tells us direction: negative = outflow (transfer TO), positive = inflow (transfer FROM)
  const isOutflow = tx.amount_cents < 0
  const directionLabel = isOutflow ? 'Transfer to' : 'Transfer from'

  // Search for matching transactions in target account when converting to transfer
  useEffect(() => {
    if (type !== 'transfer' || isExistingTransfer || !transferAccountId) {
      setTransferMatch(null)
      setDeleteMatchId(null)
      return
    }
    const cents = Math.abs(tx.amount_cents)
    if (cents <= 0) return

    findMatch.mutateAsync({
      source_account_id: currentAccountId,
      target_account_id: transferAccountId,
      amount_cents: cents,
      posted_date: date
    }).then(matches => {
      setTransferMatch(matches.length > 0 ? matches[0] : null)
      setDeleteMatchId(null)
    }).catch(() => {
      setTransferMatch(null)
    })
  }, [type, transferAccountId])

  const doSave = () => {
    // Converting a non-transfer to transfer
    if (type === 'transfer' && !isExistingTransfer) {
      if (!transferAccountId) return
      onConvertToTransfer(transferAccountId, deleteMatchId ?? undefined)
      return
    }
    const cents = parseCurrency(amount)
    onSave({
      posted_date: date,
      amount_cents: applyTypeSign(type, cents),
      payee_raw: payee,
      memo,
      category_id: categoryId
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') doSave()
    if (e.key === 'Escape') onCancel()
  }

  return (
    <>
    <tr className="bg-blue-50 dark:bg-blue-950">
      <td className="px-4 py-1">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full px-1 py-1 text-sm border border-input-border rounded bg-input"
        />
      </td>
      <td className="px-4 py-1">
        {isExistingTransfer ? (
          <span className="text-sm text-purple-600 font-medium px-1">Transfer</span>
        ) : (
          <select
            value={type}
            onChange={(e) => setType(e.target.value as TxType)}
            className="w-full px-1 py-1 text-sm border border-input-border rounded bg-input"
          >
            <option value="debit">Debit</option>
            <option value="credit">Credit</option>
            <option value="transfer">Transfer</option>
          </select>
        )}
      </td>
      <td className="px-4 py-1">
        {isExistingTransfer ? (
          <span className="text-sm text-purple-600 px-2">
            {tx.display_name || tx.payee_normalized || 'Transfer'}
          </span>
        ) : type === 'transfer' ? (
          <div className="flex items-center gap-1">
            <span className="text-xs text-purple-600 font-medium whitespace-nowrap">{directionLabel}</span>
            <select
              value={transferAccountId ?? ''}
              onChange={(e) => setTransferAccountId(e.target.value ? Number(e.target.value) : null)}
              className="flex-1 px-1 py-1 text-sm border border-input-border rounded bg-input"
            >
              <option value="">Select account...</option>
              {otherAccounts.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
        ) : (
          <input
            type="text"
            value={payee}
            onChange={(e) => setPayee(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full px-2 py-1 text-sm border border-input-border rounded bg-input"
          />
        )}
      </td>
      <td className="px-4 py-1">
        {type === 'transfer' ? (
          <span className="text-sm text-content-tertiary px-1">—</span>
        ) : (
          <select
            value={categoryId ?? ''}
            onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)}
            className="w-full px-1 py-1 text-sm border border-input-border rounded bg-input"
          >
            <option value="">—</option>
            {categories.filter((c) => !c.parent_id).map((parent) => (
              <optgroup key={parent.id} label={parent.name}>
                <option value={parent.id}>{parent.name}</option>
                {categories.filter((c) => c.parent_id === parent.id).map((child) => (
                  <option key={child.id} value={child.id}>{child.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        )}
      </td>
      <td className="px-4 py-1">
        <input
          type="text"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full px-2 py-1 text-sm border border-input-border rounded bg-input"
        />
      </td>
      <td className="px-4 py-1">
        <input
          type="text"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full px-2 py-1 text-sm text-right font-mono border border-input-border rounded bg-input"
        />
      </td>
      {showBalance && <td className="px-4 py-1"></td>}
      <td className="px-4 py-1 text-right">
        <div className="flex justify-end gap-1">
          <button
            onClick={doSave}
            className="p-1 text-green-600 hover:text-green-700 rounded"
            title="Save"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </button>
          <button
            onClick={onCancel}
            className="p-1 text-content-tertiary hover:text-content-secondary rounded"
            title="Cancel"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </td>
    </tr>
    {transferMatch && !deleteMatchId && (
      <tr className="bg-yellow-50 dark:bg-yellow-950">
        <td colSpan={showBalance ? 8 : 7} className="px-4 py-2 text-sm">
          <div className="flex items-center justify-between">
            <span>
              Found matching {formatCurrency(transferMatch.amount_cents)} transaction
              in <strong>{transferMatch.account_name}</strong> on{' '}
              {format(parseISO(transferMatch.posted_date), 'MM/dd/yyyy')}
              {transferMatch.payee_raw && <> ({transferMatch.payee_raw})</>}
              {' '}&mdash; delete duplicate?
            </span>
            <div className="flex gap-2 ml-4">
              <button
                onClick={() => setDeleteMatchId(transferMatch.transaction_id)}
                className="px-2 py-0.5 text-xs bg-green-600 text-white rounded hover:bg-green-700"
              >
                Yes
              </button>
              <button
                onClick={() => setTransferMatch(null)}
                className="px-2 py-0.5 text-xs border border-border-strong rounded hover:bg-hover"
              >
                No
              </button>
            </div>
          </div>
        </td>
      </tr>
    )}
    {deleteMatchId && (
      <tr className="bg-green-50 dark:bg-green-950">
        <td colSpan={showBalance ? 8 : 7} className="px-4 py-2 text-sm text-green-700">
          Duplicate transaction will be deleted when you save.
        </td>
      </tr>
    )}
    </>
  )
}

// --- New entry row ---

interface EntryRowProps {
  defaultDate: string
  defaultType: TxType
  categories: Category[]
  accounts: Account[]
  currentAccountId: number
  showBalance: boolean
  onSubmit: (data: {
    posted_date: string
    amount_cents: number
    payee_raw: string
    memo: string
    type: TxType
    category_id: number | null
    transfer_to_account_id?: number
    delete_match_id?: number
  }) => Promise<void>
  isPending: boolean
  payeeSuggestions: string[]
  prefill?: { payee: string; amount: string; categoryId: number | null }
  onCancel?: () => void
}

function EntryRow({
  defaultDate,
  defaultType,
  categories,
  accounts,
  currentAccountId,
  showBalance,
  onSubmit,
  isPending,
  payeeSuggestions,
  prefill,
  onCancel,
}: EntryRowProps) {
  const [date, setDate] = useState(defaultDate)
  const [type, setType] = useState<TxType>(defaultType)
  const [payee, setPayee] = useState(prefill?.payee || '')
  const [memo, setMemo] = useState('')
  const [amount, setAmount] = useState(prefill?.amount || '')
  const [categoryId, setCategoryId] = useState<number | null>(prefill?.categoryId ?? null)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const dateRef = useRef<HTMLInputElement>(null)

  // Transfer-specific state
  const [transferAccountId, setTransferAccountId] = useState<number | null>(null)
  const [transferMatch, setTransferMatch] = useState<TransferMatch | null>(null)
  const [deleteMatchId, setDeleteMatchId] = useState<number | null>(null)
  const findMatch = useFindTransferMatch()

  const otherAccounts = accounts.filter(a => a.id !== currentAccountId)

  // Sync default type when parent updates it (after a submission)
  const prevDefault = useRef(defaultType)
  if (prevDefault.current !== defaultType) {
    prevDefault.current = defaultType
    setType(defaultType)
  }

  // Reset transfer state when switching away from transfer type
  const prevType = useRef(type)
  if (prevType.current !== type) {
    prevType.current = type
    if (type !== 'transfer') {
      setTransferAccountId(null)
      setTransferMatch(null)
      setDeleteMatchId(null)
    }
  }

  // Search for matching transactions in target account
  useEffect(() => {
    if (type !== 'transfer' || !transferAccountId || !amount) {
      setTransferMatch(null)
      setDeleteMatchId(null)
      return
    }
    const cents = parseCurrency(amount)
    if (cents <= 0) return

    findMatch.mutateAsync({
      source_account_id: currentAccountId,
      target_account_id: transferAccountId,
      amount_cents: cents,
      posted_date: date
    }).then(matches => {
      setTransferMatch(matches.length > 0 ? matches[0] : null)
      setDeleteMatchId(null)
    }).catch(() => {
      setTransferMatch(null)
    })
  }, [type, transferAccountId, amount, date])

  const isEmpty = type === 'transfer' ? !transferAccountId || !amount : !payee && !amount

  const filteredSuggestions = useMemo(() => {
    if (!payee.trim()) return []
    const query = payee.toLowerCase()
    const startsWith: string[] = []
    const contains: string[] = []
    for (const name of payeeSuggestions) {
      const lower = name.toLowerCase()
      if (lower.startsWith(query)) {
        startsWith.push(name)
      } else if (lower.includes(query)) {
        contains.push(name)
      }
    }
    return [...startsWith, ...contains].slice(0, 8)
  }, [payee, payeeSuggestions])

  const handleSubmit = async () => {
    if (!amount) return
    if (type === 'transfer' && !transferAccountId) return

    await onSubmit({
      posted_date: date,
      amount_cents: parseCurrency(amount),
      payee_raw: payee,
      memo,
      type,
      category_id: categoryId,
      transfer_to_account_id: type === 'transfer' ? transferAccountId! : undefined,
      delete_match_id: type === 'transfer' && deleteMatchId ? deleteMatchId : undefined
    })

    // Reset fields but keep type sticky
    setPayee('')
    setMemo('')
    setAmount('')
    setCategoryId(null)
    setTransferAccountId(null)
    setTransferMatch(null)
    setDeleteMatchId(null)
    dateRef.current?.focus()
  }

  const handlePayeeSelect = (value: string) => {
    setPayee(value)
    setShowSuggestions(false)
    setActiveIndex(-1)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isEmpty) {
      handleSubmit()
    }
  }

  const handlePayeeKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || filteredSuggestions.length === 0) {
      handleKeyDown(e)
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((idx) =>
        Math.min(idx + 1, filteredSuggestions.length - 1)
      )
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((idx) => Math.max(idx - 1, 0))
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0) {
        e.preventDefault()
        handlePayeeSelect(filteredSuggestions[activeIndex])
      } else {
        handleKeyDown(e)
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
      setActiveIndex(-1)
    }
  }

  return (
    <>
    <tr className={clsx(
      'border-t-2 border-border',
      prefill ? 'bg-amber-50 dark:bg-amber-950' : 'bg-surface-secondary/50'
    )}>
      <td className="px-4 py-1.5">
        <input
          ref={dateRef}
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full px-1 py-1 text-sm border border-input-border rounded bg-input"
        />
      </td>
      <td className="px-4 py-1.5">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as TxType)}
          className="w-full px-1 py-1 text-sm border border-input-border rounded bg-input"
        >
          <option value="debit">Debit</option>
          <option value="credit">Credit</option>
          <option value="transfer">Transfer</option>
        </select>
      </td>
      <td className="px-4 py-1.5">
        {type === 'transfer' ? (
          <div className="flex items-center gap-1">
            <span className="text-xs text-purple-600 font-medium whitespace-nowrap">Transfer to</span>
            <select
              value={transferAccountId ?? ''}
              onChange={(e) => setTransferAccountId(e.target.value ? Number(e.target.value) : null)}
              onKeyDown={handleKeyDown}
              className="flex-1 px-1 py-1 text-sm border border-input-border rounded bg-input"
            >
              <option value="">Select account...</option>
              {otherAccounts.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
        ) : (
          <div className="relative">
            <input
              type="text"
              value={payee}
              onChange={(e) => {
                setPayee(e.target.value)
                setShowSuggestions(true)
                setActiveIndex(-1)
              }}
              onKeyDown={handlePayeeKeyDown}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => {
                setTimeout(() => setShowSuggestions(false), 100)
              }}
              placeholder="Payee"
              className="w-full px-2 py-1 text-sm border border-input-border rounded bg-input placeholder-content-tertiary"
            />
            {showSuggestions && filteredSuggestions.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-surface border border-border rounded shadow-sm max-h-48 overflow-auto">
                {filteredSuggestions.map((name, index) => (
                  <button
                    key={name}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      handlePayeeSelect(name)
                    }}
                    className={clsx(
                      'w-full text-left px-2 py-1 text-sm hover:bg-hover',
                      index === activeIndex && 'bg-surface-tertiary'
                    )}
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </td>
      <td className="px-4 py-1.5">
        {type === 'transfer' ? (
          <span className="text-sm text-content-tertiary px-1">—</span>
        ) : (
          <select
            value={categoryId ?? ''}
            onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)}
            className="w-full px-1 py-1 text-sm border border-input-border rounded bg-input"
          >
            <option value="">—</option>
            {categories.filter((c) => !c.parent_id).map((parent) => (
              <optgroup key={parent.id} label={parent.name}>
                <option value={parent.id}>{parent.name}</option>
                {categories.filter((c) => c.parent_id === parent.id).map((child) => (
                  <option key={child.id} value={child.id}>{child.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        )}
      </td>
      <td className="px-4 py-1.5">
        <input
          type="text"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Memo"
          className="w-full px-2 py-1 text-sm border border-input-border rounded bg-input placeholder-content-tertiary"
        />
      </td>
      <td className="px-4 py-1.5">
        <input
          type="text"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="0.00"
          className="w-full px-2 py-1 text-sm text-right font-mono border border-input-border rounded bg-input placeholder-content-tertiary"
        />
      </td>
      {showBalance && <td className="px-4 py-1.5"></td>}
      <td className="px-4 py-1.5 text-right">
        <div className="flex justify-end gap-1">
          <button
            onClick={handleSubmit}
            disabled={isEmpty || isPending}
            className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {prefill ? 'Confirm' : 'Add'}
          </button>
          {onCancel && (
            <button
              onClick={onCancel}
              className="px-2 py-1 text-xs border border-border-strong rounded hover:bg-hover"
            >
              Cancel
            </button>
          )}
        </div>
      </td>
    </tr>
    {transferMatch && !deleteMatchId && (
      <tr className="bg-yellow-50 dark:bg-yellow-950">
        <td colSpan={showBalance ? 8 : 7} className="px-4 py-2 text-sm">
          <div className="flex items-center justify-between">
            <span>
              Found matching {formatCurrency(transferMatch.amount_cents)} transaction
              in <strong>{transferMatch.account_name}</strong> on{' '}
              {format(parseISO(transferMatch.posted_date), 'MM/dd/yyyy')}
              {transferMatch.payee_raw && <> ({transferMatch.payee_raw})</>}
              {' '}&mdash; link as transfer?
            </span>
            <div className="flex gap-2 ml-4">
              <button
                onClick={() => setDeleteMatchId(transferMatch.transaction_id)}
                className="px-2 py-0.5 text-xs bg-green-600 text-white rounded hover:bg-green-700"
              >
                Yes
              </button>
              <button
                onClick={() => setTransferMatch(null)}
                className="px-2 py-0.5 text-xs border border-border-strong rounded hover:bg-hover"
              >
                No
              </button>
            </div>
          </div>
        </td>
      </tr>
    )}
    {deleteMatchId && (
      <tr className="bg-green-50 dark:bg-green-950">
        <td colSpan={showBalance ? 8 : 7} className="px-4 py-2 text-sm text-green-700">
          Matching transaction will be replaced when you click Add.
        </td>
      </tr>
    )}
    </>
  )
}
