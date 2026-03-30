import type { ImportMode } from '../../types/importTypes'

const absoluteFields = new Set([
  'vacancyLoss',
  'concessions',
  'badDebt',
  'propertyTaxes',
  'capEx',
  'debtServiceInterest',
  'debtServicePrincipal',
  'actualLPDistribution',
  'actualGPDistribution',
])

export type NormalizeOptions = {
  fieldKey: string
  importMode: ImportMode
}

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number') return value
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null

  const isPercent = trimmed.includes('%')
  const normalized = trimmed
    .replace(/[$,]/g, '')
    .replace(/\s/g, '')

  const negative = /^\(.*\)$/.test(normalized)
  const numeric = parseFloat(normalized.replace(/[()]/g, ''))
  if (Number.isNaN(numeric)) return null

  let result = negative ? -numeric : numeric
  if (isPercent) result = result / 100
  return result
}

export function normalizeValue(value: unknown, options: NormalizeOptions): number | string | boolean | null {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string' && options.fieldKey === 'notes') return value

  const numeric = toNumber(value)
  if (numeric === null) {
    if (typeof value === 'string' && value.trim().length) return value.trim()
    return null
  }

  let normalized = numeric

  if (options.importMode === 'ANNUALIZED') {
    normalized = normalized / 12
  }

  if (absoluteFields.has(options.fieldKey)) {
    normalized = Math.abs(normalized)
  }

  return normalized
}