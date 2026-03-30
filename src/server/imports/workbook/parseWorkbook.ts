import * as XLSX from 'xlsx'
import type { ParsedWorkbook } from '../../types/importTypes'

const MAX_FILE_SIZE = 10 * 1024 * 1024

async function toArrayBuffer(input: File | ArrayBuffer): Promise<ArrayBuffer> {
  if (input instanceof ArrayBuffer) return input
  if (input.size > MAX_FILE_SIZE) {
    throw new Error('File exceeds 10 MB limit.')
  }
  return input.arrayBuffer()
}

export async function parseWorkbook(input: File | ArrayBuffer, fileName = 'uploaded-spreadsheet'): Promise<ParsedWorkbook> {
  const buffer = await toArrayBuffer(input)
  const workbook = XLSX.read(buffer, { type: 'array', cellText: false, cellDates: false })

  const sheets = workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name]
    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      defval: null,
    }) as Array<Array<string | number | null>>

    return {
      name,
      rows,
    }
  })

  if (!sheets.length) {
    throw new Error('Workbook contains no sheets.')
  }

  return {
    fileName,
    sheets,
  }
}