// ─── Enums / union literals ──────────────────────────────────────────────────

export type LoanType = 'fixed' | 'floating' | 'io' | 'hybrid' | 'construction';
export type LoanPosition = 'senior' | 'subordinate' | 'pref_equity';
export type RateIndex = 'SOFR' | 'Prime' | 'Other';
export type RateCurveIndex =
  | 'TERM_SOFR_1M'
  | 'TERM_SOFR_3M'
  | 'SOFR_DAILY'
  | 'PRIME'
  | 'UST_1Y'
  | 'UST_5Y'
  | 'UST_10Y';
export type RateCurveInterpolation = 'LINEAR' | 'FLAT_FORWARD';
export type RateCurveSource = 'CHATHAM' | 'USER' | 'MANUAL_FLAT';
export type PrepaymentPenaltyType =
  | 'step_down'
  | 'yield_maintenance'
  | 'defeasance'
  | 'flat'
  | 'make_whole'
  | 'none';
export type ResetFrequency = 'monthly' | 'quarterly' | 'annual';
export type DayCountConvention = 'actual_360' | 'actual_365' | 'thirty_360' | 'actual_actual';
export type MezzPaymentType = 'current_pay' | 'pik' | 'partial_pik';
export type PrefType = 'none' | 'simple' | 'compound' | 'accrual' | 'participating';
export type PrefCompounding = 'monthly' | 'quarterly' | 'annual';
export type WaterfallMode = 'simple' | 'advanced';
export type FeeBasisType =
  | 'pct_purchase'
  | 'pct_raise'
  | 'pct_cost'
  | 'flat'
  | 'pct_revenue'
  | 'pct_sales_price'
  | 'pct_loan_proceeds';
export type FeeType =
  | 'acquisition'
  | 'asset_management'
  | 'disposition'
  | 'construction_mgmt'
  | 'financing'
  | 'custom';
export type FeeToggle = 'yes' | 'no' | null; // null = not yet answered

// ─── Rate curve ──────────────────────────────────────────────────────────────

/** One user-supplied point on a forward rate curve. */
export interface RateCurvePoint {
  /** Months from loan start date. e.g. 1 = 1 month, 12 = 1 year, 60 = 5 years. */
  tenorMonths: number;
  /** Decimal index rate, e.g. 0.043 = 4.3%. Does NOT include spread. */
  rate: number;
}

/**
 * A deal-level forward rate curve shared by all floating instruments on the deal.
 * floor and cap belong on the instrument (lender-specific); the curve is the index forecast.
 */
export interface RateCurve {
  id: string;
  dealId: string;
  name: string;
  index: RateCurveIndex;
  /** How to fill gaps between user-supplied points. Default 'FLAT_FORWARD'. */
  interpolation: RateCurveInterpolation;
  /** Where the rates came from. USER = manually pasted by user. */
  source: RateCurveSource;
  points: RateCurvePoint[];
}

// ─── Section A: Capital Stack ────────────────────────────────────────────────

export interface DebtInstrument {
  id: string;
  position: LoanPosition;
  loanType: LoanType;
  lender?: string;
  loanAmount: number;
  loanAmountMode?: 'ltc' | 'manual'; // ltc = plug from total project cost, manual = direct override
  loanAmountLtcPct?: number; // decimal (0.65 = 65% LTC)
  startDate: string;             // 'YYYY-MM'
  firstPaymentMonth?: string;    // 'YYYY-MM' — when first scheduled payment is due
  dayCountConvention?: DayCountConvention;
  termYears: number;
  amortizationYears?: number;    // undefined = IO for full term

  // Origination & loan terms
  originationFees?: number;      // decimal pct (legacy/supporting field)
  originationFeeMode?: 'percent' | 'manual'; // senior/mezz: percent of loan proceeds or manual
  originationFeePct?: number; // decimal (0.01 = 1.0%)
  originationFeeAmount?: number; // dollar amount
  isRecourse?: boolean;
  hasPrepaymentPenalty?: boolean;
  prepaymentPenaltyType?: PrepaymentPenaltyType;
  prepaymentPenaltyTerm?: number; // months
  prepaymentPenaltySchedule?: string; // comma-separated percentages by year, e.g. "3,2,1"
  treasurySpreadBps?: number; // bps, e.g. 50
  lockoutPeriodMonths?: number;
  openWindowBeforeMaturityMonths?: number;
  penaltyPct?: number; // decimal (0.01 = 1.0%)
  makeWholePeriodMonths?: number;
  redemptionSchedule?: string; // pref equity: comma-separated percentages by year
  redemptionPremiumPct?: number; // pref equity: decimal (0.01 = 1.0%)
  noCallPeriodMonths?: number; // pref equity
  exitFeeMode?: 'percent' | 'manual'; // senior/mezz: percent of loan proceeds or manual
  exitFeePct?: number; // decimal (0.01 = 1.0%)
  exitFeeAmount?: number; // dollar amount
  mezzPaymentType?: MezzPaymentType;
  mezzPikPortionPct?: number; // decimal (0.40 = 40%)
  mezzCompounding?: PrefCompounding;
  mezzMakeWholeMonths?: number;

