import { parseWorkbook } from './workbook/parseWorkbook'
import { flattenWorkbook } from './workbook/flattenSheet'
import { importFromRecords } from './importEngine'
import type {
  DetectedMonthColumn,
  ImportRequest,
  ImportedFieldResult,
  MultiMonthImportResult,
  ParsedWorkbook,
} from '../types/importTypes'

type MultiMonthImportRequest = ImportRequest & {
  selectedMonths: DetectedMonthColumn[]
  parsedWorkbook?: ParsedWorkbook
}

const countExtracted = (fields: ImportedFieldResult[]) => fields.filter((field) => field.value !== null).length

export async function runMultiMonthImport(request: MultiMonthImportRequest): Promise<MultiMonthImportResult> {
  const start = performance.now()
  const warnings: string[] = []
  const months: Record<string, ImportedFieldResult[]> = {}

  if (!request.selectedMonths.length) {
    return { months, warnings: ['No months were selected for import.'] }
  }

  const fileName = request.file instanceof File ? request.file.name : 'uploaded-spreadsheet'
  const parsed = request.parsedWorkbook ?? await parseWorkbook(request.file, fileName)
  const records = flattenWorkbook(parsed)

  console.info('[SpreadsheetImport] Detected months:', request.selectedMonths.map((month) => month.normalizedMonthKey))

  request.selectedMonths.forEach((month) => {
    if (months[month.normalizedMonthKey]) {
      warnings.push(`Duplicate month detected for ${month.normalizedMonthKey}; using first match.`)
      return
    }

    const response = importFromRecords({
      records,
      fileName: parsed.fileName,
      sheetCount: parsed.sheets.length,
      importMode: request.importMode,
      assetClass: request.assetClass,
      selectedMonthColumn: month,
    })

    months[month.normalizedMonthKey] = response.fields
    warnings.push(...response.warnings.map((warning) => `[${month.normalizedMonthKey}] ${warning}`))
    console.info(`[SpreadsheetImport] Fields extracted for ${month.normalizedMonthKey}:`, countExtracted(response.fields))
  })

  const duration = performance.now() - start
  console.info('[SpreadsheetImport] Multi-month import duration (ms):', Math.round(duration))

  return { months, warnings }
}