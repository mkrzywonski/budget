import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, Payee, MatchPattern } from '../api/client'

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
