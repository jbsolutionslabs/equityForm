/**
 * financialComputations.ts
 *
 * Pure functions that derive the three financial statements from raw line-item data.
 * Nothing in here reads from the store — callers pass data in, get statement rows out.
 *
 * Income Statement:
 *   Multifamily → NMHC/NAA format (EGI → NOI → NCF → Net Income Per Books)
 *   Hotel       → USALI 11th Edition (Revenue → GOP → EBITDA → NCF → Net Income)
 *
 * Balance Sheet: IRS Form 1065 Schedule L (accrual basis)
 *
 * Cash Flow Statement: ASC 230 indirect method
 */

import type {
  AccountingProperty,
  MonthlyEntry,
  MultifamilyPnL,
  HotelPnL,
  ComputedStatement,
  StatementRow,
  PeriodSelection,
} from '../state/accountingTypes'

/* ─── Formatting helpers ─────────────────────────────────────────────────────── */

export function fmtCurrency(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

/** Accounting notation: negatives in (parentheses), zero as — */
export function fmtAccounting(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  if (n === 0) return '—'
  if (n < 0) return `(${fmtCurrency(-n)})`
  return fmtCurrency(n)
}

export function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return (n * 100).toFixed(1) + '%'
}

/* ─── Period helpers ─────────────────────────────────────────────────────────── */

/** Return all "YYYY-MM" strings covered by a PeriodSelection */
export function periodsForSelection(sel: PeriodSelection): string[] {
  if (sel.type === 'month') {
    const m = String(sel.month ?? 1).padStart(2, '0')
    return [`${sel.year}-${m}`]
  }
  if (sel.type === 'quarter') {
    const q   = sel.quarter ?? 1
    const start = (q - 1) * 3 + 1
    return [start, start + 1, start + 2].map((m) => `${sel.year}-${String(m).padStart(2, '0')}`)
  }
  // year
  return Array.from({ length: 12 }, (_, i) => `${sel.year}-${String(i + 1).padStart(2, '0')}`)
}

export function periodLabel(sel: PeriodSelection): string {
  if (sel.type === 'month') {
    const d = new Date(sel.year, (sel.month ?? 1) - 1)
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }
  if (sel.type === 'quarter') return `Q${sel.quarter} ${sel.year}`
  return `Year Ended December 31, ${sel.year}`
}

/* ─── Amortization schedule ──────────────────────────────────────────────────── */

/**
 * Return the interest and principal components for a given period,
 * using the property's debt structure. Accounts for months elapsed
 * since loan start to compute the correct remaining balance.
 */
export function getMonthlyDebtService(
  property: AccountingProperty,
  period: string,
): { interest: number; principal: number; remainingBalance: number } {
  const ds = property.debtStructure
  if (!ds || !ds.loanAmount || !ds.annualInterestRate) {
    return { interest: 0, principal: 0, remainingBalance: 0 }
  }

  const r = ds.annualInterestRate / 12
  const n = ds.amortizationYears * 12

  // Fixed monthly payment
  const payment = r === 0 ? ds.loanAmount / n
    : ds.loanAmount * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1)

  // Months elapsed from first payment to current period
  const [ly, lm] = (ds.loanStartDate || period).split('-').map(Number)
  const [py, pm] = period.split('-').map(Number)
  const elapsed  = Math.max(0, (py - ly) * 12 + (pm - lm))  // 0 = first payment month

  // Remaining balance at START of this payment (before this month's payment)
  const remaining = r === 0
    ? ds.loanAmount - payment * elapsed
    : ds.loanAmount * (Math.pow(1 + r, n) - Math.pow(1 + r, elapsed)) / (Math.pow(1 + r, n) - 1)

  const interest  = Math.max(0, remaining * r)
  const principal = Math.max(0, payment - interest)

  return { interest, principal, remainingBalance: remaining }
}

/** Monthly straight-line depreciation */
export function getMonthlyDepreciation(property: AccountingProperty): number {
  const d = property.depreciation
  if (!d || !d.depreciableBuilding || !d.depreciationLifeYears) return 0
  return d.depreciableBuilding / (d.depreciationLifeYears * 12)
}

/** Monthly amortization of deferred financing costs */
export function getMonthlyFinancingCostAmortization(property: AccountingProperty): number {
  const d  = property.depreciation
  const ds = property.debtStructure
  if (!d?.deferredFinancingCosts || !ds?.loanTermYears) return 0
  return d.deferredFinancingCosts / (ds.loanTermYears * 12)
}

/** Calculated LP preferred return for one month */
export function getCalculatedLPPref(property: AccountingProperty): number {
  const w = property.waterfall
  if (!w?.lpEquity || !w?.lpPrefRateAnnual) return 0
  return (w.lpEquity * w.lpPrefRateAnnual) / 12
}

