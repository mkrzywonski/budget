import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, BookStatus, RecentBook } from '../api/client'

export function useBookStatus() {
  return useQuery({
    queryKey: ['bookStatus'],
    queryFn: () => api.get<BookStatus>('/books/status')
  })
}

export function useRecentBooks() {
  return useQuery({
    queryKey: ['recentBooks'],
    queryFn: () => api.get<RecentBook[]>('/books/recent')
  })
}

export function useOpenBook() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: { path: string; name?: string }) =>
      api.post<BookStatus>('/books/open', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookStatus'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
    }
  })
}

export function useCreateBook() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: { path: string; name?: string }) =>
      api.post<BookStatus>('/books/create', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookStatus'] })
      queryClient.invalidateQueries({ queryKey: ['recentBooks'] })
    }
  })
}

export function useCloseBook() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => api.post('/books/close'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookStatus'] })
    }
  })
}
