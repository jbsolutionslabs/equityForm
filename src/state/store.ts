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
  propertyName?: string
  assetClass?: 'multifamily' | 'hotel'
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
  gpCapitalContribution?: number | null
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
  paidAmount?: number
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

/* ─── Multi-deal wrapper ─────────────────────────────────────────────────── */
export type AppDealEntry = {
  id:        string
  createdAt: string
  data:      AppData
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

export const defaultData: AppData = {
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

/* ─── App-data migration (per-deal) ─────────────────────────────────────── */
function migrateAppData(data: AppData): AppData {
  const sf = data.spvFormation as any

  if (!sf) {
    const formed = !!data.spv?.formed
    data.spvFormation = {
      entityName:           { complete: formed, entityName: data.deal?.entityName },
      registeredAgent:      { complete: formed, agentName: data.spv?.registeredAgentName, agentAddress: data.spv?.registeredAgentAddress },
      certOfFormation:      { complete: formed, dateFiled: data.spv?.formationDate },
      einObtained:          { complete: formed, ein: data.spv?.ein },
      foreignQualification: { complete: formed },
    }
  } else if (sf.llcFiled && !sf.entityName) {
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
    data.spvFormation = {
      entityName:           sf.entityName           ?? { complete: false },
      registeredAgent:      sf.registeredAgent      ?? { complete: false },
      certOfFormation:      sf.certOfFormation      ?? { complete: false },
      einObtained:          sf.einObtained          ?? { complete: false },
      foreignQualification: sf.foreignQualification ?? { complete: false },
    }
  }

  if (!data.operatingAgreement) {
    data.operatingAgreement = { status: 'not_generated' }
  } else if (!data.operatingAgreement.status) {
    const oa = data.operatingAgreement
    data.operatingAgreement = {
      ...oa,
      status: oa.gpSigned ? 'signed' : oa.generated ? 'generated' : 'not_generated',
    }
  }

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

/* ─── Deals load / save ──────────────────────────────────────────────────── */
function loadDeals(): Record<string, AppDealEntry> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)

    // No stored data — seed if available
    if (!raw) {
      if (demoSeed) {
        const id = 'deal-legacy'
        const data: AppData = { ...defaultData }
        Object.assign(data, demoSeed)
        return { [id]: { id, createdAt: new Date().toISOString(), data: migrateAppData(data) } }
      }
      return {}
    }

    const parsed = JSON.parse(raw)

    // New format: { deals: Record<string, AppDealEntry> }
    if (parsed.deals && typeof parsed.deals === 'object') {
      const result: Record<string, AppDealEntry> = {}
      for (const [id, entry] of Object.entries(parsed.deals as Record<string, AppDealEntry>)) {
        result[id] = { ...entry, data: migrateAppData({ ...entry.data }) }
      }
      return result
    }

    // Old format: raw AppData (top-level keys: deal, offering, spvFormation, ...)
    if (parsed.deal !== undefined || parsed.spvFormation !== undefined) {
      const id = 'deal-legacy'
      return { [id]: { id, createdAt: new Date().toISOString(), data: migrateAppData(parsed) } }
    }

    return {}
  } catch (_) {
    return {}
  }
}

function saveDeals(deals: Record<string, AppDealEntry>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ deals }))
  } catch (_) {
    // ignore
  }
}

/* ─── Store Actions Type ─────────────────────────────────────────────────── */
type AppState = {
  deals: Record<string, AppDealEntry>

  // Deal lifecycle
  createDeal: () => string
  deleteDeal: (dealId: string) => void

  // All mutations take dealId as first param
  setData:          (dealId: string, patch: Partial<AppData>) => void
  setDeal:          (dealId: string, d: Partial<Deal>) => void
  setOffering:      (dealId: string, o: Partial<Offering>) => void
  setBanking:       (dealId: string, b: Partial<Banking>) => void
  addInvestor:      (dealId: string, inv: Investor) => void
  updateInvestor:   (dealId: string, id: string, patch: Partial<Investor>) => void
  removeInvestor:   (dealId: string, id: string) => void
  setBlueSkyFilingStep: (dealId: string, stateCode: string, step: BlueSkyChecklistStep, completed: boolean) => void
  syncBlueSkyFilingsForStates: (dealId: string, stateCodes: string[]) => void
  markSpvItem:      (dealId: string, item: keyof SpvFormation, data: Partial<SpvFormationItem>) => void
  formSPV:          (dealId: string, spv: Partial<SPV>) => void
  generateOA:       (dealId: string) => void
  sendOaForDocuSign:(dealId: string, gpEmail: string) => void
  simulateOaSigned: (dealId: string) => void
  resetOaStatus:    (dealId: string) => void
  gpSignOA:         (dealId: string, gpSignerName?: string) => void
  generateSubscriptionForInvestor: (dealId: string, investorId: string) => void
  sendSubscriptionForSignature:    (dealId: string, investorId: string) => void
  markSubscriptionSigned:          (dealId: string, investorId: string) => void
  recordWirePayment:               (dealId: string, investorId: string, confirmation: string, amount?: number, date?: string) => void
  lockCapTable:     (dealId: string) => void
  addActivity:      (dealId: string, event: Omit<ActivityEvent, 'id'>) => void
  reset:            () => void
}

