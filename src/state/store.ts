import create from 'zustand'
import { devtools } from 'zustand/middleware'

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
  // derived / cross-cutting
  capTableLockedAt?: string
  ein?: string
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

export type SPV = {
  formed?: boolean
  formationDate?: string
  ein?: string
  registeredAgentName?: string
  registeredAgentAddress?: string
}

export type OperatingAgreement = {
  generated?: boolean
  generatedAt?: string
  gpSigned?: boolean
  gpSignerName?: string
  gpSignedAt?: string
  documentText?: string
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
  generatedText?: string
}

export type AppData = {
  deal: Deal
  offering: Offering
  banking: Banking
  spv: SPV
  operatingAgreement: OperatingAgreement
  subscriptions: Subscription[]
  investors: Investor[]
}

const STORAGE_KEY = 'equityform:appdata'

const defaultData: AppData = {
  deal: {},
  offering: {},
  banking: {},
  spv: {},
  operatingAgreement: {},
  subscriptions: [],
  investors: [],
}

// if seed exists, preload it
// Note: avoid using require in browser TS; import seed dynamically if available
import { seed as demoSeed } from '../mock/seed'
import { generateOperatingAgreementText, generateSubscriptionAgreementText } from '../utils/pdfTemplate'
import { generatePlaceholders } from '../utils/placeholders'
// merge seed into defaultData on first load only if localStorage empty
try {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw && demoSeed) {
    Object.assign(defaultData, demoSeed)
  }
} catch (e) {
  // ignore
}

type AppState = {
  data: AppData
  setData: (patch: Partial<AppData>) => void
  setDeal: (d: Partial<Deal>) => void
  setOffering: (o: Partial<Offering>) => void
  setBanking: (b: Partial<Banking>) => void
  addInvestor: (inv: Investor) => void
  updateInvestor: (id: string, patch: Partial<Investor>) => void
  removeInvestor: (id: string) => void
  formSPV: (spv: Partial<SPV>) => void
  generateOA: () => void
  gpSignOA: (gpSignerName?: string) => void
  generateSubscriptionForInvestor: (investorId: string) => void
  sendSubscriptionForSignature: (investorId: string) => void
  markSubscriptionSigned: (investorId: string) => void
  recordWirePayment: (investorId: string, confirmation: string, date?: string) => void
  lockCapTable: () => void
  reset: () => void
}

