/**
 * Format cents as a currency string.
 */
export function formatCurrency(cents: number, currency = 'USD'): string {
  const dollars = cents / 100
  return dollars.toLocaleString('en-US', {
    style: 'currency',
    currency
  })
}

/**
 * Parse a currency string to cents.
 */
export function parseCurrency(value: string): number {
  // Remove currency symbols, spaces, and commas
  const cleaned = value.replace(/[$,\s]/g, '')
  const dollars = parseFloat(cleaned)
  if (isNaN(dollars)) return 0
  return Math.round(dollars * 100)
}