/* ─── Helper: update a single deal's data ───────────────────────────────── */
function pd(
  s: AppState,
  dealId: string,
  fn: (data: AppData) => AppData,
): Partial<AppState> {
  const entry = s.deals[dealId]
  if (!entry) return {}
  return {
    deals: {
      ...s.deals,
      [dealId]: { ...entry, data: fn(entry.data) },
    },
  }
}

/* ─── Store ──────────────────────────────────────────────────────────────── */
export const useAppStore = create<AppState>()(
  devtools((set, _get) => ({
    deals: loadDeals(),

    /* ── Deal lifecycle ── */
    createDeal: () => {
      const id = crypto.randomUUID()
      const entry: AppDealEntry = {
        id,
        createdAt: new Date().toISOString(),
        data: { ...defaultData, spvFormation: { ...defaultSpvFormation }, operatingAgreement: { ...defaultOA } },
      }
      set((s) => ({ deals: { ...s.deals, [id]: entry } }), false, 'createDeal')
      return id
    },

    deleteDeal: (dealId) =>
      set((s) => {
        const next = { ...s.deals }
        delete next[dealId]
        return { deals: next }
      }, false, 'deleteDeal'),

    setData: (dealId, patch) =>
      set((s) => pd(s, dealId, (d) => ({ ...d, ...patch })), false, 'setData'),

    setDeal: (dealId, deal) =>
      set((s) => pd(s, dealId, (d) => ({ ...d, deal: { ...d.deal, ...deal } })), false, 'setDeal'),

    setOffering: (dealId, o) =>
      set((s) => pd(s, dealId, (d) => ({ ...d, offering: { ...d.offering, ...o } })), false, 'setOffering'),

    setBanking: (dealId, b) =>
      set((s) => pd(s, dealId, (d) => ({ ...d, banking: { ...d.banking, ...b } })), false, 'setBanking'),

    /* ── Stage 2: SPV Formation checklist ── */
    markSpvItem: (dealId, item, patch) =>
      set((s) => pd(s, dealId, (d) => {
        const sf: SpvFormation = {
          ...d.spvFormation,
          [item]: { ...(d.spvFormation as any)[item], ...patch },
        }
        const allFormed = isSpvFormed({ ...d, spvFormation: sf })
        const spv: SPV = allFormed
          ? {
              formed:                 true,
              formationDate:          sf.certOfFormation?.dateFiled || new Date().toISOString(),
              ein:                    sf.einObtained.ein || d.spv?.ein,
              registeredAgentName:    sf.registeredAgent.agentName || d.spv?.registeredAgentName,
              registeredAgentAddress: sf.registeredAgent.agentAddress || d.spv?.registeredAgentAddress,
            }
          : { ...d.spv, formed: false }
        const deal: Deal = {
          ...d.deal,
          ...(sf.entityName?.entityName  && { entityName: sf.entityName.entityName }),
          ...(sf.einObtained.ein         && { ein: sf.einObtained.ein }),
          ...(sf.registeredAgent.agentName    && { registeredAgentName: sf.registeredAgent.agentName }),
          ...(sf.registeredAgent.agentAddress && { registeredAgentAddress: sf.registeredAgent.agentAddress }),
        }
        return { ...d, spvFormation: sf, spv, deal }
      }), false, 'markSpvItem'),

    /* ── Legacy SPV formation ── */
    formSPV: (dealId, spv) =>
      set((s) => pd(s, dealId, (d) => {
        const newSpv: SPV = { ...d.spv, ...spv, formed: true, formationDate: spv.formationDate || new Date().toISOString() }
        const sf: SpvFormation = {
          entityName:           { complete: true, completedAt: newSpv.formationDate, entityName: d.deal.entityName },
          registeredAgent:      { complete: !!(newSpv.registeredAgentName && newSpv.registeredAgentAddress), agentName: newSpv.registeredAgentName, agentAddress: newSpv.registeredAgentAddress },
          certOfFormation:      { complete: true, completedAt: newSpv.formationDate },
          einObtained:          { complete: !!newSpv.ein, completedAt: newSpv.formationDate, ein: newSpv.ein },
          foreignQualification: { complete: true, completedAt: newSpv.formationDate },
        }
        const deal: Deal = {
          ...d.deal,
          ...(newSpv.ein && { ein: newSpv.ein }),
          ...(newSpv.registeredAgentName && { registeredAgentName: newSpv.registeredAgentName }),
          ...(newSpv.registeredAgentAddress && { registeredAgentAddress: newSpv.registeredAgentAddress }),
        }
        return { ...d, spv: newSpv, spvFormation: sf, deal }
      }), false, 'formSPV'),

    /* ── Stage 3: Generate OA ── */
    generateOA: (dealId) =>
      set((s) => pd(s, dealId, (d) => {
        const { values } = generatePlaceholders(d)
        const documentText = generateOperatingAgreementText(values)
        const oa: OperatingAgreement = {
          ...d.operatingAgreement,
          status:      'generated',
          generated:   true,
          generatedAt: new Date().toISOString(),
          documentText,
        }
        return { ...d, operatingAgreement: oa }
      }), false, 'generateOA'),

    /* ── Stage 3: Send OA for DocuSign ── */
    sendOaForDocuSign: (dealId, gpEmail) =>
      set((s) => pd(s, dealId, (d) => {
        const oa: OperatingAgreement = {
          ...d.operatingAgreement,
          status:             'sent_for_signature',
          sentForSignatureAt: new Date().toISOString(),
          docusignEnvelopeId: `DS_OA_${Date.now()}`,
          gpEmail,
        }
        return { ...d, operatingAgreement: oa }
      }), false, 'sendOaForDocuSign'),

    /* ── Stage 3: Simulate DocuSign webhook ── */
    simulateOaSigned: (dealId) =>
      set((s) => pd(s, dealId, (d) => {
        const oa: OperatingAgreement = {
          ...d.operatingAgreement,
          status:    'signed',
          signedAt:  new Date().toISOString(),
          gpSigned:  true,
          gpSignedAt: new Date().toISOString(),
          gpSignerName: d.deal.gpSignerName || '',
        }
        return { ...d, operatingAgreement: oa }
      }), false, 'simulateOaSigned'),

    /* ── Stage 3: Reset OA ── */
    resetOaStatus: (dealId) =>
      set((s) => pd(s, dealId, (d) => {
        const { values } = generatePlaceholders(d)
        const documentText = generateOperatingAgreementText(values)
        const oa: OperatingAgreement = {
          status:      'generated',
          generated:   true,
          generatedAt: new Date().toISOString(),
          documentText,
          gpSigned:    false,
        }
        return { ...d, operatingAgreement: oa }
      }), false, 'resetOaStatus'),

    /* ── Legacy GP-sign button ── */
    gpSignOA: (dealId, gpSignerName) =>
      set((s) => pd(s, dealId, (d) => {
        const oa: OperatingAgreement = {
          ...d.operatingAgreement,
          status:       'signed',
          signedAt:     new Date().toISOString(),
          gpSigned:     true,
          gpSignerName: gpSignerName || d.deal.gpSignerName || '',
          gpSignedAt:   new Date().toISOString(),
        }
        return { ...d, operatingAgreement: oa }
      }), false, 'gpSignOA'),

    /* ── Subscription management ── */
    generateSubscriptionForInvestor: (dealId, investorId) =>
      set((s) => pd(s, dealId, (d) => {
        if (!canSendSubAgreements(d)) {
          console.warn('Gate: OA must be signed before generating subscription agreements')
          return d
        }
        const exists = d.subscriptions.find((ss) => ss.investorId === investorId)
        if (exists) return d
        const { values } = generatePlaceholders(d)
        const idx = d.investors.findIndex((i) => i.id === investorId)
        const investorPh = (values.INVESTORS && values.INVESTORS[idx]) || {}
        const generatedText = generateSubscriptionAgreementText(values, investorPh)
        const sub: Subscription = {
          investorId,
          status:      'generated',
          generatedAt: new Date().toISOString(),
          generatedText,
        }
        return { ...d, subscriptions: [...d.subscriptions, sub] }
      }), false, 'generateSubscriptionForInvestor'),

    sendSubscriptionForSignature: (dealId, investorId) =>
      set((s) => pd(s, dealId, (d) => {
        if (!canSendSubAgreements(d)) {
          console.warn('Gate: OA must be signed before sending subscription agreements')
          return d
        }
        const subs = d.subscriptions.map((ss): Subscription =>
          ss.investorId === investorId
            ? { ...ss, status: 'sent', sentAt: new Date().toISOString(), docusignEnvelopeId: `DS_SUB_${investorId}_${Date.now()}` }
            : ss,
        )
        return { ...d, subscriptions: subs }
      }), false, 'sendSubscriptionForSignature'),

    markSubscriptionSigned: (dealId, investorId) =>
      set((s) => pd(s, dealId, (d) => {
        const subs = d.subscriptions.map((ss): Subscription =>
          ss.investorId === investorId
            ? { ...ss, status: 'signed', signedAt: new Date().toISOString() }
            : ss,
        )
        return { ...d, subscriptions: subs }
      }), false, 'markSubscriptionSigned'),

    recordWirePayment: (dealId, investorId, confirmation, _amount, date) =>
      set((s) => pd(s, dealId, (d) => {
        const subs = d.subscriptions.map((ss): Subscription =>
          ss.investorId === investorId
            ? {
                ...ss,
                status:                 'paid',
                wireConfirmationNumber: confirmation,
                paidAmount:             _amount,
                paidAt:                 date || new Date().toISOString(),
              }
            : ss,
        )
        return { ...d, subscriptions: subs }
      }), false, 'recordWirePayment'),

    lockCapTable: (dealId) =>
      set((s) => pd(s, dealId, (d) => {
        if (!canLockCapTable(d)) {
          console.warn('Gate: all signed subscriptions must be paid before locking')
          return d
        }
        const deal: Deal = { ...d.deal, capTableLockedAt: new Date().toISOString() }
        const updated: AppData = { ...d, deal }
        const { values } = generatePlaceholders(updated)
        const documentText = generateOperatingAgreementText(values)
        const oa: OperatingAgreement = {
          ...d.operatingAgreement,
          generatedAt: new Date().toISOString(),
          documentText,
        }
        return { ...updated, operatingAgreement: oa }
      }), false, 'lockCapTable'),

    /* ── Investor management ── */
    addInvestor: (dealId, inv) =>
      set((s) => pd(s, dealId, (d) => {
        const normalized = { ...inv, derivedLastName: inv.derivedLastName ?? deriveLastName(inv.fullLegalName) }
        const investors = [...d.investors, normalized]
        return recalcOwnerships({ ...d, investors })
      }), false, 'addInvestor'),

    updateInvestor: (dealId, id, patch) =>
      set((s) => pd(s, dealId, (d) => {
        const investors = d.investors.map((i) =>
          i.id === id
            ? { ...i, ...patch, derivedLastName: patch.derivedLastName ?? deriveLastName(patch.fullLegalName ?? i.fullLegalName) }
            : i,
        )
        return recalcOwnerships({ ...d, investors })
      }), false, 'updateInvestor'),

    removeInvestor: (dealId, id) =>
      set((s) => pd(s, dealId, (d) => ({
        ...d,
        investors:     d.investors.filter((i) => i.id !== id),
        subscriptions: d.subscriptions.filter((sub) => sub.investorId !== id),
      })), false, 'removeInvestor'),

    setBlueSkyFilingStep: (dealId, stateCode, step, completed) =>
      set((s) => pd(s, dealId, (d) => {
        const normalizedCode = stateCode.trim().toUpperCase()
        if (!normalizedCode) return d
        const current = d.blueSkyFilings[normalizedCode] || {
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
          ...d,
          blueSkyFilings: { ...d.blueSkyFilings, [normalizedCode]: next },
        }
      }), false, 'setBlueSkyFilingStep'),

    syncBlueSkyFilingsForStates: (dealId, stateCodes) =>
      set((s) => pd(s, dealId, (d) => {
        const normalizedActiveCodes = Array.from(
          new Set(
            stateCodes
              .map((code) => code.trim().toUpperCase())
              .filter((code) => code.length > 0),
          ),
        )
        const current = d.blueSkyFilings || {}
        const next: Record<string, BlueSkyFilingStatus> = {}
        normalizedActiveCodes.forEach((code) => {
          next[code] = current[code] || {
            requirementsReviewed: false,
            stateNoticeFiled: false,
            stateFeePaid: false,
            evidenceSaved: false,
          }
        })
        const unchanged =
          Object.keys(current).length === Object.keys(next).length &&
          Object.keys(next).every((code) => current[code] === next[code])
        if (unchanged) return d
        return { ...d, blueSkyFilings: next }
      }), false, 'syncBlueSkyFilingsForStates'),

    addActivity: (dealId, event) =>
      set((s) => pd(s, dealId, (d) => {
        const e: ActivityEvent = {
          ...event,
          id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        }
        const feed = [e, ...(d.activityFeed || [])].slice(0, 50)
        return { ...d, activityFeed: feed }
      }), false, 'addActivity'),

    reset: () => {
      saveDeals({})
      set(() => ({ deals: {} }), false, 'reset')
    },
  })),
)

/* ─── Persistence ─────────────────────────────────────────────────────────── */
useAppStore.subscribe((s) => saveDeals(s.deals))

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
