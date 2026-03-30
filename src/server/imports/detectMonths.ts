import type { DetectedMonthColumn, ParsedWorkbook } from '../types/importTypes'

const monthMap: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
}

const normalizeYear = (year: number) => (year < 100 ? 2000 + year : year)

const buildMonthKey = (month: number, year?: number) => {
  const resolvedYear = year ?? new Date().getFullYear()
  return `${resolvedYear}-${String(month).padStart(2, '0')}`
}

const parseMonthHeader = (value: string | number | null) => {
  if (value === null || value === undefined) return null
  const raw = String(value).trim()
  if (!raw) return null

  const normalized = raw.toLowerCase()
  const isoMatch = normalized.match(/^(\d{4})[-/](\d{1,2})$/)
  if (isoMatch) {
    const year = Number(isoMatch[1])
    const month = Number(isoMatch[2])
    if (month >= 1 && month <= 12) return { month, year, raw }
  }

  const dateMatch = normalized.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  if (dateMatch) {
    const month = Number(dateMatch[1])
    const year = normalizeYear(Number(dateMatch[3]))
    if (month >= 1 && month <= 12) return { month, year, raw }
  }

  const monthYearMatch = normalized.match(/^([a-z]+)\s*[-/ ]?\s*(\d{2,4})?$/)
  if (monthYearMatch) {
    const monthName = monthYearMatch[1]
    const month = monthMap[monthName]
    if (month) {
      const year = monthYearMatch[2] ? normalizeYear(Number(monthYearMatch[2])) : undefined
      return { month, year, raw }
    }
  }

  if (monthMap[normalized]) {
    return { month: monthMap[normalized], year: undefined, raw }
  }

  return null
}

export function detectMonths(workbook: ParsedWorkbook): DetectedMonthColumn[] {
  const detected: DetectedMonthColumn[] = []

  workbook.sheets.forEach((sheet) => {
    const headerRows = sheet.rows.slice(0, 10)

    headerRows.forEach((row) => {
      row.forEach((cell, colIndex) => {
        const parsed = parseMonthHeader(cell)
        if (!parsed) return
        detected.push({
          sheetName: sheet.name,
          columnIndex: colIndex + 1,
          rawHeader: parsed.raw,
          normalizedMonthKey: buildMonthKey(parsed.month, parsed.year),
        })
      })
    })
  })

  return detected
}