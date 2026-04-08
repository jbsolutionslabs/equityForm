/* ─────────────────────────────────────────────────────────────────────────────
   EquityForm — Phase 2 Accounting Module Types
   Multifamily: NMHC / NAA format
   Hotel:       USALI 11th Edition
   Statements:  ASC 230 (Cash Flow, indirect), IRS Form 1065 Schedule L (Balance Sheet)
───────────────────────────────────────────────────────────────────────────── */

export type AssetClass = 'multifamily' | 'hotel'
export type AccountingMethod = 'Accrual' | 'Cash'

/* ─── Property ──────────────────────────────────────────────────────────────── */

export type DebtStructure = {
  loanAmount:          number   // original principal
  subordinateLoanAmount?: number // subordinate debt principal at closing
  annualInterestRate:  number   // decimal e.g. 0.065
  amortizationYears:   number   // e.g. 30
  loanTermYears:       number   // maturity e.g. 5
  loanStartDate:       string   // "YYYY-MM" — first payment month
}

export type DepreciationSettings = {
  depreciableBuilding:          number  // purchase price − land value
  depreciationLifeYears:        number  // 27.5 residential / 39 commercial
  accumulatedDepreciationBOY:   number  // accumulated at beginning of tax year
  deferredFinancingCosts:       number  // amortized over loan term
}

/** Section 7 balance sheet opening inputs — Schedule L / IRS Form 1065 */
export type OpeningBalances = {
  // Current assets
  cashBeginning:               number
  accountsReceivableBeginning: number
  prepaidExpensesBeginning:    number
  otherAssetsBeginning:        number
  // Liabilities
  accountsPayableBeginning:    number
  accruedLiabilitiesBeginning: number
  // Equity
  partnersCapitalBeginning:    number
}

export type WaterfallSettings = {
  lpEquity:             number   // total LP equity invested
  gpEquity:             number   // GP co-invest
  lpOwnershipPct:       number   // decimal e.g. 0.80
  gpOwnershipPct:       number   // decimal e.g. 0.20
  lpPrefRateAnnual:     number   // decimal e.g. 0.08
  gpPromotePct:         number   // decimal e.g. 0.20
  returnOfCapitalFirst: boolean  // true = ROC before promote
}

export type AccountingProperty = {
  id:               string
  dealId:           string           // links to Phase 1 deal
  name:             string
  address:          string
  city:             string
  state:            string
  assetClass:       AssetClass
  taxYear:          number
  fiscalYearEnd:    string           // e.g. "12/31"
  accountingMethod: AccountingMethod
  ein:              string

  // Property financials
  purchasePrice:       number
  landValue:           number
  acquisitionDate:     string        // "YYYY-MM-DD"

  debtStructure:       DebtStructure
  depreciation:        DepreciationSettings
  openingBalances:     OpeningBalances
  waterfall:           WaterfallSettings

  // CapEx & reserve defaults (GP can override per month)
  monthlyCapExDefault:     number
  monthlyReserveDefault:   number

  setupComplete:  boolean
  createdAt:      string
  updatedAt:      string
}

/* ─── Monthly line items ────────────────────────────────────────────────────── */

export type MultifamilyPnL = {
  // Property statistics
  totalRentableUnits: number
  occupiedUnits:      number
  avgRent:            number         // $/mo/unit

  // Revenue — entered as positive amounts; system treats deductions as negative
  grossPotentialRent:       number
  vacancyLoss:              number   // entered positive; subtracted
  concessions:              number   // entered positive; subtracted
  badDebt:                  number   // entered positive; subtracted
  utilityReimbursements:    number   // RUBS
  otherIncome:              number   // pet fees, storage, parking, laundry

  // Operating expenses (11 line items)
  propertyManagementFee:    number
  payrollBenefits:          number
  repairsMaintenance:       number
  makeReadyTurns:           number
  landscaping:              number
  utilitiesCommonArea:      number
  insurance:                number
  propertyTaxes:            number
  marketingAdvertising:     number
  administrativeGeneral:    number
  contractServices:         number
}

export type HotelPnL = {
  // Property statistics
  totalRooms:     number
  daysInMonth:    number
  occupiedRooms:  number
  adr:            number             // Average Daily Rate

  // Revenue (USALI Schedules 1–4)
  roomsRevenue:           number    // ADR × rooms sold
  foodBeverageRevenue:    number
  otherOperatedDepts:     number
  miscIncome:             number    // resort fees etc.

  // Departmental expenses (USALI Schedules 1–3)
  roomsExpense:           number
  foodBeverageExpense:    number
  otherDeptExpense:       number

  // Undistributed operating expenses (USALI Schedules 5–9)
  administrativeGeneral:      number  // Sch 5
  itTelecom:                  number  // Sch 6
  salesMarketing:             number  // Sch 7
  propertyOperationsMaint:    number  // Sch 8
  utilities:                  number  // Sch 9

  // Management & franchise fees (USALI Schedule 10)
  baseManagementFee:      number
  incentiveManagementFee: number
  franchiseFee:           number
  programMarketingFee:    number
}

