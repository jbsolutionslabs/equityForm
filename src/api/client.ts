import axios from 'axios'

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:3001'

// Set by ClerkTokenBridge component — the only reliable way to get token in Clerk v6
let tokenProvider: (() => Promise<string | null>) | null = null
export function setTokenProvider(fn: () => Promise<string | null>) {
  tokenProvider = fn
}

async function getClerkToken(): Promise<string | null> {
  if (tokenProvider) {
    try { return await tokenProvider() } catch { return null }
  }
  return null
}

export const apiClient = axios.create({
  baseURL: `${BASE_URL}/api/v1`,
  headers: { 'Content-Type': 'application/json' },
})

apiClient.interceptors.request.use(async (config) => {
  const token = await getClerkToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

let activeFirmId: string | null = null
export function setActiveFirm(firmId: string) {
  activeFirmId = firmId
}

apiClient.interceptors.request.use((config) => {
  if (activeFirmId) config.headers['X-Firm-Id'] = activeFirmId
  return config
})
