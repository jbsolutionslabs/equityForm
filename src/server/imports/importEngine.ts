import { parseWorkbook } from './workbook/parseWorkbook'
import { flattenWorkbook } from './workbook/flattenSheet'
import { importFieldRules } from './mapping/fieldRules'
import { matchField } from './mapping/matchField'
import { scoreConfidence } from './mapping/scoreConfidence'
import { normalizeValue } from './normalization/normalizeValue'
import type {
  CellRecord,
  DetectedMonthColumn,
  ImportRequest,
  ImportResponse,
  ImportedFieldResult,
  MatchResult,
  ParsedWorkbook,
} from '../types/importTypes'

const toBoolean = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['true', 'yes', 'y', '1'].includes(normalized)) return true
    if (['false', 'no', 'n', '0'].includes(normalized)) return false
  }
  return null
}

const toString = (value: unknown): string | null => {
  if (value === null || value === undefined) return null
  const asString = String(value).trim()
  return asString.length ? asString : null
}

const normalizeMatch = (
  match: MatchResult,
  ruleKey: string,
  importMode: ImportRequest['importMode'],
): number | string | boolean | null => {
  const normalized = normalizeValue(match.record.value, { fieldKey: ruleKey, importMode })
  return normalized
}

type ImportRecordRequest = Omit<ImportRequest, 'file'> & {
  records: CellRecord[]
  fileName: string
  sheetCount: number
  selectedMonthColumn?: DetectedMonthColumn
}

const filterRecordsByMonth = (records: CellRecord[], selectedMonthColumn?: DetectedMonthColumn) => {
  if (!selectedMonthColumn) return records
  return records.filter((record) => (
    record.sheetName === selectedMonthColumn.sheetName && record.col === selectedMonthColumn.columnIndex
  ))
}

export function importFromRecords(request: ImportRecordRequest): ImportResponse {
  const start = performance.now()
  const warnings: string[] = []
  const fields: ImportedFieldResult[] = []
  const scopedRecords = filterRecordsByMonth(request.records, request.selectedMonthColumn)

  if (request.selectedMonthColumn && scopedRecords.length === 0) {
    warnings.push(`No values found for ${request.selectedMonthColumn.rawHeader} in ${request.selectedMonthColumn.sheetName}.`)
  }

  importFieldRules.forEach((rule) => {
    const matches = matchField(rule, scopedRecords)
    if (!matches.length) {
      fields.push({ fieldKey: rule.fieldKey, value: null, confidence: 0 })
      return
    }

    const scored = matches.map((match) => ({
      match,
      confidence: scoreConfidence(rule, match, matches),
    }))

    scored.sort((a, b) => b.confidence - a.confidence)
    const best = scored.find((candidate) => normalizeMatch(candidate.match, rule.fieldKey, request.importMode) !== null)

    if (!best) {
      fields.push({ fieldKey: rule.fieldKey, value: null, confidence: 0 })
      return
    }

    let value = normalizeMatch(best.match, rule.fieldKey, request.importMode)

    if (rule.type === 'boolean') {
      value = toBoolean(value)
    } else if (rule.type === 'string') {
      value = toString(value)
    }

    if (value === null || value === undefined) {
      fields.push({ fieldKey: rule.fieldKey, value: null, confidence: 0 })
      return
    }

    const fieldWarnings = scored.length > 1
      ? ['Multiple label matches found; highest-confidence value selected.']
      : undefined

    fields.push({
      fieldKey: rule.fieldKey,
      value,
      confidence: best.confidence,
      source: {
        sheetName: best.match.record.sheetName,
        cell: best.match.record.address,
        matchedLabel: best.match.matchedLabel,
      },
      warnings: fieldWarnings,
    })
  })

  const missingCount = fields.filter((field) => field.value === null).length
  if (missingCount) {
    warnings.push(`${missingCount} fields could not be mapped from the spreadsheet.`)
  }

  const duration = performance.now() - start
  console.info('[SpreadsheetImport] File:', request.fileName)
  console.info('[SpreadsheetImport] Sheets:', request.sheetCount)
  console.info('[SpreadsheetImport] Month:', request.selectedMonthColumn?.normalizedMonthKey ?? 'all')
  console.info('[SpreadsheetImport] Fields extracted:', fields.length - missingCount)
  console.info('[SpreadsheetImport] Fields missing:', missingCount)
  console.info('[SpreadsheetImport] Execution time (ms):', Math.round(duration))

  return { fields, warnings }
}

type ImportSpreadsheetRequest = ImportRequest & {
  selectedMonthColumn?: DetectedMonthColumn
  parsedWorkbook?: ParsedWorkbook
}

export async function importSpreadsheet(request: ImportSpreadsheetRequest): Promise<ImportResponse> {
  const fileName = request.file instanceof File ? request.file.name : 'uploaded-spreadsheet'
  const parsed = request.parsedWorkbook ?? await parseWorkbook(request.file, fileName)
  const records = flattenWorkbook(parsed)

  return importFromRecords({
    records,
    fileName: parsed.fileName,
    sheetCount: parsed.sheets.length,
    importMode: request.importMode,
    assetClass: request.assetClass,
    selectedMonthColumn: request.selectedMonthColumn,
  })
}