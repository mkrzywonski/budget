import { useState, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { format, startOfMonth, addMonths, subMonths, parseISO } from 'date-fns'
import { useAccount } from '../hooks/useAccounts'
import {
  useTransactions,
  useCreateTransaction,
  useUpdateTransaction,
  useDeleteTransaction
} from '../hooks/useTransactions'
import { useCreatePayee } from '../hooks/usePayees'
import { Transaction } from '../api/client'
import { formatCurrency, parseCurrency } from '../utils/format'
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

  const [currentDate, setCurrentDate] = useState(() => startOfMonth(new Date()))
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

  const createMutation = useCreateTransaction()
  const updateMutation = useUpdateTransaction()
  const deleteMutation = useDeleteTransaction()
  const createPayeeMutation = useCreatePayee()

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

  // Sort transactions
  const sorted = useMemo(() => {
    if (!transactions) return []
    const list = [...transactions]
    list.sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'posted_date':
          cmp = a.posted_date.localeCompare(b.posted_date)
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
  }, [transactions, sortField, sortDir])

  // Calculate running balance (always by date order, regardless of sort)
  const balanceMap = useMemo(() => {
    if (!transactions) return new Map<number, number>()
    const byDate = [...transactions].sort((a, b) =>
      a.posted_date.localeCompare(b.posted_date)
    )
    const map = new Map<number, number>()
    let balance = 0
    for (const tx of byDate) {
      balance += tx.amount_cents
      map.set(tx.id, balance)
    }
    return map
  }, [transactions])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
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

  const handleCreate = async (data: {
    posted_date: string
    amount_cents: number
    payee_raw: string
    memo: string
    type: TxType
  }) => {
    setLastType(data.type)
    await createMutation.mutateAsync({
      account_id: id,
      posted_date: data.posted_date,
      amount_cents: applyTypeSign(data.type, data.amount_cents),
      payee_raw: data.payee_raw || undefined,
      memo: data.memo || undefined
    })
  }

  const handleUpdate = async (
    txId: number,
    data: {
      posted_date?: string
      amount_cents?: number
      payee_raw?: string
      memo?: string
    }
  ) => {
    await updateMutation.mutateAsync({ id: txId, ...data })
    setEditingId(null)
  }

  const handleDelete = async (txId: number) => {
    await deleteMutation.mutateAsync(txId)
  }

  const prevMonth = () => setCurrentDate((d) => subMonths(d, 1))
  const nextMonth = () => setCurrentDate((d) => addMonths(d, 1))
  const goToToday = () => setCurrentDate(startOfMonth(new Date()))

  const sortIndicator = (field: SortField) => {
    if (sortField !== field) return <span className="text-gray-300 ml-1">↕</span>
    return <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
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
              className="p-2 hover:bg-gray-100 rounded"
            >
              ←
            </button>
            <button
              onClick={goToToday}
              className="px-3 py-1 text-sm font-medium"
            >
              {format(currentDate, 'MMMM yyyy')}
            </button>
            <button
              onClick={nextMonth}
              className="p-2 hover:bg-gray-100 rounded"
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
          <div className="p-6 text-gray-500">Loading transactions...</div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 sticky top-0">
              <tr className="text-left text-sm text-gray-500">
                <th
                  className="px-4 py-2 w-28 cursor-pointer select-none hover:text-gray-700"
                  onClick={() => handleSort('posted_date')}
                >
                  Date{sortIndicator('posted_date')}
                </th>
                <th
                  className="px-4 py-2 w-24 cursor-pointer select-none hover:text-gray-700"
                  onClick={() => handleSort('type')}
                >
                  Type{sortIndicator('type')}
                </th>
                <th
                  className="px-4 py-2 cursor-pointer select-none hover:text-gray-700"
                  onClick={() => handleSort('payee')}
                >
                  Payee{sortIndicator('payee')}
                </th>
                <th
                  className="px-4 py-2 cursor-pointer select-none hover:text-gray-700"
                  onClick={() => handleSort('category')}
                >
                  Category{sortIndicator('category')}
                </th>
                <th
                  className="px-4 py-2 cursor-pointer select-none hover:text-gray-700"
                  onClick={() => handleSort('memo')}
                >
                  Memo{sortIndicator('memo')}
                </th>
                <th
                  className="px-4 py-2 text-right w-28 cursor-pointer select-none hover:text-gray-700"
                  onClick={() => handleSort('amount_cents')}
                >
                  Amount{sortIndicator('amount_cents')}
                </th>
                <th className="px-4 py-2 text-right w-28">Balance</th>
                <th className="px-4 py-2 w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-8 text-center text-gray-500"
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
                    onSave={(data) => handleUpdate(tx.id, data)}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <TransactionRow
                    key={tx.id}
                    transaction={tx}
                    runningBalance={balanceMap.get(tx.id) ?? 0}
                    onEdit={() => setEditingId(tx.id)}
                    onDelete={() => handleDelete(tx.id)}
                    onAddPayee={() => handleAddPayee(tx)}
                  />
                )
              )}
              {/* Entry row */}
              <EntryRow
                defaultDate={entryDefaultDate}
                defaultType={lastType}
                onSubmit={handleCreate}
                isPending={createMutation.isPending}
              />
            </tbody>
          </table>
        )}
      </div>

      {/* Footer with totals */}
      <div className="bg-gray-50 border-t px-6 py-3">
        <div className="flex justify-end gap-8 text-sm">
          <div>
            <span className="text-gray-500">Month Total: </span>
            <span className="font-medium">
              {formatCurrency(
                (transactions || []).reduce(
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
  runningBalance: number
  onEdit: () => void
  onDelete: () => void
  onAddPayee: () => void
}

function TransactionRow({
  transaction: tx,
  runningBalance,
  onEdit,
  onDelete,
  onAddPayee
}: TransactionRowProps) {
  const isForecast = tx.transaction_type === 'forecast'

  return (
    <tr
      className={clsx(
        'group hover:bg-gray-50',
        isForecast && 'row-forecast'
      )}
    >
      <td className="px-4 py-2 text-sm">
        {format(parseISO(tx.posted_date), 'MM/dd')}
      </td>
      <td className={clsx('px-4 py-2 text-sm', TYPE_COLORS[deriveTxType(tx)])}>
        {TYPE_LABELS[deriveTxType(tx)]}
      </td>
      <td className="px-4 py-2">
        {tx.display_name || tx.payee_raw || '—'}
      </td>
      <td className="px-4 py-2 text-sm text-gray-500">
        {tx.category_id || '—'}
      </td>
      <td className="px-4 py-2 text-sm text-gray-500 truncate max-w-xs">
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
      <td className="px-4 py-2 text-right font-mono text-sm">
        {formatCurrency(runningBalance)}
      </td>
      <td className="px-4 py-1 text-right">
        <div className="invisible group-hover:visible flex justify-end gap-1">
          <button
            onClick={onAddPayee}
            disabled={!tx.payee_raw && !tx.display_name}
            className="p-1 text-gray-400 hover:text-emerald-600 rounded disabled:opacity-40"
            title="Add payee rule"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
          <button
            onClick={onEdit}
            className="p-1 text-gray-400 hover:text-blue-600 rounded"
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
            className="p-1 text-gray-400 hover:text-red-600 rounded"
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
          <button
            className="p-1 text-gray-400 hover:text-purple-600 rounded"
            title="Recurrence"
            disabled
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
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </div>
      </td>
    </tr>
  )
}

// --- Inline edit row ---

interface EditRowProps {
  transaction: Transaction
  onSave: (data: {
    posted_date: string
    amount_cents: number
    payee_raw: string
    memo: string
  }) => void
  onCancel: () => void
}

function EditRow({ transaction: tx, onSave, onCancel }: EditRowProps) {
  const [date, setDate] = useState(tx.posted_date)
  const [type, setType] = useState<TxType>(deriveTxType(tx))
  const [payee, setPayee] = useState(tx.payee_raw || '')
  const [memo, setMemo] = useState(tx.memo || '')
  const [amount, setAmount] = useState(
    (Math.abs(tx.amount_cents) / 100).toFixed(2)
  )

  const doSave = () => {
    const cents = parseCurrency(amount)
    onSave({
      posted_date: date,
      amount_cents: applyTypeSign(type, cents),
      payee_raw: payee,
      memo
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') doSave()
    if (e.key === 'Escape') onCancel()
  }

  return (
    <tr className="bg-blue-50">
      <td className="px-4 py-1">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full px-1 py-1 text-sm border border-gray-300 rounded"
        />
      </td>
      <td className="px-4 py-1">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as TxType)}
          className="w-full px-1 py-1 text-sm border border-gray-300 rounded"
        >
          <option value="debit">Debit</option>
          <option value="credit">Credit</option>
          <option value="transfer">Transfer</option>
        </select>
      </td>
      <td className="px-4 py-1">
        <input
          type="text"
          value={payee}
          onChange={(e) => setPayee(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
        />
      </td>
      <td className="px-4 py-1 text-sm text-gray-400">—</td>
      <td className="px-4 py-1">
        <input
          type="text"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
        />
      </td>
      <td className="px-4 py-1">
        <input
          type="text"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full px-2 py-1 text-sm text-right font-mono border border-gray-300 rounded"
        />
      </td>
      <td className="px-4 py-1"></td>
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
            className="p-1 text-gray-400 hover:text-gray-600 rounded"
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
  )
}

// --- New entry row ---

interface EntryRowProps {
  defaultDate: string
  defaultType: TxType
  onSubmit: (data: {
    posted_date: string
    amount_cents: number
    payee_raw: string
    memo: string
    type: TxType
  }) => Promise<void>
  isPending: boolean
}

function EntryRow({ defaultDate, defaultType, onSubmit, isPending }: EntryRowProps) {
  const [date, setDate] = useState(defaultDate)
  const [type, setType] = useState<TxType>(defaultType)
  const [payee, setPayee] = useState('')
  const [memo, setMemo] = useState('')
  const [amount, setAmount] = useState('')
  const dateRef = useRef<HTMLInputElement>(null)

  // Sync default type when parent updates it (after a submission)
  const prevDefault = useRef(defaultType)
  if (prevDefault.current !== defaultType) {
    prevDefault.current = defaultType
    setType(defaultType)
  }

  const isEmpty = !payee && !amount

  const handleSubmit = async () => {
    if (!amount) return

    await onSubmit({
      posted_date: date,
      amount_cents: parseCurrency(amount),
      payee_raw: payee,
      memo,
      type
    })

    // Reset fields but keep type sticky
    setPayee('')
    setMemo('')
    setAmount('')
    dateRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isEmpty) {
      handleSubmit()
    }
  }

  return (
    <tr className="bg-gray-50/50 border-t-2 border-gray-200">
      <td className="px-4 py-1.5">
        <input
          ref={dateRef}
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full px-1 py-1 text-sm border border-gray-300 rounded bg-white"
        />
      </td>
      <td className="px-4 py-1.5">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as TxType)}
          className="w-full px-1 py-1 text-sm border border-gray-300 rounded bg-white"
        >
          <option value="debit">Debit</option>
          <option value="credit">Credit</option>
          <option value="transfer">Transfer</option>
        </select>
      </td>
      <td className="px-4 py-1.5">
        <input
          type="text"
          value={payee}
          onChange={(e) => setPayee(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Payee"
          className="w-full px-2 py-1 text-sm border border-gray-300 rounded bg-white placeholder-gray-300"
        />
      </td>
      <td className="px-4 py-1.5 text-sm text-gray-300">—</td>
      <td className="px-4 py-1.5">
        <input
          type="text"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Memo"
          className="w-full px-2 py-1 text-sm border border-gray-300 rounded bg-white placeholder-gray-300"
        />
      </td>
      <td className="px-4 py-1.5">
        <input
          type="text"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="0.00"
          className="w-full px-2 py-1 text-sm text-right font-mono border border-gray-300 rounded bg-white placeholder-gray-300"
        />
      </td>
      <td className="px-4 py-1.5"></td>
      <td className="px-4 py-1.5 text-right">
        <button
          onClick={handleSubmit}
          disabled={isEmpty || isPending}
          className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Add
        </button>
      </td>
    </tr>
  )
}