  // Fixed rate
  fixedRate?: number;            // decimal (0.065 = 6.5%)

  // Floating rate
  index?: RateIndex;
  otherIndexName?: string;       // when index = 'Other'
  spread?: number;               // decimal (0.02 = 200 bps over index)
  resetFrequency?: ResetFrequency;
  manualRate?: number;           // flat all-in fallback (index + spread) until curve is pasted
  chathamEnabled?: boolean;      // Chatham forward curve toggle; defaults to true for new instruments

  // Rate curve linkage (floating instruments only)
  rateCurveId?: string;          // references a RateCurve.id on EconomicsDeal.rateCurves
  floor?: number;                // decimal; min index rate BEFORE adding spread (e.g. 0.00 = 0% floor)
  cap?: number;                  // decimal or undefined; max all-in rate after spread (e.g. 0.12 = 12%)

  // Rate sub-type for IO / Hybrid / Construction (if true, use floating sub-fields)
  rateIsFloating?: boolean;

  // IO / Hybrid
  ioMonths?: number;             // IO-only period in months (hybrid: before amort begins)

  // Construction loan
  initialDrawAtClose?: number;   // dollar amount drawn at closing
  drawMonths?: number;           // straight-line draw period length (v1 assumes straight-line)
  permConversionMonth?: number;  // month index (1-based) when construction converts to perm
  hasFundedInterestReserve?: boolean;
  fundedInterestReserveAmount?: number; // dollar amount funded at close

  // Construction perm conversion sub-card
  hasPermanentConversion?: boolean;
  permLoanType?: 'fixed' | 'floating';
  permLoanAmount?: number;
  permRate?: number;             // decimal
  permTermYears?: number;
  permAmortYears?: number;
  permConversionDate?: string;   // 'YYYY-MM'

  // Rate cap (floating instruments only; capitalize at cost, straight-line amortize — ASC 815 MTM deferred to v2)
  hasCap?: boolean;
  capStrikeRate?: number;        // decimal
  capPremium?: number;           // dollar cost
  capTermMonths?: number;
  capCounterparty?: string;

  // Pref equity fields (when position === 'pref_equity')
  prefEquityRate?: number;       // decimal annual (0.08 = 8%)
  prefEquityCompounding?: PrefCompounding;
  prefEquityClosingFee?: number; // dollar amount (used as Exit Fee amount)
  prefEquityExitFeeMode?: 'percent' | 'manual'; // percent of commitment amount or manual override
  prefEquityExitFeePct?: number; // decimal (0.01 = 1.0%)
  prefEquityOriginationFeeMode?: 'percent' | 'manual';
  prefEquityOriginationFeePct?: number; // decimal (0.01 = 1.0%)
  prefEquityOriginationFeeAmount?: number; // dollar amount
  prefCurrentPayPortionPct?: number; // decimal (0.60 = 60%)
  prefMinimumMoic?: number; // e.g., 1.30x
  prefMakeWholeMonths?: number;
  prefMandatoryRedemptionOnSaleOrRefi?: boolean;

  // Deprecated: use position === 'pref_equity' instead
  isPrefEquity?: boolean;
}

export interface CapitalStack {
  purchasePrice: number;
  closingDate?: string;         // 'YYYY-MM-DD' — target closing date
  closingCosts: number;         // title, legal, transfer tax, lender fees, etc.
  closingCostsMode?: 'percent' | 'manual'; // percent = plug from purchase price, manual = direct override
  closingCostsPct?: number;     // decimal (0.02 = 2.0% of purchase price)
  lpEquityPct?: number;         // decimal (0.90 = 90% of equity plug)
  operatingReserves: number;    // initial operating reserve funded at close
  capexReserves: number;        // initial capex / improvement reserve funded at close
  otherUses: number;            // catch-all additional acquisition cost
  otherUsesLabel?: string;      // optional free-text label for otherUses line
  instruments: DebtInstrument[]; // max 5; senior required if any debt
}

