import { useQuery } from '@tanstack/react-query'
import { api, CategorySpendItem, PayeeSpendItem, MonthlySpendItem, Transaction } from '../api/client'

export interface ReportFilters {
  startDate?: string
  endDate?: string
  accountIds?: number[]
  categoryIds?: number[]
  includeTransfers?: boolean
  groupByParent?: boolean
}

function buildQuery(filters: ReportFilters) {
  const params = new URLSearchParams()
  if (filters.startDate) params.set('start_date', filters.startDate)
  if (filters.endDate) params.set('end_date', filters.endDate)
  if (filters.includeTransfers) params.set('include_transfers', 'true')
  if (filters.groupByParent !== undefined) params.set('group_by_parent', String(filters.groupByParent))
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

export function useCategoryChildren(parentId: number | null, filters: ReportFilters) {
  const params = new URLSearchParams()
  if (filters.startDate) params.set('start_date', filters.startDate)
  if (filters.endDate) params.set('end_date', filters.endDate)
  if (filters.includeTransfers) params.set('include_transfers', 'true')
  if (filters.accountIds) {
    filters.accountIds.forEach((id) => params.append('account_id', String(id)))
  }
  const qs = params.toString()
  return useQuery({
    queryKey: ['reports', 'category-children', parentId, filters],
    queryFn: () => api.get<CategorySpendItem[]>(`/reports/spending-by-category/${parentId}/children${qs ? `?${qs}` : ''}`),
    enabled: parentId !== null,
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

export interface DrillDownFilters {
  startDate?: string
  endDate?: string
  categoryIds?: number[]
  uncategorized?: boolean
  payeeName?: string
  accountIds?: number[]
  amountSign?: 'positive' | 'negative'
  includeTransfers?: boolean
}

export function useReportTransactions(filters: DrillDownFilters | null) {
  const params = new URLSearchParams()
  if (filters?.startDate) params.set('start_date', filters.startDate)
  if (filters?.endDate) params.set('end_date', filters.endDate)
  if (filters?.uncategorized) params.set('uncategorized', 'true')
  if (filters?.amountSign) params.set('amount_sign', filters.amountSign)
  if (filters?.payeeName) params.set('payee_name', filters.payeeName)
  if (filters?.includeTransfers === false) params.set('include_transfers', 'false')
  if (filters?.categoryIds) {
    filters.categoryIds.forEach((id) => params.append('category_id', String(id)))
  }
  if (filters?.accountIds) {
    filters.accountIds.forEach((id) => params.append('account_id', String(id)))
  }
  const qs = params.toString()
  return useQuery({
    queryKey: ['report-transactions', filters],
    queryFn: () => api.get<Transaction[]>(`/transactions/${qs ? `?${qs}` : ''}`),
    enabled: filters !== null,
  })
}
