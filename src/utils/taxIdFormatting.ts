export function onlyDigits(value: string, maxDigits: number) {
  return value.replace(/\D/g, '').slice(0, maxDigits)
}

/**
 * Formats a Fedwire IMAD-style wire confirmation number.
 * Strips non-alphanumeric characters, uppercases, and groups as:
 *   YYYYMMDD-BBBBBBBB-SSSSSS  (8 + 8 + 6 = 22 chars, 24 with hyphens)
 * Returns the raw cleaned string if fewer than 9 chars have been entered.
 */
export function formatWireConfirmation(value: string): string {
  const clean = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 22)
  if (clean.length <= 8)  return clean
  if (clean.length <= 16) return `${clean.slice(0, 8)}-${clean.slice(8)}`
  return `${clean.slice(0, 8)}-${clean.slice(8, 16)}-${clean.slice(16)}`
}

export function formatEin(value: string) {
  const digits = onlyDigits(value, 9)
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}-${digits.slice(2)}`
}

export function formatSsn(value: string) {
  const digits = onlyDigits(value, 9)
  if (digits.length <= 3) return digits
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`
}