/* ─── Statement row builder helpers ─────────────────────────────────────────── */

const hdr = (key: string, label: string): StatementRow =>
  ({ key, label, value: null, type: 'header', bold: true })

const spacer = (key: string): StatementRow =>
  ({ key, label: '', value: null, type: 'spacer' })

const line = (key: string, label: string, value: number, note?: string): StatementRow =>
  ({ key, label, value, type: 'line', note })

const indent = (key: string, label: string, value: number, note?: string): StatementRow =>
  ({ key, label, value, type: 'indent', note })

const subtotal = (key: string, label: string, value: number, note?: string): StatementRow =>
  ({ key, label, value, type: 'subtotal', bold: true, note })

const total = (key: string, label: string, value: number, note?: string): StatementRow =>
  ({ key, label, value, type: 'total', bold: true, note })

const note = (key: string, label: string): StatementRow =>
  ({ key, label, value: null, type: 'note' })

/* ─── Aggregate entries ──────────────────────────────────────────────────────── */

function sumEntries<K extends string>(
  entries: MonthlyEntry[],
  getter: (e: MonthlyEntry) => Record<K, number>,
): Record<K, number> {
  const result: Record<string, number> = {}
  for (const e of entries) {
    const vals = getter(e)
    for (const k of Object.keys(vals)) {
      result[k] = (result[k] ?? 0) + (vals[k] ?? 0)
    }
  }
  return result as Record<K, number>
}

/* ═══════════════════════════════════════════════════════════════════════════════
   INCOME STATEMENT
═══════════════════════════════════════════════════════════════════════════════ */

export function computeIncomeStatement(
  property: AccountingProperty,
  entries: MonthlyEntry[],
  sel: PeriodSelection,
): ComputedStatement {
  const periods = periodsForSelection(sel)
  const relevant = entries.filter((e) => periods.includes(e.period))
  const rows: StatementRow[] = []

  if (property.assetClass === 'multifamily') {
    rows.push(...buildMFIncomeStatement(property, relevant))
  } else {
    rows.push(...buildHotelIncomeStatement(property, relevant))
  }

  const subtitle = property.assetClass === 'multifamily'
    ? 'NMHC / NAA Format — Apartment Income Statement'
    : 'USALI 11th Edition — Hotel Income Statement'

  return {
    title:    'Income Statement',
    subtitle,
    period:   periodLabel(sel),
    entity:   property.name,
    ein:      property.ein,
    rows,
  }
}

