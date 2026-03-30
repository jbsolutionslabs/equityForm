import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { importSpreadsheet } from '../importEngine'

const buildWorkbook = (rows: Array<Array<string | number>>) => {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet(rows)
  XLSX.utils.book_append_sheet(workbook, sheet, 'P&L — Multifamily')
  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}

const findField = (fieldKey: string, fields: Array<{ fieldKey: string; value: unknown; confidence: number }>) =>
  fields.find((field) => field.fieldKey === fieldKey)

describe('importSpreadsheet', () => {
  it('extracts labeled values and assigns confidence', async () => {
    const buffer = buildWorkbook([
      ['Property Taxes', '(11,500)'],
      ['Vacancy', '(5,000)'],
      ['Gross Potential Rent', '100000'],
      ['CapEx', '(2,500)'],
      ['LP Distribution', '(1,200)'],
    ])

    const response = await importSpreadsheet({
      file: buffer,
      importMode: 'LATEST_MONTH',
      assetClass: 'multifamily',
    })

    const propertyTaxes = findField('propertyTaxes', response.fields)
    const vacancyLoss = findField('vacancyLoss', response.fields)
    const capEx = findField('capEx', response.fields)
    const actualLPDistribution = findField('actualLPDistribution', response.fields)

    expect(propertyTaxes?.value).toBe(11500)
    expect(propertyTaxes?.confidence).toBeGreaterThanOrEqual(0.9)
    expect(vacancyLoss?.value).toBe(5000)
    expect(capEx?.value).toBe(2500)
    expect(actualLPDistribution?.value).toBe(1200)
  })

  it('returns null and zero confidence for missing fields', async () => {
    const buffer = buildWorkbook([
      ['Property Taxes', '(11,500)'],
    ])

    const response = await importSpreadsheet({
      file: buffer,
      importMode: 'LATEST_MONTH',
      assetClass: 'multifamily',
    })

    const concessions = findField('concessions', response.fields)
    expect(concessions?.value).toBeNull()
    expect(concessions?.confidence).toBe(0)
  })
})