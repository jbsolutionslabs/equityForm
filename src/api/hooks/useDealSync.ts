import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../client'
import { useAppStore, AppDealEntry, AppData, defaultData, SpvFormation, OperatingAgreement, BlueSkyFilingStatus } from '../../state/store'

// ─── API shape (what the backend returns) ────────────────────────────────────
interface ApiDeal {
  id: string
  name: string
  propertyAddress?: string
  propertyState?: string
  assetClass?: string
  capTableLockedAt?: string
  createdAt: string
  offering?: { payload: Record<string, unknown> }
  banking?: { payload: Record<string, unknown> }
  spvFormation?: {
    entityName?: string
    registeredAgent?: Record<string, unknown>
    certOfFormation?: Record<string, unknown>
    einObtained: boolean
    foreignQualification?: Record<string, unknown>
  }
  operatingAgreement?: {
    status: string
    documentKey?: string
    generatedAt?: string
    sentAt?: string
    signedAt?: string
  }
  investors?: Array<{ id: string; name: string; email: string; payload: Record<string, unknown> }>
  subscriptions?: Array<{
    id: string
    investorId: string
    amount: string
    status: string
    signedAt?: string
    paidAt?: string
    payload?: Record<string, unknown>
  }>
  blueSkyFilings?: Array<{ stateCode: string; payload: Record<string, unknown> }>
}

// ─── Adapter: API shape → AppData ────────────────────────────────────────────
function apiDealToAppData(api: ApiDeal): AppData {
  const offeringPayload = (api.offering?.payload ?? {}) as Record<string, unknown>
  const bankingPayload  = (api.banking?.payload  ?? {}) as Record<string, unknown>

  // SPV
  const sf = api.spvFormation
  const spvFormation: SpvFormation = {
    entityName:      { complete: !!sf?.entityName, entityName: sf?.entityName },
    registeredAgent: { complete: !!(sf?.registeredAgent as any)?.complete, ...((sf?.registeredAgent ?? {}) as any) },
    certOfFormation: { complete: !!(sf?.certOfFormation as any)?.complete,  ...((sf?.certOfFormation ?? {}) as any) },
    einObtained:     { complete: sf?.einObtained ?? false },
    foreignQualification: { complete: !!(sf?.foreignQualification as any)?.complete, ...((sf?.foreignQualification ?? {}) as any) },
  }

  // OA
  const apiOa = api.operatingAgreement
  const oaStatusMap: Record<string, OperatingAgreement['status']> = {
    NOT_GENERATED:       'not_generated',
    GENERATED:           'generated',
    SENT_FOR_SIGNATURE:  'sent_for_signature',
    SIGNED:              'signed',
  }
  const operatingAgreement: OperatingAgreement = {
    status:              oaStatusMap[apiOa?.status ?? 'NOT_GENERATED'] ?? 'not_generated',
    generatedAt:         apiOa?.generatedAt,
    sentForSignatureAt:  apiOa?.sentAt,
    signedAt:            apiOa?.signedAt,
    generated:           !!apiOa?.generatedAt,
    gpSigned:            apiOa?.status === 'SIGNED',
  }

  // Investors
  const investors = (api.investors ?? []).map((i) => ({
    id: i.id,
    fullLegalName: i.name,
    email: i.email,
    ...(i.payload as any),
  }))

  // Subscriptions
  const subscriptions = (api.subscriptions ?? []).map((s) => ({
    investorId:            s.investorId,
    status:                s.status.toLowerCase() as any,
    signedAt:              s.signedAt,
    paidAt:                s.paidAt,
    wireConfirmationNumber: (s.payload as any)?.wireConfirmationNumber,
    paidAmount:             parseFloat(s.amount),
    ...(s.payload as any),
  }))

  // Blue sky
  const blueSkyFilings: Record<string, BlueSkyFilingStatus> = {}
  for (const filing of api.blueSkyFilings ?? []) {
    blueSkyFilings[filing.stateCode] = filing.payload as unknown as BlueSkyFilingStatus
  }

  return {
    ...defaultData,
    deal: {
      entityName:       api.name,
      propertyAddress:  api.propertyAddress,
      propertyState:    api.propertyState,
      assetClass:       api.assetClass as any,
      capTableLockedAt: api.capTableLockedAt,
      ...(offeringPayload.deal as any ?? {}),
    },
    offering:           offeringPayload as any,
    banking:            bankingPayload as any,
    spv:                { formed: spvFormation.einObtained?.complete && spvFormation.registeredAgent?.complete },
    spvFormation,
    operatingAgreement,
    investors,
    subscriptions,
    blueSkyFilings,
    activityFeed:       [],
  }
}

// ─── Hook: fetch + hydrate a single deal ─────────────────────────────────────
export function useDealSync(dealId: string | undefined) {
  const hydrateDeal = useAppStore((s) => s.hydrateDeal)

  const query = useQuery<ApiDeal>({
    queryKey: ['deals', dealId],
    queryFn:  async () => {
      const { data } = await apiClient.get(`/deals/${dealId}`)
      return data
    },
    enabled:  !!dealId,
  })

  useEffect(() => {
    if (!query.data) return
    const api = query.data
    const entry: AppDealEntry = {
      id:        api.id,
      createdAt: api.createdAt,
      data:      apiDealToAppData(api),
    }
    hydrateDeal(api.id, entry)
  }, [query.data, hydrateDeal])

  return query
}

// ─── Hook: fetch + hydrate all deals ─────────────────────────────────────────
export function useDealsSync() {
  const hydrateDeals = useAppStore((s) => s.hydrateDeals)
  const qc = useQueryClient()

  const query = useQuery<ApiDeal[]>({
    queryKey: ['deals'],
    queryFn:  async () => {
      const { data } = await apiClient.get('/deals')
      return data
    },
  })

  useEffect(() => {
    if (!query.data) return
    // Seed per-deal cache entries so useDealSync() is an instant cache hit —
    // no separate network request when the user navigates into a deal view.
    query.data.forEach((deal) => {
      qc.setQueryData(['deals', deal.id], deal)
    })
    const entries: AppDealEntry[] = query.data.map((api) => ({
      id:        api.id,
      createdAt: api.createdAt,
      data:      apiDealToAppData(api),
    }))
    hydrateDeals(entries)
  }, [query.data, hydrateDeals, qc])

  return query
}