function buildMFIncomeStatement(
  property: AccountingProperty,
  entries: MonthlyEntry[],
): StatementRow[] {
  const pnls = entries.map((e) => e.pnl as MultifamilyPnL)
  const sum   = (fn: (p: MultifamilyPnL) => number) => pnls.reduce((acc, p) => acc + (fn(p) ?? 0), 0)

  const gpr       = sum((p) => p.grossPotentialRent)
  const vacancy   = sum((p) => p.vacancyLoss)
  const conc      = sum((p) => p.concessions)
  const badDebt   = sum((p) => p.badDebt)
  const rubs      = sum((p) => p.utilityReimbursements)
  const otherInc  = sum((p) => p.otherIncome)
  const egi       = gpr - vacancy - conc - badDebt + rubs + otherInc

  const mgmtFee   = sum((p) => p.propertyManagementFee)
  const payroll   = sum((p) => p.payrollBenefits)
  const repairs   = sum((p) => p.repairsMaintenance)
  const makeReady = sum((p) => p.makeReadyTurns)
  const landscape = sum((p) => p.landscaping)
  const utilities = sum((p) => p.utilitiesCommonArea)
  const insurance = sum((p) => p.insurance)
  const taxes     = sum((p) => p.propertyTaxes)
  const marketing = sum((p) => p.marketingAdvertising)
  const admin     = sum((p) => p.administrativeGeneral)
  const contract  = sum((p) => p.contractServices)
  const totalOpEx = mgmtFee + payroll + repairs + makeReady + landscape + utilities + insurance + taxes + marketing + admin + contract
  const noi       = egi - totalOpEx

  const da       = entries.reduce((s, e) => s + e.belowLine.depreciation + e.belowLine.amortizationFinancingCosts, 0)
  const interest = entries.reduce((s, e) => s + e.belowLine.debtServiceInterest, 0)
  const principal= entries.reduce((s, e) => s + e.belowLine.debtServicePrincipal, 0)
  const capex    = entries.reduce((s, e) => s + e.belowLine.capEx, 0)
  const reserve  = entries.reduce((s, e) => s + e.belowLine.replacementReserve, 0)
  const debtSvc  = interest + principal
  const ncf      = noi - debtSvc - capex - reserve

  const lpDist   = entries.reduce((s, e) => s + e.distributions.actualLPDistribution, 0)
  const gpDist   = entries.reduce((s, e) => s + e.distributions.actualGPDistribution, 0)
  const totalDist= lpDist + gpDist
  const netIncome= noi - da - interest  // Net Income Per Books (principal is B/S, distributions are draws)

  const vacancyRate = gpr > 0 ? (vacancy + conc) / gpr : 0
  const expenseRatio = egi > 0 ? totalOpEx / egi : 0
  const noiMargin    = egi > 0 ? noi / egi : 0

  return [
    hdr('rev-hdr', 'REVENUE'),
    line('gpr',        'Gross Potential Rent (GPR)',              gpr),
    indent('vacancy',  'Less: Vacancy Loss',                     -vacancy),
    indent('conc',     'Less: Concessions',                      -conc),
    indent('bad-debt', 'Less: Bad Debt & Credit Loss',           -badDebt),
    indent('rubs',     'Add: Utility Reimbursements (RUBS)',      rubs),
    indent('other-inc','Add: Other Income',                       otherInc, 'pet fees, storage, parking, laundry'),
    subtotal('egi',    'EFFECTIVE GROSS INCOME (EGI)',             egi),
    note('vac-rate',   `Vacancy + Concession Rate: ${fmtPct(vacancyRate)}`),
    spacer('s1'),

    hdr('opex-hdr', 'OPERATING EXPENSES'),
    line('mgmt',       'Property Management Fee',                 mgmtFee),
    line('payroll',    'Payroll & Benefits — All Staff',           payroll),
    line('repairs',    'Repairs & Maintenance',                    repairs),
    line('makeready',  'Make-Ready / Unit Turns',                  makeReady),
    line('landscape',  'Landscaping & Grounds',                    landscape),
    line('utilities',  'Utilities — Common Area',                  utilities),
    line('insurance',  'Insurance',                                insurance),
    line('taxes',      'Property Taxes',                           taxes),
    line('marketing',  'Marketing & Advertising',                  marketing),
    line('admin',      'Administrative & General',                 admin),
    line('contract',   'Contract Services',                        contract),
    subtotal('total-opex', 'TOTAL OPERATING EXPENSES',            totalOpEx),
    note('exp-ratio',  `Expense Ratio: ${fmtPct(expenseRatio)}`),
    spacer('s2'),

    total('noi',       'NET OPERATING INCOME (NOI)',               noi),
    note('noi-margin', `NOI Margin: ${fmtPct(noiMargin)}`),
    spacer('s3'),

    hdr('noncash-hdr', 'NON-CASH ITEMS (added back in Cash Flow Statement)'),
    line('da',         'Depreciation & Amortization',             -da,       '(non-cash)'),
    spacer('s4'),

    hdr('debt-hdr', 'DEBT SERVICE  |  CAPEX  |  RESERVES'),
    line('ds-interest', 'Debt Service — Interest',                -interest),
    line('ds-principal','Debt Service — Principal',               -principal),
    subtotal('ds-total','Total Debt Service',                     -debtSvc),
    note('dscr',        `DSCR: ${debtSvc > 0 ? (noi / debtSvc).toFixed(2) : '—'}`),
    line('capex',       'Capital Expenditures (CapEx)',            -capex),
    line('reserve',     'Replacement Reserve Contribution',        -reserve),
    spacer('s5'),

    total('ncf',       'NET FREE CASH FLOW TO INVESTORS',          ncf),
    spacer('s6'),

    hdr('dist-hdr',    'LP DISTRIBUTION WATERFALL'),
    line('lp-dist',    'Actual LP Distributions Paid',            -lpDist),
    line('gp-dist',    'Actual GP Distributions Paid',            -gpDist),
    subtotal('total-dist', 'Total Distributions to Partners',     -totalDist),
    spacer('s7'),

    total('net-income','NET INCOME PER BOOKS  (Schedule M-1)',     netIncome),
  ]
}

