export function onlyDigits(value: string, maxDigits: number) {
  return value.replace(/\D/g, '').slice(0, maxDigits)
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