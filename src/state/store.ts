import create from 'zustand'
import { devtools } from 'zustand/middleware'
import { generateOperatingAgreementText, generateSubscriptionAgreementText } from '../utils/pdfTemplate'
import { generatePlaceholders } from '../utils/placeholders'
import { seed as demoSeed } from '../mock/seed'

/* ─── SPV Formation ─────────────────────────────────────────────────────── */
export type SpvFormationItem = {
  complete:     boolean
  completedAt?: string
  // Step 1: Entity Name
  entityName?:  string
  nameLocked?:  boolean
  // Step 2: Registered Agent
  agentProvider?:         'northwest' | 'incorp' | 'ctcorp'
  agentName?:             string
  agentAddress?:          string
  agentConfirmationId?:   string
  agentAnnualRenewalDate?: string
  // Step 3: Certificate of Formation
  certFilingType?:         'standard' | 'same_day'
  certFilingFee?:          number
  certificateNumber?:      string
  dateFiled?:              string
  certEstimatedCompletion?: string
  // Step 4: EIN
  ein?: string
  // Step 5: Foreign Qualification
  foreignQualRequired?:         boolean
  foreignQualState?:            string
  foreignQualStateName?:        string
  foreignQualFee?:              number
  foreignQualTimeline?:         number
  foreignQualConfirmationId?:   string
  foreignQualFilingMethod?:     'api' | 'manual'
  foreignQualEstimatedCompletion?: string
}

export type SpvFormation = {
  entityName?:           SpvFormationItem  // Step 1 — name check & lock
  registeredAgent:       SpvFormationItem  // Step 2 — agent selection
  certOfFormation?:      SpvFormationItem  // Step 3 — certificate filing
  einObtained:           SpvFormationItem  // Step 4 — federal tax ID
  foreignQualification?: SpvFormationItem  // Step 5 — property-state registration
  llcFiled?:             SpvFormationItem  // Deprecated — migration only
}

/* ─── Operating Agreement ───────────────────────────────────────────────── */
export type OaStatus = 'not_generated' | 'generated' | 'sent_for_signature' | 'signed'

/* ─── Core Types ─────────────────────────────────────────────────────────── */
export type Investor = {
  id: string
  fullLegalName: string
  subscriberType: 'individual' | 'entity'
  entityLegalName?: string
  entityType?: string
  formationState?: string
  taxId?: string
  streetAddress?: string
  city?: string
  state?: string
  zip?: string
  email?: string
  phone?: string
  subscriptionAmount?: number | null
  classAUnits?: number | null
  ownershipPct?: number | null
  accreditedInvestor?: boolean | null
  accreditedInvestorBasis?: 'income' | 'net_worth' | null
  accreditedInvestorCategories?: string[]
  learnedAboutOffering?: string
  reviewedOperatingAgreement?: boolean | null
  hadOpportunityForQuestionsAndAdvisors?: boolean | null
  willProvideTaxForm?: boolean | null
  wireConfirmationNumber?: string
  wireDate?: string
  signerName?: string
  signerTitle?: string
  derivedLastName?: string
}

export type ActivityEvent = {
  id:        string
  timestamp: string
  dealName:  string
  action:    string
  category:  'investor' | 'subscription' | 'distribution' | 'document' | 'spv' | 'financials' | 'valuation'
}

export type Deal = {
  entityName?: string
  formationState?: string
  effectiveDate?: string
  principalAddress?: string
  gpEntityName?: string
  gpEntityState?: string
  gpSignerName?: string
  gpSignerTitle?: string
  registeredAgentName?: string
  registeredAgentAddress?: string
  registeredAgentSource?: 'manual' | 'future_integration'
  dealPurpose?: string
  propertyAddress?: string
  propertyCity?: string
  propertyState?: string
  propertyZip?: string
  propertyLegalDescription?: string
  capTableLockedAt?: string
  ein?: string
  dealStatus?: 'Raising' | 'Active' | 'Exiting'
  currentValuation?: number
}