function buildHotelIncomeStatement(
  _property: AccountingProperty,
  entries: MonthlyEntry[],
): StatementRow[] {
  const pnls = entries.map((e) => e.pnl as HotelPnL)
  const sum   = (fn: (p: HotelPnL) => number) => pnls.reduce((acc, p) => acc + (fn(p) ?? 0), 0)

  // Occupancy stats (use last entry or average)
  const rooms       = pnls[0]?.totalRooms ?? 0
  const occRooms    = sum((p) => p.occupiedRooms)
  const daysTotal   = sum((p) => p.daysInMonth)
  const availRooms  = rooms * daysTotal
  const occupancyPct= availRooms > 0 ? occRooms / availRooms : 0
  const adrAvg      = pnls.length > 0 ? pnls.reduce((s, p) => s + p.adr, 0) / pnls.length : 0
  const revpar      = occupancyPct * adrAvg

  // Revenue
  const roomsRev    = sum((p) => p.roomsRevenue)
  const fbRev       = sum((p) => p.foodBeverageRevenue)
  const otherOpRev  = sum((p) => p.otherOperatedDepts)
  const miscInc     = sum((p) => p.miscIncome)
  const totalRevenue= roomsRev + fbRev + otherOpRev + miscInc

  // Departmental expenses
  const roomsExp    = sum((p) => p.roomsExpense)
  const fbExp       = sum((p) => p.foodBeverageExpense)
  const otherDepExp = sum((p) => p.otherDeptExpense)
  const totalDeptExp= roomsExp + fbExp + otherDepExp
  const deptProfit  = totalRevenue - totalDeptExp
  const deptMargin  = totalRevenue > 0 ? deptProfit / totalRevenue : 0

  // Undistributed
  const ag          = sum((p) => p.administrativeGeneral)
  const it          = sum((p) => p.itTelecom)
  const salesMkt    = sum((p) => p.salesMarketing)
  const pom         = sum((p) => p.propertyOperationsMaint)
  const util        = sum((p) => p.utilities)
  const totalUndist = ag + it + salesMkt + pom + util
  const gop         = deptProfit - totalUndist
  const gopMargin   = totalRevenue > 0 ? gop / totalRevenue : 0

  // Management & franchise
  const baseMgmt    = sum((p) => p.baseManagementFee)
  const incentMgmt  = sum((p) => p.incentiveManagementFee)
  const franchise   = sum((p) => p.franchiseFee)
  const program     = sum((p) => p.programMarketingFee)
  const totalMgmt   = baseMgmt + incentMgmt + franchise + program
  const ebitda      = gop - totalMgmt
  const ebitdaMargin= totalRevenue > 0 ? ebitda / totalRevenue : 0

  // Below line
  const da       = entries.reduce((s, e) => s + e.belowLine.depreciation + e.belowLine.amortizationFinancingCosts, 0)
  const interest = entries.reduce((s, e) => s + e.belowLine.debtServiceInterest, 0)
  const principal= entries.reduce((s, e) => s + e.belowLine.debtServicePrincipal, 0)
  const capex    = entries.reduce((s, e) => s + e.belowLine.capEx, 0)   // includes FF&E reserve
  const debtSvc  = interest + principal
  const ncf      = ebitda - debtSvc - capex

  const lpDist   = entries.reduce((s, e) => s + e.distributions.actualLPDistribution, 0)
  const gpDist   = entries.reduce((s, e) => s + e.distributions.actualGPDistribution, 0)
  const totalDist= lpDist + gpDist
  const netIncome= ebitda - da - interest

  return [
    hdr('stats-hdr', 'PROPERTY STATISTICS'),
    note('occ',        `Occupancy: ${fmtPct(occupancyPct)}   |   ADR: ${fmtCurrency(adrAvg)}   |   RevPAR: ${fmtCurrency(revpar)}`),
    spacer('s0'),

    hdr('rev-hdr', 'REVENUE  (USALI Schedules 1–4)'),
    line('rooms-rev',   'Rooms Revenue  (ADR × Rooms Sold)',       roomsRev),
    line('fb-rev',      'Food & Beverage Revenue',                  fbRev),
    line('other-op',    'Other Operated Departments',               otherOpRev),
    line('misc',        'Miscellaneous Income',                     miscInc, 'incl. resort fees'),
    subtotal('total-rev','TOTAL OPERATED REVENUE',                  totalRevenue),
    spacer('s1'),

    hdr('dept-hdr', 'DEPARTMENTAL EXPENSES  (USALI Schedules 1–3)'),
    line('rooms-exp',   'Rooms Expense',                            roomsExp),
    line('fb-exp',      'Food & Beverage Expense',                  fbExp),
    line('other-exp',   'Other Operated Departments Expense',       otherDepExp),
    subtotal('total-dept-exp', 'TOTAL DEPARTMENTAL EXPENSES',      totalDeptExp),
    spacer('s2'),

    subtotal('dept-profit','TOTAL DEPARTMENTAL PROFIT',             deptProfit),
    note('dept-margin',  `Dept Profit Margin: ${fmtPct(deptMargin)}`),
    spacer('s3'),

    hdr('undist-hdr', 'UNDISTRIBUTED OPERATING EXPENSES  (USALI Schedules 5–9)'),
    line('ag',          'Administrative & General',                 ag, 'Sch 5'),
    line('it',          'Information & Telecom Systems',            it, 'Sch 6'),
    line('sales',       'Sales & Marketing',                        salesMkt, 'Sch 7'),
    line('pom',         'Property Operations & Maintenance',        pom, 'Sch 8'),
    line('util',        'Utilities',                                util, 'Sch 9'),
    subtotal('total-undist','TOTAL UNDISTRIBUTED EXPENSES',         totalUndist),
    spacer('s4'),

    total('gop',        'GROSS OPERATING PROFIT (GOP)',             gop),
    note('gop-margin',  `GOP Margin: ${fmtPct(gopMargin)}`),
    spacer('s5'),

    hdr('mgmt-hdr', 'MANAGEMENT & FRANCHISE FEES  (USALI Schedule 10)'),
    line('base-mgmt',   'Base Management Fee',                      baseMgmt),
    line('incent-mgmt', 'Incentive Management Fee',                 incentMgmt),
    line('franchise',   'Franchise / Brand Fee',                    franchise),
    line('program',     'Program / Marketing Fee',                  program),
    subtotal('total-mgmt','Total Management & Franchise Fees',      totalMgmt),
    spacer('s6'),

    total('ebitda',     'EBITDA',                                   ebitda),
    note('ebitda-m',    `EBITDA Margin: ${fmtPct(ebitdaMargin)}`),
    spacer('s7'),

    hdr('debt-hdr', 'BELOW THE LINE  |  DEBT SERVICE  |  CAPEX'),
    line('da',          'Depreciation & Amortization',             -da, '(non-cash)'),
    line('ds-interest', 'Debt Service — Interest',                 -interest),
    line('ds-principal','Debt Service — Principal',                -principal),
    subtotal('ds-total','Total Debt Service',                      -(debtSvc)),
    note('dscr',        `DSCR: ${debtSvc > 0 ? (ebitda / debtSvc).toFixed(2) : '—'}`),
    line('capex',       'Capital Expenditures (CapEx) + FF&E Reserve', -capex),
    spacer('s8'),

    total('ncf',        'NET FREE CASH FLOW TO INVESTORS',          ncf),
    spacer('s9'),

    hdr('dist-hdr', 'LP DISTRIBUTION WATERFALL'),
    line('lp-dist',     'Actual LP Distributions Paid',            -lpDist),
    line('gp-dist',     'Actual GP / Promote Distributions Paid',  -gpDist),
    subtotal('total-dist','Total Distributions to Partners',       -totalDist),
    spacer('s10'),

    total('net-income', 'NET INCOME PER BOOKS  (Schedule M-1)',    netIncome),
  ]
}

