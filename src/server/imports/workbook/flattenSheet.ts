import * as XLSX from 'xlsx'
import type { CellRecord, ParsedWorkbook } from '../../types/importTypes'

const isEmpty = (value: unknown) => value === null || value === undefined || String(value).trim() === ''

const toText = (value: string | number | null) => {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

export function flattenWorkbook(parsed: ParsedWorkbook): CellRecord[] {
  const records: CellRecord[] = []

  parsed.sheets.forEach((sheet) => {
    const rowCount = sheet.rows.length
    const colCount = Math.max(...sheet.rows.map((row) => row.length), 0)

    const columnText: string[][] = Array.from({ length: colCount }, () => [])

    for (let col = 0; col < colCount; col += 1) {
      const labels: string[] = []
      for (let row = 0; row < rowCount; row += 1) {
        const value = sheet.rows[row]?.[col] ?? null
        if (typeof value === 'string' && !isEmpty(value)) {
          labels.push(toText(value))
        }
      }
      columnText[col] = labels
    }

    sheet.rows.forEach((row, rowIndex) => {
      const rowLabels = row.filter((cell) => typeof cell === 'string' && !isEmpty(cell)).map((cell) => toText(cell as string))

      row.forEach((cell, colIndex) => {
        if (cell === null || cell === undefined || cell === '') return

        const address = XLSX.utils.encode_cell({ c: colIndex, r: rowIndex })
        records.push({
          sheetName: sheet.name,
          row: rowIndex + 1,
          col: colIndex + 1,
          address,
          value: cell,
          rowText: rowLabels,
          colText: columnText[colIndex] ?? [],
        })
      })
    })
  })

  return records
}