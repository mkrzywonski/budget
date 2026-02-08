import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, Payee, MatchPattern, RecurringRule } from '../api/client'

export function usePayees() {
  return useQuery({
    queryKey: ['payees'],
    queryFn: () => api.get<Payee[]>('/payees/')
  })
}

export function useCreatePayee() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: {
      name: string
      match_patterns: MatchPattern[]
      default_category_id?: number | null
      recurring_rule?: RecurringRule | null
    }) =>
      api.post<Payee>('/payees/', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payees'] })
    }
  })
}

export function useUpdatePayee() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: number
      name?: string
      match_patterns?: MatchPattern[]
      default_category_id?: number | null
      recurring_rule?: RecurringRule | null
      remove_recurring_rule?: boolean
    }) => api.patch<Payee>(`/payees/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payees'] })
    }
  })
}

export function useDeletePayee() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => api.delete(`/payees/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payees'] })
    }
  })
}

export function useRematchPayees() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () =>
      api.post<{ updated_count: number }>('/payees/rematch'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payees'] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
    }
  })
}

export function useRematchPayee() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payeeId: number) =>
      api.post<{ updated_count: number }>(`/payees/${payeeId}/rematch`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payees'] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
    }
  })
}

export function usePayeeMatches(payeeId: number) {
  return useQuery({
    queryKey: ['payee-matches', payeeId],
    queryFn: () => api.get<string[]>(`/payees/${payeeId}/matches`)
  })
}

export function usePreviewPayeeMatches() {
  return useMutation({
    mutationFn: (data: { name: string; match_patterns: MatchPattern[] }) =>
      api.post<string[]>('/payees/preview-matches', data)
  })
}

export interface LatestPayeeTransaction {
  id: number
  account_id: number
  posted_date: string
  amount_cents: number
  category_id: number | null
}

export function useLatestPayeeTransaction(payeeId: number | null) {
  return useQuery({
    queryKey: ['payee-latest-tx', payeeId],
    queryFn: () => api.get<LatestPayeeTransaction | null>(`/payees/${payeeId}/latest-transaction`),
    enabled: payeeId !== null,
  })
}