// ─── Section B: Profit Split ─────────────────────────────────────────────────

export interface WaterfallTier {
  id: string;
  label: string;               // e.g. "Tier 1 — Below 8% IRR"
  hurdleIrr?: number;          // decimal (0.08 = 8%); undefined = catch-all (last tier)
  lpSplit: number;             // whole number percent (70)
  gpSplit: number;             // whole number percent (30); UI enforces = 100 - lpSplit
}

export interface PrefConfig {
  type: PrefType;
  rate?: number;               // decimal annual (0.08 = 8%)
  paymentFrequency?: PrefCompounding;
  accrualCompounds?: boolean;
  compounding?: PrefCompounding;
}

export interface WaterfallConfig {
  mode: WaterfallMode;
  simpleLpSplit?: number;      // whole number percent; mode = 'simple'
  tiers?: WaterfallTier[];     // mode = 'advanced'; hurdles must be strictly ascending
  hasCatchUp?: boolean;
  catchUpRate?: number;        // decimal (legacy)
  catchUpTargetPct?: number;   // whole percent (e.g. 20)
  catchUpSpeedPct?: number;    // whole percent (e.g. 50)
  hasClawback?: boolean;       // flag only — full math deferred to v2
}

export interface ProfitSplitConfig {
  pref: PrefConfig;
  waterfall: WaterfallConfig;
}

// ─── Section C: Fees ─────────────────────────────────────────────────────────

export interface FeeEntry {
  id: string;
  type: FeeType;
  label?: string;              // required for custom type
  enabled: FeeToggle;
  basisType?: FeeBasisType;
  rate?: number;               // decimal (0.01 = 1%)
  flatAmount?: number;         // dollar amount; used when basisType = 'flat'
  notes?: string;
}

// ─── Audit trail ─────────────────────────────────────────────────────────────

export interface AuditEntry {
  id: string;
  ts: string;                  // ISO timestamp
  action: string;
  note?: string;
  changedFields?: string[];
}

// ─── Top-level deal economics ────────────────────────────────────────────────

export interface EconomicsDeal {
  dealId: string;
  capitalStack?: CapitalStack;
  profitSplit?: ProfitSplitConfig;
  fees: FeeEntry[];            // always seeded with 5 standard entries
  rateCurves: RateCurve[];     // deal-level forward rate curves; shared by floating instruments
  exitScenarios: ExitScenario[];

  // Section completion
  sectionAComplete: boolean;
  sectionBComplete: boolean;
  sectionCComplete: boolean;

  // Module lock
  lockedAt?: string;           // ISO timestamp
  lockedBy?: string;

  // One-time dismissal flag for pref equity dual-nature banner
  hasSeenPrefEquityWarning: boolean;

  auditTrail: AuditEntry[];
}

// ─── Firm-level templates ────────────────────────────────────────────────────
// Capital Stack is NOT templatable (deal-specific).
// Multiple DebtInstrumentTemplates can be applied to a single deal (up to 5-instrument max).

export interface DebtInstrumentTemplate {
  id: string;
  name: string;
  // All instrument fields except loanAmount and startDate (deal-specific)
  lender?: string;
  position: LoanPosition;
  loanType: LoanType;
  termYears?: number;
  amortizationYears?: number;
  fixedRate?: number;
  index?: RateIndex;
  spread?: number;
  ioMonths?: number;
  drawMonths?: number;
  hasCap?: boolean;
  capStrikeRate?: number;
  isPrefEquity?: boolean;
}

export interface PrefTemplate {
  id: string;
  name: string;
  type: PrefType;
  rate?: number;
  paymentFrequency?: PrefCompounding;
  accrualCompounds?: boolean;
  compounding?: PrefCompounding;
}

export interface WaterfallTemplate {
  id: string;
  name: string;
  mode: WaterfallMode;
  simpleLpSplit?: number;
  tiers?: WaterfallTier[];
  hasCatchUp?: boolean;
  catchUpRate?: number;
  catchUpTargetPct?: number;
  catchUpSpeedPct?: number;
  hasClawback?: boolean;
}

export interface FeeTemplate {
  id: string;
  name: string;
  fees: FeeEntry[];
}

export interface FirmTemplates {
  debtInstruments: DebtInstrumentTemplate[];
  prefs: PrefTemplate[];
  waterfalls: WaterfallTemplate[];
  fees: FeeTemplate[];
}

// ─── Computed output types ────────────────────────────────────────────────────

