/**
 * documents.ts
 *
 * TypeScript API client for the EquityForm document-generation backend.
 * The backend is a Python/FastAPI service (see src/lib/documentGeneration.py).
 *
 * All endpoints return a Blob (DOCX) or a JSON status object.
 * In the prototype the base URL is http://localhost:8000 — override via
 * VITE_API_BASE_URL in your .env file.
 */

const BASE_URL = (import.meta as unknown as Record<string, string>).env?.VITE_API_BASE_URL ?? 'http://localhost:8000'

/* ─── Helpers ────────────────────────────────────────────────────────────── */

async function handleResponse(res: Response): Promise<Blob | Record<string, unknown>> {
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`API error ${res.status}: ${body}`)
  }
  const ct = res.headers.get('content-type') ?? ''
  if (ct.includes('application/json')) return res.json()
  return res.blob()
}

/* ─── Types ──────────────────────────────────────────────────────────────── */

export type DocumentStatus = {
  status: 'ok' | 'error'
  message?: string
  generatedAt?: string
}

/* ─── Operating Agreement ────────────────────────────────────────────────── */

/**
 * Generate (or regenerate) the OA DOCX for the given deal.
 * Returns the DOCX file as a Blob for download.
 */
export async function generateOADocument(dealId: string): Promise<Blob> {
  const res = await fetch(`${BASE_URL}/api/deals/${encodeURIComponent(dealId)}/generate/oa`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  const data = await handleResponse(res)
  if (!(data instanceof Blob)) throw new Error('Expected Blob from generate/oa endpoint')
  return data
}

/**
 * Fetch the already-generated OA DOCX for a deal.
 */
export async function getOADocument(dealId: string): Promise<Blob> {
  const res = await fetch(`${BASE_URL}/api/deals/${encodeURIComponent(dealId)}/document/oa`)
  const data = await handleResponse(res)
  if (!(data instanceof Blob)) throw new Error('Expected Blob from document/oa endpoint')
  return data
}

/* ─── Subscription Agreement ─────────────────────────────────────────────── */

/**
 * Generate the Subscription Agreement DOCX for a specific investor.
 * Returns the DOCX file as a Blob for download.
 */
export async function generateSubDocument(dealId: string, investorId: string): Promise<Blob> {
  const res = await fetch(
    `${BASE_URL}/api/deals/${encodeURIComponent(dealId)}/generate/sub/${encodeURIComponent(investorId)}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' } },
  )
  const data = await handleResponse(res)
  if (!(data instanceof Blob)) throw new Error('Expected Blob from generate/sub endpoint')
  return data
}

/**
 * Fetch the already-generated Subscription Agreement DOCX for a specific investor.
 */
export async function getSubDocument(dealId: string, investorId: string): Promise<Blob> {
  const res = await fetch(
    `${BASE_URL}/api/deals/${encodeURIComponent(dealId)}/document/sub/${encodeURIComponent(investorId)}`,
  )
  const data = await handleResponse(res)
  if (!(data instanceof Blob)) throw new Error('Expected Blob from document/sub endpoint')
  return data
}

/* ─── Download helper ────────────────────────────────────────────────────── */

/**
 * Trigger a browser file-save for a Blob returned from the API.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href     = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