/* ═══════════════════════════════════════════════════════════════════════════════
   BALANCE SHEET  —  IRS Form 1065 / Schedule L
═══════════════════════════════════════════════════════════════════════════════ */

export function computeBalanceSheet(
  property: AccountingProperty,
  allEntries: MonthlyEntry[],
  sel: PeriodSelection,
): ComputedStatement {
  const periods = periodsForSelection(sel)
  const lastPeriod = periods[periods.length - 1]

  // Entries from beginning of tax year up to and including the selected period end
  const startOfYear = `${sel.year}-01`
  const ytdEntries  = allEntries.filter(
    (e) => e.period >= startOfYear && e.period <= lastPeriod,
  )

  const ob = property.openingBalances

  // Cash: opening + cumulative net cash change (from CFS)
  const cfsData   = computeCashFlowStatement(property, allEntries, { type: 'year', year: sel.year })
  const netCashRow= cfsData.rows.find((r) => r.key === 'net-cash-change')
  const netCash   = netCashRow?.value ?? 0

  const cashEnd   = ob.cashBeginning + netCash

  // AR: opening + cumulative changes
  const arChange  = ytdEntries.reduce((s, e) => s + e.workingCapital.changeInAccountsReceivable, 0)
  const arEnd     = ob.accountsReceivableBeginning + arChange

  // Prepaid
  const prepChange= ytdEntries.reduce((s, e) => s + e.workingCapital.changeInPrepaidExpenses, 0)
  const prepEnd   = ob.prepaidExpensesBeginning + prepChange

  // Current assets total
  const totalCurrentAssets = cashEnd + arEnd + prepChange + ob.prepaidExpensesBeginning + ob.otherAssetsBeginning
  // (simplified — use individual line items below)

  // Accumulated depreciation
  const accumDep  = (property.depreciation.accumulatedDepreciationBOY ?? 0) +
    ytdEntries.reduce((s, e) => s + e.belowLine.depreciation, 0)

  const buildingCost  = property.depreciation.depreciableBuilding ?? 0
  const landValue     = property.landValue ?? 0
  const finCostsNet   = (property.depreciation.deferredFinancingCosts ?? 0) -
    ytdEntries.reduce((s, e) => s + e.belowLine.amortizationFinancingCosts, 0)

  const netFixedAssets = buildingCost - accumDep + landValue + finCostsNet + ob.otherAssetsBeginning
  const totalAssets    = cashEnd + arEnd + prepEnd + netFixedAssets

  // Liabilities
  const apChange  = ytdEntries.reduce((s, e) => s + e.workingCapital.changeInAccountsPayable, 0)
  const apEnd     = ob.accountsPayableBeginning + apChange
  const accrChange= ytdEntries.reduce((s, e) => s + e.workingCapital.changeInAccruedLiabilities, 0)
  const accrEnd   = ob.accruedLiabilitiesBeginning + accrChange
  const totalCurrentLiab = apEnd + accrEnd

  // Mortgage remaining
  const principalPaid = ytdEntries.reduce((s, e) => s + e.belowLine.debtServicePrincipal, 0)
  const mortgageEnd   = Math.max(0, property.debtStructure.loanAmount - principalPaid)
  const totalLiab     = totalCurrentLiab + mortgageEnd

  // Partners' capital
  const netIncomeYTD  = (() => {
    // compute from IS
    const isData = computeIncomeStatement(property, allEntries, { type: 'year', year: sel.year })
    const niRow  = isData.rows.find((r) => r.key === 'net-income')
    return niRow?.value ?? 0
  })()
  const distYTD = ytdEntries.reduce((s, e) => s + e.distributions.actualLPDistribution + e.distributions.actualGPDistribution, 0)
  const capitalContrib = ytdEntries.reduce((s, e) => s + e.workingCapital.capitalContributions, 0)
  const totalCapital   = ob.partnersCapitalBeginning + capitalContrib + netIncomeYTD - distYTD

  const totalLiabAndCapital = totalLiab + totalCapital
  const balanceCheck        = totalAssets - totalLiabAndCapital

  const rows: StatementRow[] = [
    hdr('assets-hdr', 'ASSETS'),
    hdr('current-hdr', 'Current Assets'),
    line('cash',        '1.  Cash & Cash Equivalents',              cashEnd),
    line('ar',          '2.  Trade Notes & Accounts Receivable',    arEnd),
    line('allowance',   '3.  Less: Allowance for Doubtful Accounts',0),
    line('inventory',   '4.  Inventories',                         0),
    line('prepaid',     '5.  Prepaid Expenses & Other Current Assets', prepEnd),
    subtotal('total-current-assets', 'TOTAL CURRENT ASSETS',       cashEnd + arEnd + prepEnd),
    spacer('s1'),

    hdr('fixed-hdr', 'Fixed & Long-Term Assets'),
    line('building',    '7.  Buildings & Other Depreciable Assets (at cost)', buildingCost),
    line('accum-dep',   '8.  Less: Accumulated Depreciation',      -accumDep),
    line('land',        '9.  Land',                                 landValue),
    line('intangibles', '10. Intangible Assets (net of amortization)', finCostsNet),
    line('other-lt',    '11. Other Assets',                        ob.otherAssetsBeginning),
    subtotal('total-fixed', 'NET FIXED & OTHER LONG-TERM ASSETS',  netFixedAssets),
    spacer('s2'),

    total('total-assets', 'TOTAL ASSETS  (Schedule L Line 14)',    totalAssets),
    spacer('s3'),

    hdr('liab-hdr', 'LIABILITIES'),
    hdr('current-liab-hdr', 'Current Liabilities'),
    line('ap',          '14. Accounts Payable',                     apEnd),
    line('accrued',     '15. Other Current Liabilities',            accrEnd),
    subtotal('total-current-liab', 'TOTAL CURRENT LIABILITIES',    totalCurrentLiab),
    spacer('s4'),

    hdr('lt-liab-hdr', 'Long-Term Liabilities'),
    line('mortgage',    '16. Mortgages, Notes, Bonds Payable — Long-Term (> 1 yr)', mortgageEnd),
    line('other-lt-liab','17. Other Liabilities',                   0),
    spacer('s5'),

    subtotal('total-liab', 'TOTAL LIABILITIES',                    totalLiab),
    spacer('s6'),

    hdr('capital-hdr', "PARTNERS' CAPITAL  (Schedule L Lines 21–22)"),
    line('cap-beg',     '18. Partners\' Capital — Beginning of Year', ob.partnersCapitalBeginning),
    line('cap-contrib', '19. Capital Contributed During Year',       capitalContrib),
    line('net-income-cap','20. Net Income (Loss) for Year',          netIncomeYTD),
    line('distributions-cap','21. Distributions to Partners',       -distYTD),
    subtotal('total-capital', "TOTAL PARTNERS' CAPITAL  (Schedule L Line 22)", totalCapital),
    spacer('s7'),

    total('total-liab-cap', "TOTAL LIABILITIES + PARTNERS' CAPITAL", totalLiabAndCapital),
    spacer('s8'),

    note('balance-check', `Balance Check (Assets − Liabilities − Capital): ${fmtAccounting(balanceCheck)}  ${Math.abs(balanceCheck) < 1 ? '✓' : '⚠ CHECK'}`),
  ]

  return {
    title:    'Balance Sheet',
    subtitle: 'IRS Form 1065 / Schedule L — Accrual Basis',
    period:   `As of ${periodLabel(sel)}`,
    entity:   property.name,
    ein:      property.ein,
    rows,
  }
}

