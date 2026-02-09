import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, BookStatus, RecentBook, BackupStatus } from '../api/client'

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
    mutationFn: (data: { path: string; name?: string; password?: string }) =>
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

export function useRenameBook() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (name: string) =>
      api.patch<BookStatus>('/books/rename', { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookStatus'] })
      queryClient.invalidateQueries({ queryKey: ['recentBooks'] })
    }
  })
}

export function useBackupStatus() {
  return useQuery({
    queryKey: ['backupStatus'],
    queryFn: () => api.get<BackupStatus>('/books/backup-status')
  })
}

export function useBackupBook() {
  const queryClient = useQueryClient()

  return {
    download: async () => {
      const response = await fetch('/api/books/backup')
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.detail || 'Backup failed')
      }
      const blob = await response.blob()
      const disposition = response.headers.get('content-disposition')
      const match = disposition?.match(/filename="?(.+?)"?$/)
      const filename = match?.[1] || 'backup.db'

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)

      queryClient.invalidateQueries({ queryKey: ['backupStatus'] })
    }
  }
}

export function useRestoreBook() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      const response = await fetch('/api/books/restore', {
        method: 'POST',
        body: formData,
      })
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.detail || 'Restore failed')
      }
      return response.json() as Promise<BookStatus>
    },
    onSuccess: () => {
      queryClient.invalidateQueries()
    }
  })
}

export function useSetPassword() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: { current_password?: string; new_password: string }) =>
      api.post('/books/password', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookStatus'] })
    }
  })
}

export function useRemovePassword() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: { current_password: string }) =>
      api.post('/books/password/remove', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookStatus'] })
    }
  })
}
