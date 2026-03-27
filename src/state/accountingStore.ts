import create from 'zustand'
import { devtools } from 'zustand/middleware'
import { v4 as uuidv4 } from 'uuid'
import type {
  AccountingProperty,
  MonthlyEntry,
  BelowLineItems,
  WorkingCapitalAdjustments,
  DistributionEntry,
  MultifamilyPnL,
  HotelPnL,
  AssetClass,
} from './accountingTypes'

const STORAGE_KEY = 'equityform:accounting'

/* ─── Default empty line items ──────────────────────────────────────────────── */

export const defaultMFPnL = (): MultifamilyPnL => ({
  totalRentableUnits: 0, occupiedUnits: 0, avgRent: 0,
  grossPotentialRent: 0, vacancyLoss: 0, concessions: 0, badDebt: 0,
  utilityReimbursements: 0, otherIncome: 0,
  propertyManagementFee: 0, payrollBenefits: 0, repairsMaintenance: 0,
  makeReadyTurns: 0, landscaping: 0, utilitiesCommonArea: 0,
  insurance: 0, propertyTaxes: 0, marketingAdvertising: 0,
  administrativeGeneral: 0, contractServices: 0,
})

export const defaultHotelPnL = (): HotelPnL => ({
  totalRooms: 0, daysInMonth: 31, occupiedRooms: 0, adr: 0,
  roomsRevenue: 0, foodBeverageRevenue: 0, otherOperatedDepts: 0, miscIncome: 0,
  roomsExpense: 0, foodBeverageExpense: 0, otherDeptExpense: 0,
  administrativeGeneral: 0, itTelecom: 0, salesMarketing: 0,
  propertyOperationsMaint: 0, utilities: 0,
  baseManagementFee: 0, incentiveManagementFee: 0, franchiseFee: 0, programMarketingFee: 0,
})

export const defaultBelowLine = (): BelowLineItems => ({
  depreciation: 0, amortizationFinancingCosts: 0,
  debtServiceInterest: 0, debtServicePrincipal: 0,
  capEx: 0, replacementReserve: 0,
  depreciationOverridden: false, debtServiceOverridden: false, capExOverridden: false,
})

export const defaultWorkingCapital = (): WorkingCapitalAdjustments => ({
  changeInAccountsReceivable: 0, changeInPrepaidExpenses: 0,
  changeInAccountsPayable: 0, changeInAccruedLiabilities: 0,
  changeInSecurityDeposits: 0, otherOperatingAdjustments: 0,
  proceedsFromSaleOfAssets: 0, otherInvestingActivities: 0,
  proceedsFromNewBorrowings: 0, capitalContributions: 0, otherFinancingActivities: 0,
})

export const defaultDistributions = (calculatedLPPref = 0): DistributionEntry => ({
  calculatedLPPref,
  actualLPDistribution: calculatedLPPref,
  actualGPDistribution: 0,
  isOverridden: false,
  overrideNote: '',
  prefGap: 0,
})

/* ─── Store type ─────────────────────────────────────────────────────────────── */

type AccountingState = {
  properties:  AccountingProperty[]
  entries:     MonthlyEntry[]

  // Property actions
  addProperty:    (p: Omit<AccountingProperty, 'id' | 'createdAt' | 'updatedAt'>) => string
  updateProperty: (id: string, patch: Partial<AccountingProperty>) => void
  deleteProperty: (id: string) => void

  // Entry actions
  upsertEntry: (e: Omit<MonthlyEntry, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => void
  deleteEntry: (id: string) => void

  // Helpers
  getProperty:            (id: string) => AccountingProperty | undefined
  getEntry:               (propertyId: string, period: string) => MonthlyEntry | undefined
  getEntriesForProperty:  (propertyId: string) => MonthlyEntry[]
  getPropertiesForDeal:   (dealId: string) => AccountingProperty[]

  reset: () => void
}

/* ─── Persistence ────────────────────────────────────────────────────────────── */

function load(): Pick<AccountingState, 'properties' | 'entries'> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch (_) { /* ignore */ }
  return { properties: [], entries: [] }
}

