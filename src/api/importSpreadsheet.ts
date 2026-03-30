import { importSpreadsheet } from '../server/imports/importEngine'
import type { ImportRequest, ImportResponse } from '../server/types/importTypes'

export async function importSpreadsheetApi(request: ImportRequest): Promise<ImportResponse> {
  return importSpreadsheet(request)
}