/** Below-the-line items — auto-calculated from property setup, GP-overridable */
export type BelowLineItems = {
  depreciation:               number
  amortizationFinancingCosts: number
  debtServiceInterest:        number
  debtServicePrincipal:       number
  capEx:                      number
  replacementReserve:         number

  // Override flags
  depreciationOverridden:  boolean
  debtServiceOverridden:   boolean
  capExOverridden:         boolean
}

/** Working capital changes — for Cash Flow Statement (indirect method) */
export type WorkingCapitalAdjustments = {
  // ASC 230 canonical operating inputs
  netIncome:                   number
  depreciation:               number
  amortization:               number
  deferredTax:                number
  gainLossOnSale:             number
  accountsReceivableChange:   number
  inventoryChange:            number
  prepaidExpensesChange:      number
  accountsPayableChange:      number
  accruedExpensesChange:      number
  netCashFromOperations:      number

  // ASC 230 canonical investing inputs
  capitalExpenditures:        number
  propertyPurchase:           number
  propertySale:               number
  investmentPurchase:         number
  investmentSale:             number
  netCashFromInvesting:       number

  // ASC 230 canonical financing inputs
  debtProceeds:               number
  debtRepayment:              number
  equityContributions:        number
  dividendsDistributions:     number
  netCashFromFinancing:       number

  // ASC 230 totals / reconciliation
  netChangeInCash:            number
  cashBeginning:              number
  cashEnding:                 number

  // ASC 230 supplemental disclosures
  interestPaidDisclosure:     number
  taxesPaidDisclosure:        number
  nonCashInvestingFinancing:  number

  // Legacy fields (kept for backward compatibility with existing saved entries/imports)
  changeInAccountsReceivable: number
  changeInPrepaidExpenses:    number
  changeInAccountsPayable:    number
  changeInAccruedLiabilities: number
  changeInSecurityDeposits:   number
  otherOperatingAdjustments:  number
  // Investing
  proceedsFromSaleOfAssets:   number
  otherInvestingActivities:   number
  // Financing
  proceedsFromNewBorrowings:  number
  capitalContributions:       number
  otherFinancingActivities:   number
}

/**
 * Distribution entry — the core of Phase 2 pref-gap tracking.
 * Platform pre-fills calculatedLPPref; GP can override actualLPDistribution.
 * Balance sheet and K-1 use actual; gap surfaces "behind on pref" warnings.
 */
export type DistributionEntry = {
  calculatedLPPref:     number   // lpEquity × prefRate ÷ 12 (read-only formula)
  actualLPDistribution: number   // GP edits this
  actualGPDistribution: number   // includes promote + co-invest share
  isOverridden:         boolean  // true when actual ≠ calculated
  overrideNote:         string   // GP note explaining deviation
  prefGap:              number   // calculatedLPPref − actualLPDistribution (positive = behind)
}

export type MonthlyEntry = {
  id:          string
  propertyId:  string
  period:      string            // "YYYY-MM"
  assetClass:  AssetClass

  pnl:            MultifamilyPnL | HotelPnL
  belowLine:      BelowLineItems
  workingCapital: WorkingCapitalAdjustments
  distributions:  DistributionEntry

  notes:      string
  createdAt:  string
  updatedAt:  string
}

/* ─── Computed statement types (returned by financialComputations.ts) ────────── */

export type StatementRowType = 'header' | 'line' | 'indent' | 'subtotal' | 'total' | 'spacer' | 'note'

export type StatementRow = {
  key:    string
  label:  string
  value:  number | null
  type:   StatementRowType
  note?:  string           // e.g. "(non-cash)", "Schedule 5"
  bold?:  boolean
}

export type ComputedStatement = {
  title:    string
  subtitle: string
  period:   string
  entity:   string
  ein:      string
  rows:     StatementRow[]
}

/* ─── Period helpers ─────────────────────────────────────────────────────────── */

export type PeriodType = 'month' | 'quarter' | 'year'

export type PeriodSelection = {
  type:    PeriodType
  year:    number
  month?:  number   // 1–12 (for monthly view)
  quarter?: 1 | 2 | 3 | 4
}
