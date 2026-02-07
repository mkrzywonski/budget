import { useMemo, useState } from 'react'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { useAccounts } from '../hooks/useAccounts'
import { useCategories } from '../hooks/useCategories'
import { useSpendingByCategory, useSpendingByPayee, useSpendingTrends, ReportFilters } from '../hooks/useReports'
import { formatCurrency } from '../utils/format'

const TABS = ['Category', 'Trends', 'Payee'] as const

type Tab = typeof TABS[number]

export default function Reports() {
  const { data: accounts } = useAccounts()
  const { data: categories } = useCategories()

  const today = new Date()
  const [tab, setTab] = useState<Tab>('Category')
  const [startDate, setStartDate] = useState(format(startOfMonth(today), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(format(endOfMonth(today), 'yyyy-MM-dd'))
  const [accountIds, setAccountIds] = useState<number[]>([])
  const [categoryIds, setCategoryIds] = useState<number[]>([])
  const [includeTransfers, setIncludeTransfers] = useState(false)

  const filters: ReportFilters = useMemo(() => ({
    startDate,
    endDate,
    accountIds: accountIds.length ? accountIds : undefined,
    categoryIds: categoryIds.length ? categoryIds : undefined,
    includeTransfers
  }), [startDate, endDate, accountIds, categoryIds, includeTransfers])

  const categoryReport = useSpendingByCategory(filters)
  const payeeReport = useSpendingByPayee(filters)
  const trendsReport = useSpendingTrends(filters)

  const maxCategory = Math.max(0, ...(categoryReport.data?.map((c) => Math.abs(c.total_cents)) ?? []))
  const maxPayee = Math.max(0, ...(payeeReport.data?.map((p) => Math.abs(p.total_cents)) ?? []))
  const maxTrend = Math.max(0, ...(trendsReport.data?.map((m) => Math.abs(m.total_cents)) ?? []))

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-content-secondary">Spending insights by category, payee, and month.</p>
      </div>

      <div className="bg-surface rounded-lg border border-border p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-content mb-1">Start date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-input-border rounded bg-input"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-content mb-1">End date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-input-border rounded bg-input"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-content mb-1">Accounts</label>
            <select
              multiple
              value={accountIds.map(String)}
              onChange={(e) => {
                const ids = Array.from(e.target.selectedOptions).map((o) => Number(o.value))
                setAccountIds(ids)
              }}
              className="w-full px-3 py-2 border border-input-border rounded bg-input"
            >
              {accounts?.map((account) => (
                <option key={account.id} value={account.id}>{account.name}</option>
              ))}
            </select>
            <div className="text-xs text-content-tertiary mt-1">Hold Ctrl/Cmd to select multiple</div>
          </div>
          <div>
            <label className="block text-sm font-medium text-content mb-1">Categories</label>
            <select
              multiple
              value={categoryIds.map(String)}
              onChange={(e) => {
                const ids = Array.from(e.target.selectedOptions).map((o) => Number(o.value))
                setCategoryIds(ids)
              }}
              className="w-full px-3 py-2 border border-input-border rounded bg-input"
            >
              {categories?.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
            <div className="text-xs text-content-tertiary mt-1">Hold Ctrl/Cmd to select multiple</div>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <input
            id="includeTransfers"
            type="checkbox"
            checked={includeTransfers}
            onChange={(e) => setIncludeTransfers(e.target.checked)}
          />
          <label htmlFor="includeTransfers" className="text-sm text-content-secondary">
            Include transfers in totals
          </label>
        </div>
      </div>

      <div className="flex gap-2">
        {TABS.map((item) => (
          <button
            key={item}
            onClick={() => setTab(item)}
            className={`px-4 py-2 rounded border ${
              tab === item
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-surface text-content border-border hover:bg-hover'
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      {tab === 'Category' && (
        <div className="bg-surface rounded-lg border border-border p-4">
          <h2 className="text-lg font-semibold mb-4">Spending by Category</h2>
          {categoryReport.isLoading ? (
            <div className="text-content-secondary">Loading...</div>
          ) : categoryReport.data && categoryReport.data.length > 0 ? (
            <div className="space-y-3">
              {categoryReport.data.map((item) => (
                <div key={item.category_name} className="grid grid-cols-12 gap-3 items-center">
                  <div className="col-span-4 text-sm font-medium text-content-secondary truncate">
                    {item.category_name}
                  </div>
                  <div className="col-span-6">
                    <div className="w-full bg-surface-tertiary rounded h-3">
                      <div
                        className="h-3 rounded bg-blue-500"
                        style={{ width: `${maxCategory ? (Math.abs(item.total_cents) / maxCategory) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                  <div className="col-span-2 text-sm text-right">
                    {formatCurrency(item.total_cents)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-content-secondary">No data for this range.</div>
          )}
        </div>
      )}

      {tab === 'Trends' && (
        <div className="bg-surface rounded-lg border border-border p-4">
          <h2 className="text-lg font-semibold mb-4">Spending Trends</h2>
          {trendsReport.isLoading ? (
            <div className="text-content-secondary">Loading...</div>
          ) : trendsReport.data && trendsReport.data.length > 0 ? (
            <div className="flex items-end gap-2 h-48">
              {trendsReport.data.map((item) => {
                const height = maxTrend ? (Math.abs(item.total_cents) / maxTrend) * 100 : 0
                const label = format(new Date(item.year, item.month - 1, 1), 'MMM yyyy')
                return (
                  <div key={`${item.year}-${item.month}`} className="flex-1 flex flex-col items-center">
                    <div className="w-full flex-1 flex items-end">
                      <div
                        className="w-full bg-blue-500 rounded-t"
                        style={{ height: `${height}%` }}
                        title={`${label}: ${formatCurrency(item.total_cents)}`}
                      />
                    </div>
                    <div className="text-xs text-content-tertiary mt-2 text-center">
                      {format(new Date(item.year, item.month - 1, 1), 'MMM')}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-content-secondary">No data for this range.</div>
          )}
        </div>
      )}

      {tab === 'Payee' && (
        <div className="bg-surface rounded-lg border border-border p-4">
          <h2 className="text-lg font-semibold mb-4">Spending by Payee</h2>
          {payeeReport.isLoading ? (
            <div className="text-content-secondary">Loading...</div>
          ) : payeeReport.data && payeeReport.data.length > 0 ? (
            <div className="space-y-3">
              {payeeReport.data.map((item) => (
                <div key={item.payee_name} className="grid grid-cols-12 gap-3 items-center">
                  <div className="col-span-4 text-sm font-medium text-content-secondary truncate">
                    {item.payee_name}
                  </div>
                  <div className="col-span-6">
                    <div className="w-full bg-surface-tertiary rounded h-3">
                      <div
                        className="h-3 rounded bg-emerald-500"
                        style={{ width: `${maxPayee ? (Math.abs(item.total_cents) / maxPayee) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                  <div className="col-span-2 text-sm text-right">
                    {formatCurrency(item.total_cents)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-content-secondary">No data for this range.</div>
          )}
        </div>
      )}
    </div>
  )
}