/* ═══════════════════════════════════════════════════════════════════════════════
   CASH FLOW STATEMENT  —  ASC 230, Indirect Method
═══════════════════════════════════════════════════════════════════════════════ */

export function computeCashFlowStatement(
  property: AccountingProperty,
  allEntries: MonthlyEntry[],
  sel: PeriodSelection,
): ComputedStatement {
  const periods = periodsForSelection(sel)
  const entries = allEntries.filter((e) => periods.includes(e.period))

  // Net income from IS
  const isData    = computeIncomeStatement(property, entries, sel)
  const niRow     = isData.rows.find((r) => r.key === 'net-income')
  const netIncome = niRow?.value ?? 0

  // Adjustments
  const da         = entries.reduce((s, e) => s + e.belowLine.depreciation, 0)
  const finAmort   = entries.reduce((s, e) => s + e.belowLine.amortizationFinancingCosts, 0)
  const arChg      = entries.reduce((s, e) => s + e.workingCapital.changeInAccountsReceivable, 0)
  const prepChg    = entries.reduce((s, e) => s + e.workingCapital.changeInPrepaidExpenses, 0)
  const apChg      = entries.reduce((s, e) => s + e.workingCapital.changeInAccountsPayable, 0)
  const accrChg    = entries.reduce((s, e) => s + e.workingCapital.changeInAccruedLiabilities, 0)
  const secDep     = entries.reduce((s, e) => s + e.workingCapital.changeInSecurityDeposits, 0)
  const otherOp    = entries.reduce((s, e) => s + e.workingCapital.otherOperatingAdjustments, 0)

  const netOperating = netIncome + da + finAmort + arChg + prepChg + apChg + accrChg + secDep + otherOp

  // Investing
  const capex        = entries.reduce((s, e) => s + e.belowLine.capEx, 0)
  const reserve      = entries.reduce((s, e) => s + e.belowLine.replacementReserve, 0)
  const proceedsSale = entries.reduce((s, e) => s + e.workingCapital.proceedsFromSaleOfAssets, 0)
  const otherInvest  = entries.reduce((s, e) => s + e.workingCapital.otherInvestingActivities, 0)
  const netInvesting = -capex - reserve + proceedsSale + otherInvest

  // Financing
  const principal    = entries.reduce((s, e) => s + e.belowLine.debtServicePrincipal, 0)
  const interest     = entries.reduce((s, e) => s + e.belowLine.debtServiceInterest, 0)
  const newBorrow    = entries.reduce((s, e) => s + e.workingCapital.proceedsFromNewBorrowings, 0)
  const capContrib   = entries.reduce((s, e) => s + e.workingCapital.capitalContributions, 0)
  const lpDist       = entries.reduce((s, e) => s + e.distributions.actualLPDistribution, 0)
  const gpDist       = entries.reduce((s, e) => s + e.distributions.actualGPDistribution, 0)
  const otherFin     = entries.reduce((s, e) => s + e.workingCapital.otherFinancingActivities, 0)
  const netFinancing = -principal - interest + newBorrow + capContrib - lpDist - gpDist + otherFin

  const netCashChange = netOperating + netInvesting + netFinancing
  const cashBeg       = property.openingBalances.cashBeginning
  const cashEnd       = cashBeg + netCashChange

  const rows: StatementRow[] = [
    hdr('ops-hdr', 'A.  CASH FLOWS FROM OPERATING ACTIVITIES  (Indirect Method)'),
    line('net-inc',     'Net Income (Loss) Per Books',              netIncome),
    hdr('adj-hdr',      'ADJUSTMENTS TO RECONCILE NET INCOME TO NET CASH FROM OPERATIONS:'),
    indent('da',        'Add: Depreciation & Amortization',         da),
    indent('fin-amort', 'Add: Amortization of Deferred Financing Costs', finAmort),
    indent('ar-chg',    '(Increase) Decrease in Accounts Receivable', arChg),
    indent('prep-chg',  '(Increase) Decrease in Prepaid Expenses',  prepChg),
    indent('ap-chg',    'Increase (Decrease) in Accounts Payable',  apChg),
    indent('accrued-chg','Increase (Decrease) in Accrued Liabilities', accrChg),
    indent('sec-dep',   'Increase (Decrease) in Security Deposits Held', secDep),
    indent('other-op',  'Other Operating Adjustments',              otherOp),
    subtotal('net-ops', 'NET CASH PROVIDED BY (USED IN) OPERATING ACTIVITIES', netOperating),
    spacer('s1'),

    hdr('inv-hdr', 'B.  CASH FLOWS FROM INVESTING ACTIVITIES'),
    line('capex',       'Purchase of Real Property / Capital Expenditures', -capex),
    line('reserve',     'Contributions to Replacement Reserve Account',      -reserve),
    line('sale-proc',   'Proceeds from Sale of Property / Assets',           proceedsSale),
    line('other-inv',   'Other Investing Activities',                        otherInvest),
    subtotal('net-inv', 'NET CASH PROVIDED BY (USED IN) INVESTING ACTIVITIES', netInvesting),
    spacer('s2'),

    hdr('fin-hdr', 'C.  CASH FLOWS FROM FINANCING ACTIVITIES'),
    line('principal',   'Repayment of Mortgage Principal',                   -principal),
    line('int-paid',    'Interest Paid on Mortgage',                         -interest),
    line('new-borrow',  'Proceeds from New Borrowings',                      newBorrow),
    line('cap-contrib', 'Capital Contributions from Partners',               capContrib),
    line('lp-dist-cf',  'Distributions to LP Partners',                      -lpDist),
    line('gp-dist-cf',  'Distributions to GP / Promote',                     -gpDist),
    line('other-fin',   'Other Financing Activities',                        otherFin),
    subtotal('net-fin', 'NET CASH PROVIDED BY (USED IN) FINANCING ACTIVITIES', netFinancing),
    spacer('s3'),

    hdr('net-hdr', 'D.  NET CHANGE IN CASH & CASH EQUIVALENTS'),
    line('net-cash-change', 'Net Increase (Decrease) in Cash',              netCashChange),
    line('cash-beg',    'Cash — Beginning of Period',                        cashBeg),
    spacer('s4'),
    total('cash-end',   'CASH — END OF PERIOD',                             cashEnd),
    spacer('s5'),

    hdr('supp-hdr', 'E.  SUPPLEMENTAL DISCLOSURES  (Required — ASC 230-10-50)'),
    line('int-disc',    'Cash Paid for Interest',                            interest),
    line('tax-disc',    'Cash Paid for Income Taxes',                        0),
    spacer('s6'),

    hdr('noncash-hdr', 'F.  NON-CASH INVESTING & FINANCING ACTIVITIES'),
    note('noncash-1',   `Depreciation — non-cash charge: ${fmtCurrency(da)}`),
    note('noncash-2',   `Amortization of financing costs: ${fmtCurrency(finAmort)}`),
    note('noncash-3',   `Principal portion of debt service: ${fmtCurrency(principal)}`),
  ]

  return {
    title:    'Statement of Cash Flows',
    subtitle: 'ASC 230 — Indirect Method | Operating / Investing / Financing Activities',
    period:   `Year Ended ${periodLabel(sel)}`,
    entity:   property.name,
    ein:      property.ein,
    rows,
  }
}

/* ─── Pref gap summary helpers ──────────────────────────────────────────────── */

export type PrefGapSummary = {
  calculatedYTD: number
  actualPaidYTD: number
  gapYTD: number        // positive = behind; negative = overpaid
  monthsWithGap: number
}

export function computePrefGapSummary(entries: MonthlyEntry[]): PrefGapSummary {
  const calculatedYTD = entries.reduce((s, e) => s + e.distributions.calculatedLPPref, 0)
  const actualPaidYTD = entries.reduce((s, e) => s + e.distributions.actualLPDistribution, 0)
  const gapYTD        = calculatedYTD - actualPaidYTD
  const monthsWithGap = entries.filter((e) => e.distributions.prefGap > 0.01).length
  return { calculatedYTD, actualPaidYTD, gapYTD, monthsWithGap }
}