export type Offering = {
  offeringExemption?: '506(b)' | '506(c)' | ''
  offeringExemptionRule?: string
  solicitationMethod?: string
  minimumInvestment?: number | null
  closingDate?: string
  preferredReturnEnabled?: boolean
  preferredReturnRate?: number | null
  preferredReturnType?: 'cumulative' | 'non-cumulative' | 'IRR-based' | ''
  irrRate?: number | null
  gpPromote?: number | null
  lpResidual?: number | null
  assetManagementFeeDescription?: string
  acquisitionFeeDescription?: string
  dispositionFeeDescription?: string
  consentThreshold?: number | null
  refinanceThreshold?: number | null
  amendmentThreshold?: number | null
  reportPeriod?: 'monthly' | 'quarterly' | ''
  reportFrequencyDays?: number | null
  disputeResolutionMethod?: 'arbitration' | 'litigation' | ''
  disputeResolutionVenue?: string
}

export type Banking = {
  bankName?: string
  accountName?: string
  accountNumber?: string
  routingNumber?: string
  source?: 'manual' | 'future_integration'
}

/** Kept for backward compatibility; new checklist uses SpvFormation */
export type SPV = {
  formed?: boolean
  formationDate?: string
  ein?: string
  registeredAgentName?: string
  registeredAgentAddress?: string
}

export type OperatingAgreement = {
  /** Canonical OA workflow status — drives all gate logic */
  status: OaStatus
  generatedAt?: string
  sentForSignatureAt?: string
  signedAt?: string
  docusignEnvelopeId?: string
  gpEmail?: string
  documentText?: string
  /** Backward-compat aliases updated alongside status */
  generated?: boolean
  gpSigned?: boolean
  gpSignerName?: string
  gpSignedAt?: string
}

export type Subscription = {
  investorId: string
  status: 'pending' | 'generated' | 'sent' | 'signed' | 'paid'
  docusignEnvelopeId?: string
  generatedAt?: string
  sentAt?: string
  signedAt?: string
  paidAt?: string
  wireConfirmationNumber?: string
  wireDate?: string
  generatedText?: string
}

export type BlueSkyChecklistStep =
  | 'requirementsReviewed'
  | 'stateNoticeFiled'
  | 'stateFeePaid'
  | 'evidenceSaved'

export type BlueSkyFilingStatus = {
  requirementsReviewed: boolean
  stateNoticeFiled: boolean
  stateFeePaid: boolean
  evidenceSaved: boolean
  completedAt?: string
  updatedAt?: string
}

export type AppData = {
  deal:               Deal
  offering:           Offering
  banking:            Banking
  spv:                SPV               // backward compat
  spvFormation:       SpvFormation      // canonical checklist
  operatingAgreement: OperatingAgreement
  subscriptions:      Subscription[]
  investors:          Investor[]
  blueSkyFilings:     Record<string, BlueSkyFilingStatus>
  activityFeed:       ActivityEvent[]
}

/* ─── Gate Functions (exported) ─────────────────────────────────────────── */
export function isSpvFormed(data: AppData): boolean {
  const sf = data.spvFormation
  if (!sf) return !!data.spv?.formed

  // New 5-step flow (post-migration): entityName key is present
  if (sf.entityName) {
    return (
      !!sf.entityName.complete &&
      !!sf.registeredAgent.complete &&
      !!sf.certOfFormation?.complete &&
      !!sf.einObtained.complete &&
      !!sf.foreignQualification?.complete
    )
  }

  // Legacy 3-step flow fallback
  return !!(sf as any).llcFiled?.complete && !!sf.einObtained.complete && !!sf.registeredAgent.complete
}

export function canGenerateOA(data: AppData): boolean {
  return isSpvFormed(data)
}

export function canSendSubAgreements(data: AppData): boolean {
  return data.operatingAgreement?.status === 'signed' || !!data.operatingAgreement?.gpSigned
}

export function canSendWireInstructions(sub: Subscription): boolean {
  return !!sub.signedAt
}

