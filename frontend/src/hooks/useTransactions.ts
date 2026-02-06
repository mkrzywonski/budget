import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, Transaction } from '../api/client'

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
    }) => api.post<Transaction>('/transactions/', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
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
