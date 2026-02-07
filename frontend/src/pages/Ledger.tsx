import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { format, startOfMonth, addMonths, subMonths, parseISO } from 'date-fns'
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
import { Transaction, Account, Category, TransferMatch } from '../api/client'
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

  // Opening balance = sum of all transactions before this month
  const monthStart = format(currentDate, 'yyyy-MM-dd')
  const { data: balanceBeforeData } = useBalanceBefore(id, monthStart)
  const openingBalance = balanceBeforeData?.balance_cents ?? 0

  const showBalance = sortField === 'posted_date' && sortDir === 'asc'

  const { data: accounts } = useAccounts()
  const createMutation = useCreateTransaction()
  const updateMutation = useUpdateTransaction()
  const deleteMutation = useDeleteTransaction()
  const convertToTransferMutation = useConvertToTransfer()
  const categorizeByPayeeMutation = useCategorizeByPayee()
  const createPayeeMutation = useCreatePayee()
  const { data: payees } = usePayees()
  const { data: categories } = useCategories()

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

  // Calculate running balance starting from the opening balance
  const balanceMap = useMemo(() => {
    if (!transactions) return new Map<number, number>()
    const byDate = [...transactions].sort((a, b) =>
      a.posted_date.localeCompare(b.posted_date) || a.created_at.localeCompare(b.created_at)
    )
    const map = new Map<number, number>()
    let balance = openingBalance
    for (const tx of byDate) {
      balance += tx.amount_cents
      map.set(tx.id, balance)
    }
    return map
  }, [transactions, openingBalance])

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
                {showBalance && <th className="px-4 py-2 text-right w-28">Balance</th>}
                <th className="px-4 py-2 w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.length === 0 && (
                <tr>
                  <td
                    colSpan={showBalance ? 8 : 7}
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
                    onEdit={() => setEditingId(tx.id)}
                    onDelete={() => handleDelete(tx.id)}
                    onAddPayee={() => handleAddPayee(tx)}
                    onCategorize={(catId) => handleCategorize(tx, catId)}
                  />
                )
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
  categories: Category[]
  categoryMap: Map<number, string>
  runningBalance: number
  showBalance: boolean
  onEdit: () => void
  onDelete: () => void
  onAddPayee: () => void
  onCategorize: (categoryId: number) => void
}

function TransactionRow({
  transaction: tx,
  categories,
  categoryMap,
  runningBalance,
  showBalance,
  onEdit,
  onDelete,
  onAddPayee,
  onCategorize
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
      <td
        className="px-4 py-2 cursor-default"
        onContextMenu={handlePayeeContext}
      >
        {tx.display_name || tx.payee_raw || '—'}
        {contextMenu && (
          <div
            className="fixed z-50 bg-white border border-gray-200 rounded shadow-lg py-1 min-w-[160px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation()
                setContextMenu(null)
                onAddPayee()
              }}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100"
            >
              Create payee rule
            </button>
          </div>
        )}
      </td>
      <td className="px-4 py-2 text-sm text-gray-500">
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
            className="w-full px-1 py-0.5 text-sm border border-gray-200 rounded bg-transparent text-gray-400 hover:border-gray-400 cursor-pointer"
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
      {showBalance && (
        <td className="px-4 py-2 text-right font-mono text-sm">
          {formatCurrency(runningBalance)}
        </td>
      )}
      <td className="px-4 py-1 text-right">
        <div className="invisible group-hover:visible flex justify-end gap-1">
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
        {isExistingTransfer ? (
          <span className="text-sm text-purple-600 font-medium px-1">Transfer</span>
        ) : (
          <select
            value={type}
            onChange={(e) => setType(e.target.value as TxType)}
            className="w-full px-1 py-1 text-sm border border-gray-300 rounded"
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
              className="flex-1 px-1 py-1 text-sm border border-gray-300 rounded"
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
            className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
          />
        )}
      </td>
      <td className="px-4 py-1">
        {type === 'transfer' ? (
          <span className="text-sm text-gray-400 px-1">—</span>
        ) : (
          <select
            value={categoryId ?? ''}
            onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)}
            className="w-full px-1 py-1 text-sm border border-gray-300 rounded"
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
    {transferMatch && !deleteMatchId && (
      <tr className="bg-yellow-50">
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
                className="px-2 py-0.5 text-xs border border-gray-300 rounded hover:bg-gray-100"
              >
                No
              </button>
            </div>
          </div>
        </td>
      </tr>
    )}
    {deleteMatchId && (
      <tr className="bg-green-50">
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
  payeeSuggestions
}: EntryRowProps) {
  const [date, setDate] = useState(defaultDate)
  const [type, setType] = useState<TxType>(defaultType)
  const [payee, setPayee] = useState('')
  const [memo, setMemo] = useState('')
  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState<number | null>(null)
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
        {type === 'transfer' ? (
          <div className="flex items-center gap-1">
            <span className="text-xs text-purple-600 font-medium whitespace-nowrap">Transfer to</span>
            <select
              value={transferAccountId ?? ''}
              onChange={(e) => setTransferAccountId(e.target.value ? Number(e.target.value) : null)}
              onKeyDown={handleKeyDown}
              className="flex-1 px-1 py-1 text-sm border border-gray-300 rounded bg-white"
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
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded bg-white placeholder-gray-300"
            />
            {showSuggestions && filteredSuggestions.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded shadow-sm max-h-48 overflow-auto">
                {filteredSuggestions.map((name, index) => (
                  <button
                    key={name}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      handlePayeeSelect(name)
                    }}
                    className={clsx(
                      'w-full text-left px-2 py-1 text-sm hover:bg-gray-100',
                      index === activeIndex && 'bg-gray-100'
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
          <span className="text-sm text-gray-400 px-1">—</span>
        ) : (
          <select
            value={categoryId ?? ''}
            onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)}
            className="w-full px-1 py-1 text-sm border border-gray-300 rounded bg-white"
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
      {showBalance && <td className="px-4 py-1.5"></td>}
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
    {transferMatch && !deleteMatchId && (
      <tr className="bg-yellow-50">
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
                className="px-2 py-0.5 text-xs border border-gray-300 rounded hover:bg-gray-100"
              >
                No
              </button>
            </div>
          </div>
        </td>
      </tr>
    )}
    {deleteMatchId && (
      <tr className="bg-green-50">
        <td colSpan={showBalance ? 8 : 7} className="px-4 py-2 text-sm text-green-700">
          Matching transaction will be replaced when you click Add.
        </td>
      </tr>
    )}
    </>
  )
}
