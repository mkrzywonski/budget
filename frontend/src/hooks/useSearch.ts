import { useQuery } from '@tanstack/react-query'
import { api, Transaction } from '../api/client'

export interface SearchFilters {
  payeeSearch?: string
  accountId?: number
  categoryId?: number
  startDate?: string
  endDate?: string
  includeTransfers?: boolean
}

function hasActiveFilters(filters: SearchFilters): boolean {
  return !!(
    filters.payeeSearch ||
    filters.accountId ||
    filters.categoryId ||
    filters.startDate ||
    filters.endDate
  )
}

export function useSearchTransactions(filters: SearchFilters) {
  const params = new URLSearchParams()
  if (filters.payeeSearch) params.set('payee_search', filters.payeeSearch)
  if (filters.accountId) params.set('account_id', String(filters.accountId))
  if (filters.categoryId) params.append('category_id', String(filters.categoryId))
  if (filters.startDate) params.set('start_date', filters.startDate)
  if (filters.endDate) params.set('end_date', filters.endDate)
  if (filters.includeTransfers === false) params.set('include_transfers', 'false')
  const qs = params.toString()

  const enabled = hasActiveFilters(filters)

  return useQuery({
    queryKey: ['search-transactions', filters],
    queryFn: () => api.get<Transaction[]>(`/transactions/${qs ? `?${qs}` : ''}`),
    enabled,
  })
}
