import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, Budget, BudgetVsActualResponse } from '../api/client'

export function useBudgets() {
  return useQuery({
    queryKey: ['budgets'],
    queryFn: () => api.get<Budget[]>('/budgets/')
  })
}

export function useBudget(id: number | null) {
  return useQuery({
    queryKey: ['budgets', id],
    queryFn: () => api.get<Budget>(`/budgets/${id}`),
    enabled: id !== null
  })
}

export function useCreateBudget() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: { name: string; account_ids?: number[]; items?: { category_id: number; amount_cents: number }[] }) =>
      api.post<Budget>('/budgets/', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] })
    }
  })
}

export function useUpdateBudget() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, ...data }: {
      id: number
      name?: string
      is_active?: boolean
      account_ids?: number[]
      items?: { category_id: number; amount_cents: number }[]
    }) => api.patch<Budget>(`/budgets/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] })
    }
  })
}

export function useDeleteBudget() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => api.delete(`/budgets/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] })
    }
  })
}

export function useAutoPopulateBudget() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, ...data }: {
      id: number
      start_date: string
      end_date: string
      account_ids?: number[]
    }) => api.post<Budget>(`/budgets/${id}/auto-populate`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] })
    }
  })
}

export function useBudgetVsActual(
  budgetId: number | null,
  startDate: string,
  endDate: string,
) {
  return useQuery({
    queryKey: ['budgets', 'vs-actual', budgetId, startDate, endDate],
    queryFn: () =>
      api.get<BudgetVsActualResponse>(
        `/budgets/${budgetId}/vs-actual?start_date=${startDate}&end_date=${endDate}`
      ),
    enabled: budgetId !== null && !!startDate && !!endDate
  })
}