function save(state: Pick<AccountingState, 'properties' | 'entries'>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ properties: state.properties, entries: state.entries }))
  } catch (_) { /* ignore */ }
}

/* ─── Store ──────────────────────────────────────────────────────────────────── */

const initial = load()

export const useAccountingStore = create<AccountingState>()(
  devtools((set, get) => ({
    properties: initial.properties,
    entries:    initial.entries,

    /* ── Properties ── */
    addProperty: (p) => {
      const id  = uuidv4()
      const now = new Date().toISOString()
      const prop: AccountingProperty = { ...p, id, createdAt: now, updatedAt: now }
      set((s) => ({ properties: [...s.properties, prop] }), false, 'addProperty')
      save(get())
      return id
    },

    updateProperty: (id, patch) => {
      set((s) => ({
        properties: s.properties.map((p) =>
          p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p,
        ),
      }), false, 'updateProperty')
      save(get())
    },

    deleteProperty: (id) => {
      set((s) => ({
        properties: s.properties.filter((p) => p.id !== id),
        entries:    s.entries.filter((e) => e.propertyId !== id),
      }), false, 'deleteProperty')
      save(get())
    },

    /* ── Entries ── */
    upsertEntry: (e) => {
      const now      = new Date().toISOString()
      const existing = get().entries.find(
        (x) => x.propertyId === e.propertyId && x.period === e.period,
      )

      // Recalculate pref gap
      const dist = { ...e.distributions }
      dist.prefGap = dist.calculatedLPPref - dist.actualLPDistribution
      dist.isOverridden = dist.actualLPDistribution !== dist.calculatedLPPref

      const entry: MonthlyEntry = {
        ...e,
        distributions: dist,
        id:        existing?.id ?? (e.id ?? uuidv4()),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      }

      set((s) => ({
        entries: existing
          ? s.entries.map((x) => (x.id === existing.id ? entry : x))
          : [...s.entries, entry],
      }), false, 'upsertEntry')
      save(get())
    },

    deleteEntry: (id) => {
      set((s) => ({ entries: s.entries.filter((e) => e.id !== id) }), false, 'deleteEntry')
      save(get())
    },

    /* ── Helpers ── */
    getProperty:           (id)       => get().properties.find((p) => p.id === id),
    getEntry:              (pid, per) => get().entries.find((e) => e.propertyId === pid && e.period === per),
    getEntriesForProperty: (pid)      => get().entries.filter((e) => e.propertyId === pid).sort((a, b) => a.period.localeCompare(b.period)),
    getPropertiesForDeal:  (did)      => get().properties.filter((p) => p.dealId === did),

    reset: () => {
      set({ properties: [], entries: [] }, false, 'reset')
      save({ properties: [], entries: [] })
    },
  })),
)

useAccountingStore.subscribe((s) => save(s))

/* ─── Convenience: build a default entry seeded with auto-calcs ─────────────── */
export function buildDefaultEntry(
  property: AccountingProperty,
  period: string,
): Omit<MonthlyEntry, 'id' | 'createdAt' | 'updatedAt'> {
  const assetClass: AssetClass = property.assetClass
  const pnl = assetClass === 'multifamily' ? defaultMFPnL() : defaultHotelPnL()

  // Seed with property defaults
  if (assetClass === 'multifamily') {
    // nothing extra to pre-fill for stats
  }

  const calculatedLPPref = (property.waterfall.lpEquity * property.waterfall.lpPrefRateAnnual) / 12

  return {
    propertyId:  property.id,
    period,
    assetClass,
    pnl,
    belowLine: {
      ...defaultBelowLine(),
      capEx:            property.monthlyCapExDefault,
      replacementReserve: property.monthlyReserveDefault,
    },
    workingCapital: defaultWorkingCapital(),
    distributions:  defaultDistributions(calculatedLPPref),
    notes: '',
  }
}