export interface SourcesAndUses {
  uses: {
    purchasePrice: number;
    closingCosts: number;
    operatingReserves: number;
    capexReserves: number;
    otherUses: number;
    total: number;
  };
  sources: {
    equity: number;
    byPosition: Partial<Record<LoanPosition, number>>;
    totalDebt: number;
    total: number;
  };
  ltv: number;              // senior debt / purchase price
  ltc: number;              // total debt / total cost
  gapOrSurplus: number;     // sources.total - uses.total (must equal 0 to advance)
}

export interface AmortizationRow {
  period: number;           // 1-based month index
  date: string;             // 'YYYY-MM'
  beginBalance: number;
  payment: number;
  interest: number;
  principal: number;
  endBalance: number;
  drawAmount?: number;          // construction loans: dollar draw this period
  capitalizedInterest?: number; // construction loans: interest added to balance
  note?: string;                // 'IO period' | 'Construction draw N/M' | 'Perm conversion' | …
}

export interface AmortizationSchedule {
  instrumentId: string;
  rows: AmortizationRow[];
  totalInterest: number;
  totalPrincipal: number;
  totalPayments: number;
}

// ─── Waterfall engine ────────────────────────────────────────────────────────

/** Cumulative deal-level state passed through each distribute() call */
export interface WaterfallState {
  unreturnedCapital: number;       // total LP + GP unreturned equity (decrements with each RoC payout)
  accruedPrefUnpaid: number;       // cumulative LP pref that has accrued but not been paid
  lpFlows: { date: string; amount: number }[]; // negative = LP outflow (equity in), positive = inflow
}

/** Proposed allocation from distribute() — GP can override before committing */
export interface DistributionResult {
  lpPref:    number;
  lpRoC:     number;
  lpPromote: number;
  gpRoC:     number;
  gpPromote: number;
  proposed:  true;  // always true; signals this is unconfirmed
}

// ─── Exit / Projections ──────────────────────────────────────────────────────

export type ExitEventType = 'none' | 'SALE' | 'REFI';
export type SaleValuationMethod = 'cap_rate' | 'per_unit' | 'gross_multiple' | 'direct';
export type RefiSizingMethod = 'ltv' | 'dscr' | 'debt_yield';

export interface SaleConfig {
  valuationMethod: SaleValuationMethod;
  capRate?: number;          // decimal (0.055 = 5.5%)
  perUnitValue?: number;     // dollar per unit
  grossMultiple?: number;    // e.g. 1.8
  directValue?: number;      // override gross price
  closingCostsPct: number;   // decimal (0.02 = 2%)
}

export interface RefiConfig {
  sizingMethod: RefiSizingMethod;
  target: number;            // LTV decimal, DSCR multiplier, or DY decimal
  newRate: number;           // decimal
  newAmortYears: number;
  newTermYears: number;
  isInterestOnly?: boolean;
  cashOutDistribute: boolean; // distribute net cash-out proceeds through waterfall
}

export interface ExitScenarioAssumptions {
  holdYears: number;          // 1–20
  beginNoi: number;           // Year 1 NOI (dollar)
  noiGrowthPct: number;       // decimal annual (0.03 = 3%)
  reservesPerYear: number;    // replacement reserve deducted from NCF each year
  eventType: ExitEventType;
  eventYear: number;          // which year the event happens (1-based)
  sale?: SaleConfig;
  refi?: RefiConfig;
  saleAfterRefi?: { saleYear: number; sale: SaleConfig };
}

export interface LoanPayoff {
  instrumentId: string;
  balance: number;
  penalty: number;
  method: PrepaymentPenaltyType;
}

export interface CapitalEvent {
  type: ExitEventType;
  year: number;
  grossValue: number;
  closingCosts: number;
  loanPayoffs: LoanPayoff[];
  netProceeds: number;
  proposedDistribution?: DistributionResult;
}

export interface YearProjection {
  year: number;
  beginNoi: number;
  noi: number;           // after growth
  debtService: number;   // from amortization schedule for that year
  cashToInvestors: number; // noi - debtService - reserves
  loanBalance: number;   // end of year balance
  event?: CapitalEvent;  // populated only in event year
}

export interface ProjectionResult {
  years: YearProjection[];
  lpIrr?: number;          // decimal; undefined if negative cashflows only
  gpIrr?: number;
  lpEquityMultiple?: number;
  lpCashOnCash?: number;   // avg annual distributions / lpEquity
}

export interface ExitScenario {
  id: string;
  name: string;
  assumptions: ExitScenarioAssumptions;
  result?: ProjectionResult;
  createdAt: string;
}