export function canLockCapTable(data: AppData): boolean {
  const relevantSubs = data.subscriptions.filter(
    (s) => s.status === 'signed' || s.status === 'paid' || !!s.signedAt,
  )
  if (relevantSubs.length === 0) return false
  return relevantSubs.every((s) => s.status === 'paid' || !!s.paidAt)
}

/* ─── Storage key ────────────────────────────────────────────────────────── */
const STORAGE_KEY = 'equityform:appdata'

/* ─── Defaults ───────────────────────────────────────────────────────────── */
const defaultSpvFormation: SpvFormation = {
  entityName:           { complete: false },
  registeredAgent:      { complete: false },
  certOfFormation:      { complete: false },
  einObtained:          { complete: false },
  foreignQualification: { complete: false },
}

const defaultOA: OperatingAgreement = {
  status: 'not_generated',
}

const defaultData: AppData = {
  deal:               {},
  offering:           {},
  banking:            {},
  spv:                {},
  spvFormation:       defaultSpvFormation,
  operatingAgreement: defaultOA,
  subscriptions:      [],
  investors:          [],
  blueSkyFilings:     {},
  activityFeed:       [],
}

/* ─── Seed data ──────────────────────────────────────────────────────────── */
try {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw && demoSeed) {
    Object.assign(defaultData, demoSeed)
    if (!defaultData.spvFormation) defaultData.spvFormation = { ...defaultSpvFormation }
    if (!defaultData.operatingAgreement.status) {
      defaultData.operatingAgreement.status = defaultData.operatingAgreement.gpSigned
        ? 'signed'
        : defaultData.operatingAgreement.generated
        ? 'generated'
        : 'not_generated'
    }
  }
} catch (_) {
  // ignore
}

/* ─── Data migration (called on load to handle old localStorage) ─────────── */
function migrate(data: AppData): AppData {
  const sf = data.spvFormation as any

  if (!sf) {
    // Very old data — had only the legacy spv object
    const formed = !!data.spv?.formed
    data.spvFormation = {
      entityName:           { complete: formed, entityName: data.deal?.entityName },
      registeredAgent:      { complete: formed, agentName: data.spv?.registeredAgentName, agentAddress: data.spv?.registeredAgentAddress },
      certOfFormation:      { complete: formed, dateFiled: data.spv?.formationDate },
      einObtained:          { complete: formed, ein: data.spv?.ein },
      foreignQualification: { complete: formed },
    }
  } else if (sf.llcFiled && !sf.entityName) {
    // Old 3-step data (llcFiled / einObtained / registeredAgent) → new 5-step
    const oldFormed = !!sf.llcFiled?.complete
    data.spvFormation = {
      entityName:           { complete: oldFormed, entityName: data.deal?.entityName },
      registeredAgent:      { ...sf.registeredAgent },
      certOfFormation:      {
        complete:          !!sf.llcFiled?.complete,
        certificateNumber: sf.llcFiled?.certificateNumber,
        dateFiled:         sf.llcFiled?.dateFiled,
      },
      einObtained:          { ...sf.einObtained },
      foreignQualification: { complete: oldFormed },
    }
  } else {
    // Post-migration data — ensure all keys exist
    data.spvFormation = {
      entityName:           sf.entityName           ?? { complete: false },
      registeredAgent:      sf.registeredAgent      ?? { complete: false },
      certOfFormation:      sf.certOfFormation      ?? { complete: false },
      einObtained:          sf.einObtained          ?? { complete: false },
      foreignQualification: sf.foreignQualification ?? { complete: false },
    }
  }
  // Ensure OA status is canonical
  if (!data.operatingAgreement) {
    data.operatingAgreement = { status: 'not_generated' }
  } else if (!data.operatingAgreement.status) {
    const oa = data.operatingAgreement
    data.operatingAgreement = {
      ...oa,
      status: oa.gpSigned ? 'signed' : oa.generated ? 'generated' : 'not_generated',
    }
  }

  // Normalize investor accreditation basis for backward compatibility
  if (Array.isArray(data.investors)) {
    data.investors = data.investors.map((investor) => {
      const basis = investor.accreditedInvestorBasis
      const normalizedBasis = basis === 'income' || basis === 'net_worth' ? basis : null
      return {
        ...investor,
        accreditedInvestorBasis: investor.accreditedInvestor ? normalizedBasis : null,
      }
    })
  }

  if (!data.blueSkyFilings || typeof data.blueSkyFilings !== 'object') {
    data.blueSkyFilings = {}
  }

  if (!Array.isArray(data.activityFeed)) {
    data.activityFeed = []
  }

  return data
}