export const useAppStore = create<AppState>()(
  devtools((set, get) => ({
    data: load(),
    setData: (patch: Partial<AppData>) => set((s: AppState) => ({ data: { ...s.data, ...patch } }), false, 'setData'),
    setDeal: (d: Partial<Deal>) => set((s: AppState) => ({ data: { ...s.data, deal: { ...s.data.deal, ...d } } }), false, 'setDeal'),
    setOffering: (o: Partial<Offering>) =>
      set((s: AppState) => ({ data: { ...s.data, offering: { ...s.data.offering, ...o } } }), false, 'setOffering'),
    setBanking: (b: Partial<Banking>) => set((s: AppState) => ({ data: { ...s.data, banking: { ...s.data.banking, ...b } } }), false, 'setBanking'),
    formSPV: (spv: Partial<SPV>) =>
      set((s: AppState) => ({ data: { ...s.data, spv: { ...s.data.spv, ...spv, formed: true, formationDate: spv.formationDate || new Date().toISOString() } } }), false, 'formSPV'),
    generateOA: () =>
      set((s: AppState) => {
        const { values } = generatePlaceholders(s.data)
        const docText = generateOperatingAgreementText(values)
        return { data: { ...s.data, operatingAgreement: { ...s.data.operatingAgreement, generated: true, generatedAt: new Date().toISOString(), documentText: docText } } }
      }, false, 'generateOA'),
    gpSignOA: (gpSignerName?: string) =>
      set((s: AppState) => ({ data: { ...s.data, operatingAgreement: { ...s.data.operatingAgreement, gpSigned: true, gpSignerName: gpSignerName || s.data.deal.gpSignerName || '', gpSignedAt: new Date().toISOString() } } }), false, 'gpSignOA'),
    generateSubscriptionForInvestor: (investorId: string) =>
      set((s: AppState) => {
        // require SPV formed and OA GP-signed before generating subscription agreements
        if (!s.data.spv?.formed || !s.data.operatingAgreement?.gpSigned) {
          alert('SPV must be formed and the Operating Agreement must be signed by the GP before generating subscription agreements')
          return { data: s.data }
        }
        // ensure not duplicate
        const exists = s.data.subscriptions.find((ss) => ss.investorId === investorId)
        if (exists) return { data: s.data }

        // generate placeholder values and per-investor placeholders
        const { values } = generatePlaceholders(s.data)
        // find investor index and corresponding repeated placeholders
        const idx = s.data.investors.findIndex((i) => i.id === investorId)
        const investorPlaceholders = (values.INVESTORS && values.INVESTORS[idx]) || {}
        const generatedText = generateSubscriptionAgreementText(values, investorPlaceholders)

        const sub: Subscription = { investorId, status: 'generated', generatedAt: new Date().toISOString(), generatedText }
        return { data: { ...s.data, subscriptions: [...s.data.subscriptions, sub] } }
      }, false, 'generateSubscriptionForInvestor'),
    sendSubscriptionForSignature: (investorId: string) =>
      set((s: AppState) => {
        // require SPV formed and OA generated and GP-signed before sending
        if (!s.data.spv?.formed) {
          alert('SPV must be formed before subscription agreements are sent')
          return { data: s.data }
        }
        if (!s.data.operatingAgreement?.generated || !s.data.operatingAgreement?.gpSigned) {
          alert('Operating Agreement must be generated and signed by the GP before subscriptions are sent')
          return { data: s.data }
        }
        const subs = s.data.subscriptions.map((ss): Subscription =>
          ss.investorId === investorId
            ? ({ ...ss, status: 'sent', sentAt: new Date().toISOString(), docusignEnvelopeId: 'DOCUSIGN_PLACEHOLDER_' + investorId } as Subscription)
            : ss
        )
        return { data: { ...s.data, subscriptions: subs } }
      }, false, 'sendSubscriptionForSignature'),
    markSubscriptionSigned: (investorId: string) =>
      set((s: AppState) => {
        const subs = s.data.subscriptions.map((ss): Subscription =>
          ss.investorId === investorId ? ({ ...ss, status: 'signed', signedAt: new Date().toISOString() } as Subscription) : ss
        )
        return { data: { ...s.data, subscriptions: subs } }
      }, false, 'markSubscriptionSigned'),
    recordWirePayment: (investorId: string, confirmation: string, date?: string) =>
      set((s: AppState) => {
        const subs = s.data.subscriptions.map((ss): Subscription =>
          ss.investorId === investorId
            ? ({ ...ss, status: 'paid', wireConfirmationNumber: confirmation, paidAt: date || new Date().toISOString() } as Subscription)
            : ss
        )
        return { data: { ...s.data, subscriptions: subs } }
      }, false, 'recordWirePayment'),
    lockCapTable: () =>
      set((s: AppState) => {
        // lock only if every subscription in 'signed' state has been paid
        const signedSubs = s.data.subscriptions.filter((ss) => ss.status === 'signed')
        const unpaid = signedSubs.filter((ss) => ss.status !== 'paid')
        if (unpaid.length > 0) {
          alert('Cannot lock cap table: some signed subscriptions are not paid')
          return { data: s.data }
        }
        // mark a derived flag in deal to indicate cap table locked
        const deal = { ...s.data.deal, capTableLockedAt: new Date().toISOString() }
        return { data: { ...s.data, deal } }
      }, false, 'lockCapTable'),
    addInvestor: (inv: Investor) =>
      set((s: AppState) => {
        const normalized = { ...inv, derivedLastName: inv.derivedLastName ?? deriveLastName(inv.fullLegalName) }
        const investors = [...s.data.investors, normalized]
        const updated = recalcOwnerships({ ...s.data, investors })
        return { data: updated }
      }, false, 'addInvestor'),
    updateInvestor: (id: string, patch: Partial<Investor>) =>
      set((s: AppState) => {
        const investors = s.data.investors.map((i) => (i.id === id ? { ...i, ...patch, derivedLastName: patch.derivedLastName ?? deriveLastName((patch.fullLegalName ?? i.fullLegalName)) } : i))
        const updated = recalcOwnerships({ ...s.data, investors })
        return { data: updated }
      }) ,
    removeInvestor: (id: string) => set((s: AppState) => ({ data: { ...s.data, investors: s.data.investors.filter((i) => i.id !== id) } }), false, 'removeInvestor'),
    reset: () => {
      save(defaultData)
      set(() => ({ data: defaultData }), false, 'reset')
    },
  }))
)

function load(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultData
    return JSON.parse(raw)
  } catch (e) {
    return defaultData
  }
}

function save(data: AppData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch (e) {
    // ignore
  }
}

// subscribe to changes to persist
useAppStore.subscribe((s: any) => save(s.data))

function deriveLastName(full?: string) {
  if (!full) return ''
  const parts = full.trim().split(' ')
  return parts.length > 1 ? parts[parts.length - 1] : parts[0]
}

function recalcOwnerships(data: AppData): AppData {
  const totalUnits = data.investors.reduce((sum, inv) => sum + (inv.classAUnits || 0), 0)
  const investors = data.investors.map((inv) => ({ ...inv, ownershipPct: totalUnits > 0 ? ((inv.classAUnits || 0) / totalUnits) * 100 : inv.ownershipPct }))
  return { ...data, investors }
}
