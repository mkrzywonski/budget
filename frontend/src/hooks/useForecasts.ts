import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, Forecast } from '../api/client'

export function useForecasts(accountId: number, startDate: string, endDate: string) {
  return useQuery({
    queryKey: ['forecasts', accountId, startDate, endDate],
    queryFn: () =>
      api.get<Forecast[]>(
        `/forecasts/?account_id=${accountId}&start_date=${startDate}&end_date=${endDate}`
      ),
    enabled: !!accountId && !!startDate && !!endDate,
  })
}

export function useDismissForecast() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: { payee_id: number; account_id: number; period_date: string }) =>
      api.post('/forecasts/dismiss', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forecasts'] })
    },
  })
}

export function useDismissalCount(payeeId: number | null) {
  return useQuery({
    queryKey: ['forecast-dismissals', 'count', payeeId],
    queryFn: () => api.get<{ count: number }>(`/forecasts/dismissals/count?payee_id=${payeeId}`),
    enabled: payeeId !== null,
  })
}

export function useClearDismissals() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payeeId: number) =>
      api.delete(`/forecasts/dismissals?payee_id=${payeeId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forecast-dismissals'] })
      queryClient.invalidateQueries({ queryKey: ['forecasts'] })
    },
  })
}
