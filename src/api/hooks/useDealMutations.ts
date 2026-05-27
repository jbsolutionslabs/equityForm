/**
 * Wrappers around Zustand store mutations that also auto-save to the API.
 * Views import these instead of calling the store directly for data mutations.
 */
import { useCallback } from 'react'
import { useAppStore, Deal, Offering, Banking, SpvFormationItem, SpvFormation } from '../../state/store'
import { apiClient } from '../client'
import { useAutoSave } from './useAutoSave'

// ─── Per-section save functions ───────────────────────────────────────────────

export function useOfferingSave(dealId: string) {
  const setOffering = useAppStore((s) => s.setOffering)
  const offering    = useAppStore((s) => s.deals[dealId]?.data?.offering ?? {})

  const { flush } = useAutoSave(
    `offering-${dealId}`,
    offering,
    async (data) => {
      await apiClient.put(`/deals/${dealId}/offering`, { payload: data })
    }
  )

  const update = useCallback((patch: Partial<Offering>) => {
    setOffering(dealId, patch)
  }, [dealId, setOffering])

  return { update, flush }
}

export function useDealSave(dealId: string) {
  const setDeal = useAppStore((s) => s.setDeal)
  const deal    = useAppStore((s) => s.deals[dealId]?.data?.deal ?? {})

  const { flush } = useAutoSave(
    `deal-${dealId}`,
    deal,
    async (data) => {
      const body: Record<string, unknown> = {}
      if (data.entityName)      body.name            = data.entityName
      if (data.propertyAddress) body.propertyAddress = data.propertyAddress
      if (data.propertyState)   body.propertyState   = data.propertyState
      if (data.assetClass)      body.assetClass      = data.assetClass
      if (Object.keys(body).length > 0) {
        await apiClient.patch(`/deals/${dealId}`, body)
      }
      // Also persist full deal payload in offering record
      await apiClient.put(`/deals/${dealId}/offering`, { payload: { deal: data } })
    }
  )

  const update = useCallback((patch: Partial<Deal>) => {
    setDeal(dealId, patch)
  }, [dealId, setDeal])

  return { update, flush }
}

export function useBankingSave(dealId: string) {
  const setBanking = useAppStore((s) => s.setBanking)
  const banking    = useAppStore((s) => s.deals[dealId]?.data?.banking ?? {})

  const { flush } = useAutoSave(
    `banking-${dealId}`,
    banking,
    async (data) => {
      await apiClient.put(`/deals/${dealId}/banking`, { payload: data })
    }
  )

  const update = useCallback((patch: Partial<Banking>) => {
    setBanking(dealId, patch)
  }, [dealId, setBanking])

  return { update, flush }
}

export function useSpvSave(dealId: string) {
  const markSpvItem = useAppStore((s) => s.markSpvItem)
  const spvFormation = useAppStore((s) => s.deals[dealId]?.data?.spvFormation)

  const { flush } = useAutoSave(
    `spv-${dealId}`,
    spvFormation,
    async (data) => {
      if (data) await apiClient.put(`/deals/${dealId}/spv`, data)
    }
  )

  const update = useCallback((item: keyof SpvFormation, patch: Partial<SpvFormationItem>) => {
    markSpvItem(dealId, item, patch)
  }, [dealId, markSpvItem])

  return { update, flush }
}

// ─── One-shot actions (no debounce needed) ────────────────────────────────────

export function useOaActions(dealId: string) {
  const generateOA       = useAppStore((s) => s.generateOA)
  const simulateOaSigned = useAppStore((s) => s.simulateOaSigned)
  const resetOaStatus    = useAppStore((s) => s.resetOaStatus)
  const sendOaForDocuSign = useAppStore((s) => s.sendOaForDocuSign)

  return {
    generate: () => {
      generateOA(dealId)
      apiClient.put(`/deals/${dealId}/oa`, { status: 'GENERATED', generatedAt: new Date().toISOString() }).catch(() => {})
    },
    send: (gpEmail: string) => {
      sendOaForDocuSign(dealId, gpEmail)
      apiClient.put(`/deals/${dealId}/oa`, { status: 'SENT_FOR_SIGNATURE', sentAt: new Date().toISOString() }).catch(() => {})
    },
    markSigned: () => {
      simulateOaSigned(dealId)
      apiClient.put(`/deals/${dealId}/oa`, { status: 'SIGNED', signedAt: new Date().toISOString() }).catch(() => {})
    },
    reset: () => {
      resetOaStatus(dealId)
      apiClient.put(`/deals/${dealId}/oa`, { status: 'GENERATED' }).catch(() => {})
    },
  }
}

export function useCapTableActions(dealId: string) {
  const lockCapTable = useAppStore((s) => s.lockCapTable)

  return {
    lock: () => {
      lockCapTable(dealId)
      apiClient.post(`/deals/${dealId}/captable/lock`).catch(() => {})
    },
    unlock: () => {
      apiClient.delete(`/deals/${dealId}/captable/lock`).catch(() => {})
    },
  }
}
