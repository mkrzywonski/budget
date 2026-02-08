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
  show_running_balance: boolean
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
  display_name: string | null
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

export interface TransferMatch {
  transaction_id: number
  account_id: number
  account_name: string
  posted_date: string
  amount_cents: number
  payee_raw: string | null
  display_name: string | null
  memo: string | null
}

export interface Category {
  id: number
  name: string
  parent_id: number | null
  display_order: number
  created_at: string
  updated_at: string
}

export interface MatchPattern {
  type: 'starts_with' | 'contains' | 'exact' | 'regex'
  pattern: string
}

export interface RecurringRule {
  account_id: number
  frequency: 'monthly' | 'every_n_months' | 'annual'
  frequency_n: number
  day_of_month: number
  amount_method: 'fixed' | 'copy_last' | 'average'
  fixed_amount_cents: number | null
  average_count: number
  start_date: string
  end_date: string | null
  category_id: number | null
}

export interface Payee {
  id: number
  name: string
  match_patterns: MatchPattern[]
  default_category_id: number | null
  recurring_rule: RecurringRule | null
  created_at: string
  updated_at: string
}

export interface Forecast extends Transaction {
  payee_id: number
  period_date: string
}

export interface CategorySpendItem {
  category_id: number | null
  category_name: string
  income_cents: number
  expense_cents: number
  transaction_count: number
  children?: CategorySpendItem[] | null
}

export interface PayeeSpendItem {
  payee_name: string
  income_cents: number
  expense_cents: number
  transaction_count: number
}

export interface MonthlySpendItem {
  year: number
  month: number
  income_cents: number
  expense_cents: number
}

export interface BudgetItem {
  id: number
  category_id: number
  amount_cents: number
}

export interface Budget {
  id: number
  name: string
  is_active: boolean
  account_ids: number[]
  items: BudgetItem[]
  created_at: string
  updated_at: string
}

export interface BudgetVsActualItem {
  category_id: number | null
  category_name: string
  parent_category_id: number | null
  budget_cents: number
  actual_cents: number
  difference_cents: number
  is_income: boolean
}

export interface BudgetVsActualMonth {
  year: number
  month: number
  items: BudgetVsActualItem[]
  total_budget_income: number
  total_actual_income: number
  total_budget_expense: number
  total_actual_expense: number
}

export interface BudgetVsActualResponse {
  budget_id: number
  budget_name: string
  months: BudgetVsActualMonth[]
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
