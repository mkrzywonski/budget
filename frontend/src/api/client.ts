const API_BASE = '/api'

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${endpoint}`
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.detail || `HTTP ${response.status}`)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json()
}

export const api = {
  get: <T>(endpoint: string) => request<T>(endpoint),

  post: <T>(endpoint: string, data?: unknown) =>
    request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined
    }),

  patch: <T>(endpoint: string, data: unknown) =>
    request<T>(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(data)
    }),

  delete: (endpoint: string) =>
    request<void>(endpoint, { method: 'DELETE' })
}

// Type definitions matching backend schemas
export interface Account {
  id: number
  name: string
  account_type: string
  institution: string | null
  notes: string | null
  display_order: number
  created_at: string
  updated_at: string
}

export interface Transaction {
  id: number
  account_id: number
  posted_date: string
  amount_cents: number
  amount: number
  payee_raw: string | null
  payee_normalized: string | null
  memo: string | null
  notes: string | null
  category_id: number | null
  transaction_type: 'actual' | 'forecast' | 'balance_adjustment' | 'transfer'
  source: 'manual' | 'import_csv' | 'import_qfx' | 'system'
  is_cleared: boolean
  transfer_link_id: number | null
  recurring_template_id: number | null
  created_at: string
  updated_at: string
}

export interface Category {
  id: number
  name: string
  parent_id: number | null
  display_order: number
  created_at: string
  updated_at: string
}

export interface BookStatus {
  is_open: boolean
  path: string | null
  name: string | null
}

export interface RecentBook {
  path: string
  name: string
  last_opened: string
}
