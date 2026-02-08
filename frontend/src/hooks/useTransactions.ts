import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, Transaction, TransferMatch } from '../api/client'

interface TransactionFilters {
  accountId?: number
  year?: number
  month?: number
}

export function useTransactions(filters: TransactionFilters) {
  const params = new URLSearchParams()
  if (filters.accountId) params.set('account_id', String(filters.accountId))
  if (filters.year) params.set('year', String(filters.year))
  if (filters.month) params.set('month', String(filters.month))

  const queryString = params.toString()

  return useQuery({
    queryKey: ['transactions', filters],
    queryFn: () => api.get<Transaction[]>(`/transactions/${queryString ? `?${queryString}` : ''}`),
    enabled: !!filters.accountId
  })
}

export function useBalanceBefore(accountId: number, beforeDate: string) {
  return useQuery({
    queryKey: ['balance-before', accountId, beforeDate],
    queryFn: () => api.get<{ balance_cents: number }>(
      `/transactions/balance-before?account_id=${accountId}&before_date=${beforeDate}`
    ),
    enabled: !!accountId && !!beforeDate
  })
}

export function useCreateTransaction() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: {
      account_id: number
      posted_date: string
      amount_cents: number
      payee_raw?: string
      memo?: string
      category_id?: number
      transfer_to_account_id?: number
      delete_match_id?: number
    }) => {
      const { delete_match_id, ...body } = data
      const qs = delete_match_id ? `?delete_match_id=${delete_match_id}` : ''
      return api.post<Transaction>(`/transactions/${qs}`, body)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['forecasts'] })
    }
  })
}

export function useUpdateTransaction() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, ...data }: {
      id: number
      posted_date?: string
      amount_cents?: number
      payee_raw?: string
      payee_normalized?: string
      memo?: string
      category_id?: number
      is_cleared?: boolean
    }) => api.patch<Transaction>(`/transactions/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
    }
  })
}

export function useDeleteTransaction() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => api.delete(`/transactions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
    }
  })
}

export function useCategorizeByPayee() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: {
      account_id: number
      payee: string
      category_id: number
    }) => api.post<{ updated_count: number }>('/transactions/categorize-by-payee', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
    }
  })
}

export function useFindTransferMatch() {
  return useMutation({
    mutationFn: (params: {
      source_account_id: number
      target_account_id: number
      amount_cents: number
      posted_date: string
    }) => {
      const qs = new URLSearchParams({
        source_account_id: String(params.source_account_id),
        target_account_id: String(params.target_account_id),
        amount_cents: String(params.amount_cents),
        posted_date: params.posted_date
      })
      return api.get<TransferMatch[]>(`/transactions/find-transfer-match?${qs}`)
    }
  })
}

export function useConvertToTransfer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, target_account_id, delete_match_id }: { id: number; target_account_id: number; delete_match_id?: number }) =>
      api.post<Transaction>(`/transactions/${id}/convert-to-transfer`, { target_account_id, delete_match_id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
    }
  })
}
