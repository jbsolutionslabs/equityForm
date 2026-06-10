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
import { useAppStore, Deal, Offering, Banking, SpvFormationItem, SpvFormation, OperatingAgreement } from '../../state/store'
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

export function useOperatingAgreementDraftSave(dealId: string) {
  const qc = useQueryClient()
  const setOperatingAgreementDraft = useAppStore((s) => s.setOperatingAgreementDraft)
  const operatingAgreement = useAppStore((s) => s.deals[dealId]?.data?.operatingAgreement ?? { status: 'not_generated' as const })

  const { flush } = useAutoSave(
    `oa-draft-${dealId}`,
    operatingAgreement,
    async () => {
      qc.invalidateQueries({ queryKey: ['deals', dealId] })
    }
  )

  const update = useCallback((patch: Partial<OperatingAgreement>) => {
    setOperatingAgreementDraft(dealId, patch)
  }, [dealId, setOperatingAgreementDraft])

  return { update, flush }
}

export function useCapTableActions(dealId: string) {
  const qc           = useQueryClient()
  const lockCapTable = useAppStore((s) => s.lockCapTable)

  const invalidate = () => qc.invalidateQueries({ queryKey: ['deals', dealId] })

  return {
    lock: async () => {
      await apiClient.post(`/deals/${dealId}/captable/lock`)
      lockCapTable(dealId)
      // No invalidate — lockCapTable updates the store immediately and a refetch
      // could overwrite capTableLockedAt before the next sync picks it up.
    },
    unlock: async () => {
      await apiClient.delete(`/deals/${dealId}/captable/lock`)
      invalidate()
    },
  }
}

export function useInvestorActions(dealId: string) {
  const qc = useQueryClient()
  const addInvestor = useAppStore((s) => s.addInvestor)
  const updateInvestor = useAppStore((s) => s.updateInvestor)
  const removeInvestor = useAppStore((s) => s.removeInvestor)

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['deals', dealId] })
    qc.invalidateQueries({ queryKey: ['deals', dealId, 'investors'] })
  }

  return {
    create: async (investor: Parameters<typeof addInvestor>[1]) => {
      const { data } = await apiClient.post(`/deals/${dealId}/investors`, {
        name: investor.fullLegalName,
        email: investor.email || `${investor.id}@placeholder.local`,
        accreditation: investor.accreditedInvestorBasis || undefined,
        payload: investor,
      })
      addInvestor(dealId, { ...investor, id: data.id })
      invalidate()
    },
    update: async (investorId: string, patch: Parameters<typeof updateInvestor>[2], nextInvestor: Record<string, unknown>) => {
      await apiClient.patch(`/deals/${dealId}/investors/${investorId}`, {
        name: (nextInvestor.fullLegalName as string | undefined) || patch.fullLegalName,
        email: (nextInvestor.email as string | undefined) || patch.email,
        accreditation: (nextInvestor.accreditedInvestorBasis as string | undefined) || patch.accreditedInvestorBasis || undefined,
        payload: nextInvestor,
      })
      updateInvestor(dealId, investorId, patch)
      invalidate()
    },
    remove: async (investorId: string) => {
      await apiClient.delete(`/deals/${dealId}/investors/${investorId}`)
      removeInvestor(dealId, investorId)
      invalidate()
    },
  }
}

export function useSubscriptionActions(dealId: string) {
  const qc = useQueryClient()
  const generateSubscriptionForInvestor = useAppStore((s) => s.generateSubscriptionForInvestor)
  const sendSubscriptionForSignature = useAppStore((s) => s.sendSubscriptionForSignature)
  const markSubscriptionSigned = useAppStore((s) => s.markSubscriptionSigned)
  const recordWirePayment = useAppStore((s) => s.recordWirePayment)
  const setSubscriptionFields = useAppStore((s) => s.setSubscriptionFields)
  const subscriptions = useAppStore((s) => s.deals[dealId]?.data?.subscriptions ?? [])
  const investors = useAppStore((s) => s.deals[dealId]?.data?.investors ?? [])

  const invalidate = () => qc.invalidateQueries({ queryKey: ['deals', dealId] })
  const findSubscription = (investorId: string) => subscriptions.find((sub) => sub.investorId === investorId)
  const findInvestor = (investorId: string) => investors.find((inv) => inv.id === investorId)

  const ensureSubscription = async (investorId: string) => {
    const existing = findSubscription(investorId)
    if (existing?.id) return existing.id

    const investor = findInvestor(investorId)

    const { data } = await apiClient.post(`/deals/${dealId}/subscriptions`, {
      investorId,
      amount: investor?.subscriptionAmount || 1,
      payload: { status: 'generated', generatedAt: new Date().toISOString() },
    })
    generateSubscriptionForInvestor(dealId, investorId)
    setSubscriptionFields(dealId, investorId, { id: data.id })
    invalidate()
    return data.id as string
  }

  return {
    generate: ensureSubscription,
    send: async (investorId: string) => {
      const subId = await ensureSubscription(investorId)
      if (!subId) return
      const sentAt = new Date().toISOString()
      const docusignEnvelopeId = `DS_SUB_${investorId}_${Date.now()}`
      await apiClient.patch(`/deals/${dealId}/subscriptions/${subId}`, {
        status: 'SENT',
        payload: {
          docusignEnvelopeId,
          sentAt,
        },
      })
      sendSubscriptionForSignature(dealId, investorId)
      setSubscriptionFields(dealId, investorId, { docusignEnvelopeId, sentAt })
      invalidate()
    },
    markSigned: async (investorId: string) => {
      const sub = findSubscription(investorId)
      if (!sub?.id) throw new Error('Subscription record not found. Please refresh and try again.')
      const signedAt = new Date().toISOString()
      await apiClient.patch(`/deals/${dealId}/subscriptions/${sub.id}`, {
        status: 'SIGNED',
        signedAt,
      })
      markSubscriptionSigned(dealId, investorId)
      setSubscriptionFields(dealId, investorId, { signedAt })
      invalidate()
    },
    recordWire: async (investorId: string, confirmation: string, amount?: number, date?: string) => {
      const sub = findSubscription(investorId)
      if (!sub?.id) throw new Error('Subscription record not found. Please refresh and try again.')
      const paidAt = date || new Date().toISOString()
      await apiClient.patch(`/deals/${dealId}/subscriptions/${sub.id}`, {
        status: 'PAID',
        paidAt,
        payload: {
          wireConfirmationNumber: confirmation,
          paidAmount: amount,
          wireDate: date,
        },
      })
      recordWirePayment(dealId, investorId, confirmation, amount, date)
      setSubscriptionFields(dealId, investorId, {
        wireConfirmationNumber: confirmation,
        paidAmount: amount,
        wireDate: date,
        paidAt,
      })
      invalidate()
    },
  }
}
