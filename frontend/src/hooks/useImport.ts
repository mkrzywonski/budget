import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'

export interface ColumnMappings {
  date: number
  amount?: number
  payee?: number
  memo?: number
}

export interface AmountConfig {
  type: 'single' | 'split'
  column?: number
  debit_column?: number
  credit_column?: number
  negate: boolean
}

export interface ParsedTransaction {
  row_index: number
  posted_date: string
  amount_cents: number
  amount: number
  payee_raw: string | null
  memo: string | null
  fingerprint: string
  raw_data: Record<string, string>
  warnings: string[]
}

export interface ExistingTransaction {
  id: number
  posted_date: string
  amount_cents: number
  payee_raw: string | null
  memo: string | null
}

export interface Duplicate {
  parsed: ParsedTransaction
  existing: ExistingTransaction
  fingerprint: string
}

export interface CSVPreviewResponse {
  headers: string[]
  header_signature: string
  detected_date_format: string | null
  detected_mappings: ColumnMappings | null
  batch_id: string
  new_transactions: ParsedTransaction[]
  duplicates: Duplicate[]
  total_count: number
  new_count: number
  duplicate_count: number
  error_count: number
  errors: string[]
  matched_profile_id: number | null
  matched_profile_name: string | null
}

export interface ImportCommitResponse {
  batch_id: string
  imported_count: number
  skipped_count: number
  transaction_ids: number[]
}

export interface ImportProfile {
  id: number
  account_id: number
  name: string
  header_signature: string[]
  column_mappings: Record<string, number>
  amount_config: AmountConfig
  date_format: string | null
  delimiter: string
  skip_rows: number
  has_header: boolean
}

export function usePreviewCSV() {
  return useMutation({
    mutationFn: (data: {
      content: string
      account_id: number
      delimiter?: string
      skip_rows?: number
      has_header?: boolean
      column_mappings?: ColumnMappings
      amount_config?: AmountConfig
      date_format?: string
    }) => api.post<CSVPreviewResponse>('/import/csv/preview', data)
  })
}

export function useCommitImport() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: {
      account_id: number
      batch_id: string
      transactions: ParsedTransaction[]
      accepted_duplicate_indices?: number[]
    }) => api.post<ImportCommitResponse>('/import/commit', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
    }
  })
}

export function useImportProfiles(accountId: number) {
  return useQuery({
    queryKey: ['importProfiles', accountId],
    queryFn: () => api.get<ImportProfile[]>(`/import/profiles/${accountId}`),
    enabled: !!accountId
  })
}

export function useSaveProfile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: {
      account_id: number
      headers: string[]
      column_mappings: ColumnMappings
      amount_config: AmountConfig
      date_format?: string
      delimiter?: string
      skip_rows?: number
      has_header?: boolean
    }) => api.post<ImportProfile>('/import/profiles', data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['importProfiles', variables.account_id] })
    }
  })
}
