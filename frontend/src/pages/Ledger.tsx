import { useState, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { format, startOfMonth, addMonths, subMonths } from 'date-fns'
import { useAccount } from '../hooks/useAccounts'
import { useTransactions } from '../hooks/useTransactions'
import { Transaction } from '../api/client'
import ImportModal from '../components/ImportModal'
import clsx from 'clsx'

export default function Ledger() {
  const { accountId } = useParams<{ accountId: string }>()
  const id = Number(accountId)

  const [currentDate, setCurrentDate] = useState(() => startOfMonth(new Date()))
  const [showImport, setShowImport] = useState(false)

  const { data: account } = useAccount(id)
  const { data: transactions, isLoading } = useTransactions({
    accountId: id,
    year: currentDate.getFullYear(),
    month: currentDate.getMonth() + 1
  })

  // Calculate running balance
  const transactionsWithBalance = useMemo(() => {
    if (!transactions) return []

    let balance = 0 // TODO: Get starting balance from previous months
    return transactions.map((tx) => {
      balance += tx.amount_cents
      return { ...tx, runningBalance: balance }
    })
  }, [transactions])

  const prevMonth = () => setCurrentDate((d) => subMonths(d, 1))
  const nextMonth = () => setCurrentDate((d) => addMonths(d, 1))
  const goToToday = () => setCurrentDate(startOfMonth(new Date()))

  const formatAmount = (cents: number) => {
    const dollars = cents / 100
    return dollars.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD'
    })
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-semibold">{account?.name || 'Loading...'}</h1>
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
                <th className="px-4 py-2 w-28">Date</th>
                <th className="px-4 py-2">Payee</th>
                <th className="px-4 py-2">Category</th>
                <th className="px-4 py-2">Memo</th>
                <th className="px-4 py-2 text-right w-28">Amount</th>
                <th className="px-4 py-2 text-right w-28">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {transactionsWithBalance.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    No transactions this month
                  </td>
                </tr>
              ) : (
                transactionsWithBalance.map((tx) => (
                  <TransactionRow
                    key={tx.id}
                    transaction={tx}
                    formatAmount={formatAmount}
                  />
                ))
              )}
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
              {formatAmount(
                transactionsWithBalance.reduce((sum, tx) => sum + tx.amount_cents, 0)
              )}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

interface TransactionRowProps {
  transaction: Transaction & { runningBalance: number }
  formatAmount: (cents: number) => string
}

function TransactionRow({ transaction: tx, formatAmount }: TransactionRowProps) {
  const isForecast = tx.transaction_type === 'forecast'

  return (
    <tr
      className={clsx(
        'hover:bg-gray-50',
        isForecast && 'row-forecast'
      )}
    >
      <td className="px-4 py-2 text-sm">
        {format(new Date(tx.posted_date), 'MM/dd')}
      </td>
      <td className="px-4 py-2">
        {tx.payee_normalized || tx.payee_raw || '—'}
      </td>
      <td className="px-4 py-2 text-sm text-gray-500">
        {/* TODO: Show category name */}
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
        {formatAmount(tx.amount_cents)}
      </td>
      <td className="px-4 py-2 text-right font-mono text-sm">
        {formatAmount(tx.runningBalance)}
      </td>
    </tr>
  )
}
