/**
 * Wrappers around Zustand store mutations that also auto-save to the API.
 * Views import these instead of calling the store directly for data mutations.
 *
 * Save pattern: every hook that writes to the API must invalidate the relevant
 * TanStack Query cache so that navigating back to the deals list (or re-entering
 * a deal view) always shows fresh data rather than stale cache.
 *
 *   - useDealSave   → invalidates ['deals']          (name shows directly in list)
 *   - all others    → invalidates ['deals', dealId]  (keeps per-deal cache fresh)
 */
import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAppStore, Deal, Offering, Banking, SpvFormationItem, SpvFormation } from '../../state/store'
import { apiClient } from '../client'
import { useAutoSave } from './useAutoSave'

// ─── Per-section save functions ───────────────────────────────────────────────

export function useOfferingSave(dealId: string) {
  const qc          = useQueryClient()
  const setOffering = useAppStore((s) => s.setOffering)
  const offering    = useAppStore((s) => s.deals[dealId]?.data?.offering ?? {})

  const { flush } = useAutoSave(
    `offering-${dealId}`,
    offering,
    async (data) => {
      await apiClient.put(`/deals/${dealId}/offering`, { payload: data })
      qc.invalidateQueries({ queryKey: ['deals', dealId] })
    }
  )

  const update = useCallback((patch: Partial<Offering>) => {
    setOffering(dealId, patch)
  }, [dealId, setOffering])

  return { update, flush }
}

export function useDealSave(dealId: string) {
  const qc      = useQueryClient()
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
        // Invalidate list so updated name/address is reflected immediately
        qc.invalidateQueries({ queryKey: ['deals'] })
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
  const qc         = useQueryClient()
  const setBanking = useAppStore((s) => s.setBanking)
  const banking    = useAppStore((s) => s.deals[dealId]?.data?.banking ?? {})

  const { flush } = useAutoSave(
    `banking-${dealId}`,
    banking,
    async (data) => {
      await apiClient.put(`/deals/${dealId}/banking`, { payload: data })
      qc.invalidateQueries({ queryKey: ['deals', dealId] })
    }
  )

  const update = useCallback((patch: Partial<Banking>) => {
    setBanking(dealId, patch)
  }, [dealId, setBanking])

  return { update, flush }
}

export function useSpvSave(dealId: string) {
  const qc           = useQueryClient()
  const markSpvItem  = useAppStore((s) => s.markSpvItem)
  const spvFormation = useAppStore((s) => s.deals[dealId]?.data?.spvFormation)

  const { flush } = useAutoSave(
    `spv-${dealId}`,
    spvFormation,
    async (data) => {
      if (data) {
        await apiClient.put(`/deals/${dealId}/spv`, data)
        qc.invalidateQueries({ queryKey: ['deals', dealId] })
      }
    }
  )

  const update = useCallback((item: keyof SpvFormation, patch: Partial<SpvFormationItem>) => {
    markSpvItem(dealId, item, patch)
  }, [dealId, markSpvItem])

  return { update, flush }
}

// ─── One-shot actions (no debounce needed) ────────────────────────────────────

export function useOaActions(dealId: string) {
  const qc               = useQueryClient()
  const generateOA       = useAppStore((s) => s.generateOA)
  const simulateOaSigned = useAppStore((s) => s.simulateOaSigned)
  const resetOaStatus    = useAppStore((s) => s.resetOaStatus)
  const sendOaForDocuSign = useAppStore((s) => s.sendOaForDocuSign)

  const invalidate = () => qc.invalidateQueries({ queryKey: ['deals', dealId] })

  return {
    generate: async () => {
      generateOA(dealId)
      try {
        await apiClient.put(`/deals/${dealId}/oa`, { status: 'GENERATED', generatedAt: new Date().toISOString() })
        invalidate()
      } catch {}
    },
    send: async (gpEmail: string) => {
      sendOaForDocuSign(dealId, gpEmail)
      try {
        await apiClient.put(`/deals/${dealId}/oa`, { status: 'SENT_FOR_SIGNATURE', sentAt: new Date().toISOString() })
        invalidate()
      } catch {}
    },
    markSigned: async () => {
      simulateOaSigned(dealId)
      try {
        await apiClient.put(`/deals/${dealId}/oa`, { status: 'SIGNED', signedAt: new Date().toISOString() })
        invalidate()
      } catch {}
    },
    reset: async () => {
      resetOaStatus(dealId)
      try {
        await apiClient.put(`/deals/${dealId}/oa`, { status: 'GENERATED' })
        invalidate()
      } catch {}
    },
  }
}

export function useCapTableActions(dealId: string) {
  const qc           = useQueryClient()
  const lockCapTable = useAppStore((s) => s.lockCapTable)

  const invalidate = () => qc.invalidateQueries({ queryKey: ['deals', dealId] })

  return {
    lock: async () => {
      lockCapTable(dealId)
      try {
        await apiClient.post(`/deals/${dealId}/captable/lock`)
        invalidate()
      } catch {}
    },
    unlock: async () => {
      try {
        await apiClient.delete(`/deals/${dealId}/captable/lock`)
        invalidate()
      } catch {}
    },
  }
}