/* ─── Store Actions Type ─────────────────────────────────────────────────── */
type AppState = {
  data: AppData
  setData:          (patch: Partial<AppData>) => void
  setDeal:          (d: Partial<Deal>) => void
  setOffering:      (o: Partial<Offering>) => void
  setBanking:       (b: Partial<Banking>) => void
  addInvestor:      (inv: Investor) => void
  updateInvestor:   (id: string, patch: Partial<Investor>) => void
  removeInvestor:   (id: string) => void
  setBlueSkyFilingStep: (stateCode: string, step: BlueSkyChecklistStep, completed: boolean) => void
  syncBlueSkyFilingsForStates: (stateCodes: string[]) => void
  /** Stage 2: mark one checklist item as complete or incomplete */
  markSpvItem:      (item: keyof SpvFormation, data: Partial<SpvFormationItem>) => void
  /** Legacy one-shot SPV formation (kept for backward compat) */
  formSPV:          (spv: Partial<SPV>) => void
  /** Stage 3: generate OA text from current data */
  generateOA:       () => void
  /** Stage 3: simulate sending OA to GP via DocuSign */
  sendOaForDocuSign:(gpEmail: string) => void
  /** Stage 3: simulate DocuSign webhook envelope-completed event */
  simulateOaSigned: () => void
  /** Stage 3: reset OA status (after change warning) */
  resetOaStatus:    () => void
  /** Legacy GP-sign button (kept for backward compat) */
  gpSignOA:         (gpSignerName?: string) => void
  generateSubscriptionForInvestor: (investorId: string) => void
  sendSubscriptionForSignature:    (investorId: string) => void
  markSubscriptionSigned:          (investorId: string) => void
  recordWirePayment:               (investorId: string, confirmation: string, amount?: number, date?: string) => void
  lockCapTable:     () => void
  addActivity:      (event: Omit<ActivityEvent, 'id'>) => void
  reset:            () => void
}

