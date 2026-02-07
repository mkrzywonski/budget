import { useQuery } from '@tanstack/react-query'
import { api, CategorySpendItem, PayeeSpendItem, MonthlySpendItem } from '../api/client'

export interface ReportFilters {
  startDate?: string
  endDate?: string
  accountIds?: number[]
  categoryIds?: number[]
  includeTransfers?: boolean
}

function buildQuery(filters: ReportFilters) {
  const params = new URLSearchParams()
  if (filters.startDate) params.set('start_date', filters.startDate)
  if (filters.endDate) params.set('end_date', filters.endDate)
  if (filters.includeTransfers) params.set('include_transfers', 'true')
  if (filters.accountIds) {
    filters.accountIds.forEach((id) => params.append('account_id', String(id)))
  }
  if (filters.categoryIds) {
    filters.categoryIds.forEach((id) => params.append('category_id', String(id)))
  }
  return params.toString()
}

export function useSpendingByCategory(filters: ReportFilters) {
  const qs = buildQuery(filters)
  return useQuery({
    queryKey: ['reports', 'category', filters],
    queryFn: () => api.get<CategorySpendItem[]>(`/reports/spending-by-category${qs ? `?${qs}` : ''}`)
  })
}

export function useSpendingByPayee(filters: ReportFilters) {
  const qs = buildQuery(filters)
  return useQuery({
    queryKey: ['reports', 'payee', filters],
    queryFn: () => api.get<PayeeSpendItem[]>(`/reports/spending-by-payee${qs ? `?${qs}` : ''}`)
  })
}

export function useSpendingTrends(filters: ReportFilters) {
  const qs = buildQuery(filters)
  return useQuery({
    queryKey: ['reports', 'trends', filters],
    queryFn: () => api.get<MonthlySpendItem[]>(`/reports/spending-trends${qs ? `?${qs}` : ''}`)
  })
}
