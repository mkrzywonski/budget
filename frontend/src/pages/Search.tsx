import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, parseISO, startOfMonth } from 'date-fns'
import { useAccounts } from '../hooks/useAccounts'
import { useCategories } from '../hooks/useCategories'
import { useSearchTransactions, SearchFilters } from '../hooks/useSearch'
import { formatCurrency } from '../utils/format'
import clsx from 'clsx'

export default function Search() {
  const navigate = useNavigate()
  const { data: accounts } = useAccounts()
  const { data: categories } = useCategories()

  const [payeeSearch, setPayeeSearch] = useState(() => sessionStorage.getItem('search-payee') || '')
  const [accountId, setAccountId] = useState<number | undefined>(() => {
    const v = sessionStorage.getItem('search-account')
    return v ? Number(v) : undefined
  })
  const [categoryId, setCategoryId] = useState<number | undefined>(() => {
    const v = sessionStorage.getItem('search-category')
    return v ? Number(v) : undefined
  })
  const [startDate, setStartDate] = useState(() => sessionStorage.getItem('search-start') || '')
  const [endDate, setEndDate] = useState(() => sessionStorage.getItem('search-end') || '')
  const [includeTransfers, setIncludeTransfers] = useState(() => sessionStorage.getItem('search-transfers') !== 'false')

  useEffect(() => {
    payeeSearch ? sessionStorage.setItem('search-payee', payeeSearch) : sessionStorage.removeItem('search-payee')
    accountId ? sessionStorage.setItem('search-account', String(accountId)) : sessionStorage.removeItem('search-account')
    categoryId ? sessionStorage.setItem('search-category', String(categoryId)) : sessionStorage.removeItem('search-category')
    startDate ? sessionStorage.setItem('search-start', startDate) : sessionStorage.removeItem('search-start')
    endDate ? sessionStorage.setItem('search-end', endDate) : sessionStorage.removeItem('search-end')
    sessionStorage.setItem('search-transfers', String(includeTransfers))
  }, [payeeSearch, accountId, categoryId, startDate, endDate, includeTransfers])

  const clearFilters = () => {
    setPayeeSearch('')
    setAccountId(undefined)
    setCategoryId(undefined)
    setStartDate('')
    setEndDate('')
    setIncludeTransfers(true)
  }

  const filters: SearchFilters = useMemo(
    () => ({
      payeeSearch: payeeSearch || undefined,
      accountId,
      categoryId,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      includeTransfers: includeTransfers ? undefined : false,
    }),
    [payeeSearch, accountId, categoryId, startDate, endDate, includeTransfers]
  )

  const hasFilters = !!(payeeSearch || accountId || categoryId || startDate || endDate)
  const { data: transactions, isLoading } = useSearchTransactions(filters)

  const accountMap = useMemo(() => {
    const map = new Map<number, string>()
    if (accounts) for (const a of accounts) map.set(a.id, a.name)
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

  const navigateToLedger = (acctId: number, postedDate: string) => {
    const monthStart = format(startOfMonth(parseISO(postedDate)), 'yyyy-MM-dd')
    sessionStorage.setItem('ledger-month', monthStart)
    navigate(`/accounts/${acctId}`)
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Search</h1>

      {/* Filters */}
      <div className="bg-surface rounded-lg border border-border p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-content-secondary mb-1">Payee</label>
            <input
              type="text"
              value={payeeSearch}
              onChange={(e) => setPayeeSearch(e.target.value)}
              placeholder="Search payee name..."
              className="w-full px-3 py-1.5 text-sm border border-input-border rounded bg-input placeholder-content-tertiary"
            />
          </div>
          <div>
            <label className="block text-xs text-content-secondary mb-1">Account</label>
            <select
              value={accountId ?? ''}
              onChange={(e) => setAccountId(e.target.value ? Number(e.target.value) : undefined)}
              className="w-full px-3 py-1.5 text-sm border border-input-border rounded bg-input"
            >
              <option value="">All Accounts</option>
              {accounts?.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-content-secondary mb-1">Category</label>
            <select
              value={categoryId ?? ''}
              onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : undefined)}
              className="w-full px-3 py-1.5 text-sm border border-input-border rounded bg-input"
            >
              <option value="">All Categories</option>
              {categories?.filter((c) => !c.parent_id).map((parent) => (
                <optgroup key={parent.id} label={parent.name}>
                  <option value={parent.id}>{parent.name}</option>
                  {categories.filter((c) => c.parent_id === parent.id).map((child) => (
                    <option key={child.id} value={child.id}>{child.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-content-secondary mb-1">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border border-input-border rounded bg-input"
            />
          </div>
          <div>
            <label className="block text-xs text-content-secondary mb-1">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border border-input-border rounded bg-input"
            />
          </div>
          <div className="flex items-end pb-1 gap-3">
            <label className="flex items-center gap-2 text-sm text-content-secondary">
              <input
                type="checkbox"
                checked={includeTransfers}
                onChange={(e) => setIncludeTransfers(e.target.checked)}
              />
              Include transfers
            </label>
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="px-3 py-1 text-xs border border-border rounded hover:bg-hover text-content-secondary"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Results */}
      {!hasFilters ? (
        <div className="text-content-secondary text-sm p-4">Enter search criteria above.</div>
      ) : isLoading ? (
        <div className="text-content-secondary text-sm p-4">Searching...</div>
      ) : transactions && transactions.length > 0 ? (
        <div className="bg-surface rounded-lg border border-border p-4">
          <div className="text-xs text-content-secondary mb-3">
            {transactions.length} transaction{transactions.length !== 1 ? 's' : ''} found
          </div>
          <div className="overflow-auto">
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
                        onClick={() => navigateToLedger(tx.account_id, tx.posted_date)}
                      >
                        {accountMap.get(tx.account_id) || '\u2014'}
                      </button>
                    </td>
                    <td className="px-3 py-1.5">{tx.display_name || tx.payee_raw || '\u2014'}</td>
                    <td className="px-3 py-1.5 text-content-secondary">
                      {tx.category_id ? categoryMap.get(tx.category_id) || '\u2014' : '\u2014'}
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
        </div>
      ) : (
        <div className="text-content-secondary text-sm p-4">No transactions found.</div>
      )}
    </div>
  )
}