/* ─── Store ──────────────────────────────────────────────────────────────── */
export const useAppStore = create<AppState>()(
  devtools((set, get) => ({
    data: load(),

    setData: (patch) =>
      set((s) => ({ data: { ...s.data, ...patch } }), false, 'setData'),

    setDeal: (d) =>
      set((s) => ({ data: { ...s.data, deal: { ...s.data.deal, ...d } } }), false, 'setDeal'),

    setOffering: (o) =>
      set((s) => ({ data: { ...s.data, offering: { ...s.data.offering, ...o } } }), false, 'setOffering'),

    setBanking: (b) =>
      set((s) => ({ data: { ...s.data, banking: { ...s.data.banking, ...b } } }), false, 'setBanking'),

    /* ── Stage 2: SPV Formation checklist ── */
    markSpvItem: (item, patch) =>
      set((s) => {
        const sf: SpvFormation = {
          ...s.data.spvFormation,
          [item]: { ...(s.data.spvFormation as any)[item], ...patch },
        }
        const allFormed = isSpvFormed({ ...s.data, spvFormation: sf })
        const spv: SPV = allFormed
          ? {
              formed:                 true,
              formationDate:          sf.certOfFormation?.dateFiled || new Date().toISOString(),
              ein:                    sf.einObtained.ein || s.data.spv?.ein,
              registeredAgentName:    sf.registeredAgent.agentName || s.data.spv?.registeredAgentName,
              registeredAgentAddress: sf.registeredAgent.agentAddress || s.data.spv?.registeredAgentAddress,
            }
          : { ...s.data.spv, formed: false }
        const deal: Deal = {
          ...s.data.deal,
          ...(sf.entityName?.entityName  && { entityName: sf.entityName.entityName }),
          ...(sf.einObtained.ein         && { ein: sf.einObtained.ein }),
          ...(sf.registeredAgent.agentName    && { registeredAgentName: sf.registeredAgent.agentName }),
          ...(sf.registeredAgent.agentAddress && { registeredAgentAddress: sf.registeredAgent.agentAddress }),
        }
        return { data: { ...s.data, spvFormation: sf, spv, deal } }
      }, false, 'markSpvItem'),

    /* ── Legacy SPV formation ── */
    formSPV: (spv) =>
      set((s) => {
        const newSpv: SPV = { ...s.data.spv, ...spv, formed: true, formationDate: spv.formationDate || new Date().toISOString() }
        const sf: SpvFormation = {
          entityName:           { complete: true, completedAt: newSpv.formationDate, entityName: s.data.deal.entityName },
          registeredAgent:      { complete: !!(newSpv.registeredAgentName && newSpv.registeredAgentAddress), agentName: newSpv.registeredAgentName, agentAddress: newSpv.registeredAgentAddress },
          certOfFormation:      { complete: true, completedAt: newSpv.formationDate },
          einObtained:          { complete: !!newSpv.ein, completedAt: newSpv.formationDate, ein: newSpv.ein },
          foreignQualification: { complete: true, completedAt: newSpv.formationDate },
        }
        const deal: Deal = {
          ...s.data.deal,
          ...(newSpv.ein && { ein: newSpv.ein }),
          ...(newSpv.registeredAgentName && { registeredAgentName: newSpv.registeredAgentName }),
          ...(newSpv.registeredAgentAddress && { registeredAgentAddress: newSpv.registeredAgentAddress }),
        }
        return { data: { ...s.data, spv: newSpv, spvFormation: sf, deal } }
      }, false, 'formSPV'),

    /* ── Stage 3: Generate OA ── */
    generateOA: () =>
      set((s) => {
        const { values } = generatePlaceholders(s.data)
        const documentText = generateOperatingAgreementText(values)
        const oa: OperatingAgreement = {
          ...s.data.operatingAgreement,
          status:      'generated',
          generated:   true,
          generatedAt: new Date().toISOString(),
          documentText,
        }
        return { data: { ...s.data, operatingAgreement: oa } }
      }, false, 'generateOA'),

    /* ── Stage 3: Send OA for DocuSign ── */
    sendOaForDocuSign: (gpEmail) =>
      set((s) => {
        const oa: OperatingAgreement = {
          ...s.data.operatingAgreement,
          status:                  'sent_for_signature',
          sentForSignatureAt:      new Date().toISOString(),
          docusignEnvelopeId:      `DS_OA_${Date.now()}`,
          gpEmail,
        }
        return { data: { ...s.data, operatingAgreement: oa } }
      }, false, 'sendOaForDocuSign'),

    /* ── Stage 3: Simulate DocuSign webhook (envelope-completed) ── */
    simulateOaSigned: () =>
      set((s) => {
        const oa: OperatingAgreement = {
          ...s.data.operatingAgreement,
          status:    'signed',
          signedAt:  new Date().toISOString(),
          gpSigned:  true,
          gpSignedAt: new Date().toISOString(),
          gpSignerName: s.data.deal.gpSignerName || '',
        }
        return { data: { ...s.data, operatingAgreement: oa } }
      }, false, 'simulateOaSigned'),

    /* ── Stage 3: Reset OA (after change warning — forces re-sign) ── */
    resetOaStatus: () =>
      set((s) => {
        const { values } = generatePlaceholders(s.data)
        const documentText = generateOperatingAgreementText(values)
        const oa: OperatingAgreement = {
          status:      'generated',
          generated:   true,
          generatedAt: new Date().toISOString(),
          documentText,
          gpSigned:    false,
        }
        return { data: { ...s.data, operatingAgreement: oa } }
      }, false, 'resetOaStatus'),

    /* ── Legacy GP-sign button ── */
    gpSignOA: (gpSignerName) =>
      set((s) => {
        const oa: OperatingAgreement = {
          ...s.data.operatingAgreement,
          status:       'signed',
          signedAt:     new Date().toISOString(),
          gpSigned:     true,
          gpSignerName: gpSignerName || s.data.deal.gpSignerName || '',
          gpSignedAt:   new Date().toISOString(),
        }
        return { data: { ...s.data, operatingAgreement: oa } }
      }, false, 'gpSignOA'),

    /* ── Subscription management ── */
    generateSubscriptionForInvestor: (investorId) =>
      set((s) => {
        if (!canSendSubAgreements(s.data)) {
          console.warn('Gate: OA must be signed before generating subscription agreements')
          return { data: s.data }
        }
        const exists = s.data.subscriptions.find((ss) => ss.investorId === investorId)
        if (exists) return { data: s.data }
        const { values } = generatePlaceholders(s.data)
        const idx = s.data.investors.findIndex((i) => i.id === investorId)
        const investorPh = (values.INVESTORS && values.INVESTORS[idx]) || {}
        const generatedText = generateSubscriptionAgreementText(values, investorPh)
        const sub: Subscription = {
          investorId,
          status:      'generated',
          generatedAt: new Date().toISOString(),
          generatedText,
        }
        return { data: { ...s.data, subscriptions: [...s.data.subscriptions, sub] } }
      }, false, 'generateSubscriptionForInvestor'),

    sendSubscriptionForSignature: (investorId) =>
      set((s) => {
        if (!canSendSubAgreements(s.data)) {
          console.warn('Gate: OA must be signed before sending subscription agreements')
          return { data: s.data }
        }
        const subs = s.data.subscriptions.map((ss): Subscription =>
          ss.investorId === investorId
            ? { ...ss, status: 'sent', sentAt: new Date().toISOString(), docusignEnvelopeId: `DS_SUB_${investorId}_${Date.now()}` }
            : ss,
        )
        return { data: { ...s.data, subscriptions: subs } }
      }, false, 'sendSubscriptionForSignature'),

    markSubscriptionSigned: (investorId) =>
      set((s) => {
        const subs = s.data.subscriptions.map((ss): Subscription =>
          ss.investorId === investorId
            ? { ...ss, status: 'signed', signedAt: new Date().toISOString() }
            : ss,
        )
        return { data: { ...s.data, subscriptions: subs } }
      }, false, 'markSubscriptionSigned'),

    recordWirePayment: (investorId, confirmation, amount, date) =>
      set((s) => {
        const subs = s.data.subscriptions.map((ss): Subscription =>
          ss.investorId === investorId
            ? {
                ...ss,
                status:                  'paid',
                wireConfirmationNumber:  confirmation,
                paidAt:                  date || new Date().toISOString(),
              }
            : ss,
        )
        return { data: { ...s.data, subscriptions: subs } }
      }, false, 'recordWirePayment'),

    lockCapTable: () =>
      set((s) => {
        if (!canLockCapTable(s.data)) {
          console.warn('Gate: all signed subscriptions must be paid before locking')
          return { data: s.data }
        }
        const deal: Deal = { ...s.data.deal, capTableLockedAt: new Date().toISOString() }
        const updatedData: AppData = { ...s.data, deal }
        const { values } = generatePlaceholders(updatedData)
        const documentText = generateOperatingAgreementText(values)
        const oa: OperatingAgreement = {
          ...s.data.operatingAgreement,
          generatedAt: new Date().toISOString(),
          documentText,
        }
        return { data: { ...updatedData, operatingAgreement: oa } }
      }, false, 'lockCapTable'),

    /* ── Investor management ── */
    addInvestor: (inv) =>
      set((s) => {
        const normalized = { ...inv, derivedLastName: inv.derivedLastName ?? deriveLastName(inv.fullLegalName) }
        const investors = [...s.data.investors, normalized]
        return { data: recalcOwnerships({ ...s.data, investors }) }
      }, false, 'addInvestor'),

    updateInvestor: (id, patch) =>
      set((s) => {
        const investors = s.data.investors.map((i) =>
          i.id === id
            ? { ...i, ...patch, derivedLastName: patch.derivedLastName ?? deriveLastName(patch.fullLegalName ?? i.fullLegalName) }
            : i,
        )
        return { data: recalcOwnerships({ ...s.data, investors }) }
      }, false, 'updateInvestor'),

    removeInvestor: (id) =>
      set(
        (s) => ({
          data: {
            ...s.data,
            investors: s.data.investors.filter((i) => i.id !== id),
            subscriptions: s.data.subscriptions.filter((sub) => sub.investorId !== id),
          },
        }),
        false,
        'removeInvestor',
      ),

    setBlueSkyFilingStep: (stateCode, step, completed) =>
      set((s) => {
        const normalizedCode = stateCode.trim().toUpperCase()
        if (!normalizedCode) return { data: s.data }
        const current = s.data.blueSkyFilings[normalizedCode] || {
          requirementsReviewed: false,
          stateNoticeFiled: false,
          stateFeePaid: false,
          evidenceSaved: false,
        }
        const next: BlueSkyFilingStatus = {
          ...current,
          [step]: completed,
          updatedAt: new Date().toISOString(),
        }
        const isComplete =
          next.requirementsReviewed &&
          next.stateNoticeFiled &&
          next.stateFeePaid &&
          next.evidenceSaved
        next.completedAt = isComplete ? new Date().toISOString() : undefined

        return {
          data: {
            ...s.data,
            blueSkyFilings: {
              ...s.data.blueSkyFilings,
              [normalizedCode]: next,
            },
          },
        }
      }, false, 'setBlueSkyFilingStep'),

    syncBlueSkyFilingsForStates: (stateCodes) =>
      set((s) => {
        const normalizedActiveCodes = Array.from(
          new Set(
            stateCodes
              .map((code) => code.trim().toUpperCase())
              .filter((code) => code.length > 0),
          ),
        )

        const current = s.data.blueSkyFilings || {}
        const next: Record<string, BlueSkyFilingStatus> = {}

        normalizedActiveCodes.forEach((code) => {
          next[code] =
            current[code] || {
              requirementsReviewed: false,
              stateNoticeFiled: false,
              stateFeePaid: false,
              evidenceSaved: false,
            }
        })

        const unchanged =
          Object.keys(current).length === Object.keys(next).length &&
          Object.keys(next).every((code) => current[code] === next[code])

        if (unchanged) return { data: s.data }

        return {
          data: {
            ...s.data,
            blueSkyFilings: next,
          },
        }
      }, false, 'syncBlueSkyFilingsForStates'),

    addActivity: (event) =>
      set((s) => {
        const e: ActivityEvent = {
          ...event,
          id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        }
        const feed = [e, ...(s.data.activityFeed || [])].slice(0, 50)
        return { data: { ...s.data, activityFeed: feed } }
      }, false, 'addActivity'),

    reset: () => {
      save(defaultData)
      set(() => ({ data: defaultData }), false, 'reset')
    },
  })),
)

/* ─── Persistence ─────────────────────────────────────────────────────────── */
function load(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultData
    return migrate(JSON.parse(raw))
  } catch (_) {
    return defaultData
  }
}

function save(data: AppData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch (_) {
    // ignore
  }
}

useAppStore.subscribe((s) => save(s.data))

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
function deriveLastName(full?: string): string {
  if (!full) return ''
  const parts = full.trim().split(' ')
  return parts.length > 1 ? parts[parts.length - 1] : parts[0]
}

function recalcOwnerships(data: AppData): AppData {
  const totalUnits = data.investors.reduce((sum, inv) => sum + (inv.classAUnits || 0), 0)
  const investors = data.investors.map((inv) => ({
    ...inv,
    ownershipPct: totalUnits > 0 ? ((inv.classAUnits || 0) / totalUnits) * 100 : inv.ownershipPct,
  }))
  return { ...data, investors }
}
