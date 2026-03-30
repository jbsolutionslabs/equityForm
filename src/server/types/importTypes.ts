import type { AssetClass } from '../../state/accountingTypes'

export type ImportMode = 'LATEST_MONTH' | 'AVERAGE_MONTH' | 'YTD_TOTAL' | 'ANNUALIZED'

export type DetectedMonthColumn = {
  sheetName: string
  columnIndex: number
  rawHeader: string
  normalizedMonthKey: string
}

export type CellRecord = {
  sheetName: string
  row: number
  col: number
  address: string
  value: string | number | null
  rowText: string[]
  colText: string[]
}

export type ImportedFieldSource = {
  sheetName: string
  cell: string
  matchedLabel: string
}

export type ImportedFieldResult = {
  fieldKey: string
  value: number | string | boolean | null
  confidence: number
  source?: ImportedFieldSource
  warnings?: string[]
}

export type ImportResponse = {
  fields: ImportedFieldResult[]
  warnings: string[]
}

export type MultiMonthImportResult = {
  months: Record<string, ImportedFieldResult[]>
  warnings: string[]
}

export type ImportFieldRule = {
  fieldKey: string
  aliases: string[]
  sheetHints?: string[]
  sectionHints?: string[]
  type: 'number' | 'string' | 'boolean'
  normalize?: (value: unknown) => unknown
}

export type ParsedSheet = {
  name: string
  rows: Array<Array<string | number | null>>
}

export type ParsedWorkbook = {
  fileName: string
  sheets: ParsedSheet[]
}

export type ImportRequest = {
  file: File | ArrayBuffer
  importMode: ImportMode
  assetClass: AssetClass
}

export type MatchResult = {
  record: CellRecord
  matchedLabel: string
  matchType: 'exact' | 'alias' | 'fuzzy'
  baseScore: number
}