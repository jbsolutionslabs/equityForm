import React, { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore, ActivityEvent } from '../../state/store'
import { useAccountingStore } from '../../state/accountingStore'
import type { MonthlyEntry, MultifamilyPnL, HotelPnL, AccountingProperty } from '../../state/accountingTypes'

// ── Pure helpers ──────────────────────────────────────────────────────────────

function fmtCurrency(n: number, compact = true): string {
  if (!isFinite(n)) return '—'
  if (compact) {
    if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
    if (Math.abs(n) >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`
  }
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function fmtPct(n: number, decimals = 1): string {
  if (!isFinite(n)) return '—'
  return `${n.toFixed(decimals)}%`
}

function fmtDate(s?: string | null): string {
  if (!s) return '—'
  try {
    return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch { return '—' }
}

function fmtPeriod(p: string): string {
  const [year, mo] = p.split('-')
  const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${names[parseInt(mo, 10) - 1]} ${year}`
}

function fmtRelTime(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1)   return 'just now'
  if (mins < 60)  return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)   return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30)  return `${days}d ago`
  return fmtDate(timestamp)
}

/** Compute EGI for a multifamily month */
function mfEGI(pnl: MultifamilyPnL): number {
  return pnl.grossPotentialRent - pnl.vacancyLoss - pnl.concessions - pnl.badDebt
       + pnl.utilityReimbursements + pnl.otherIncome
}

/** Compute operating expenses for a multifamily month */
function mfOpex(pnl: MultifamilyPnL): number {
  return pnl.propertyManagementFee + pnl.payrollBenefits + pnl.repairsMaintenance
       + pnl.makeReadyTurns + pnl.landscaping + pnl.utilitiesCommonArea
       + pnl.insurance + pnl.propertyTaxes + pnl.marketingAdvertising
       + pnl.administrativeGeneral + pnl.contractServices
}

/** Compute total revenues for any entry */
function entryRevenue(entry: MonthlyEntry): number {
  if (entry.assetClass === 'multifamily') {
    const pnl = entry.pnl as MultifamilyPnL
    return Math.max(mfEGI(pnl), 0)
  }
  const pnl = entry.pnl as HotelPnL
  return pnl.roomsRevenue + pnl.foodBeverageRevenue + pnl.otherOperatedDepts + pnl.miscIncome
}

/** Compute total outflows (opex + debt service + capex + distributions) for any entry */
function entryOutflows(entry: MonthlyEntry): number {
  let opex = 0
  if (entry.assetClass === 'multifamily') {
    opex = mfOpex(entry.pnl as MultifamilyPnL)
  } else {
    const pnl = entry.pnl as HotelPnL
    opex = pnl.roomsExpense + pnl.foodBeverageExpense + pnl.otherDeptExpense
         + pnl.administrativeGeneral + pnl.itTelecom + pnl.salesMarketing
         + pnl.propertyOperationsMaint + pnl.utilities
         + pnl.baseManagementFee + pnl.incentiveManagementFee + pnl.franchiseFee + pnl.programMarketingFee
  }
  const bl = entry.belowLine
  return opex + bl.debtServiceInterest + bl.debtServicePrincipal + bl.capEx + bl.replacementReserve
       + entry.distributions.actualLPDistribution + entry.distributions.actualGPDistribution
}

/** Compute monthly NOI */
function entryNOI(entry: MonthlyEntry): number {
  if (entry.assetClass === 'multifamily') {
    const pnl = entry.pnl as MultifamilyPnL
    return mfEGI(pnl) - mfOpex(pnl)
  }
  const pnl = entry.pnl as HotelPnL
  const rev = pnl.roomsRevenue + pnl.foodBeverageRevenue + pnl.otherOperatedDepts + pnl.miscIncome
  const dept = pnl.roomsExpense + pnl.foodBeverageExpense + pnl.otherDeptExpense
  const undist = pnl.administrativeGeneral + pnl.itTelecom + pnl.salesMarketing
               + pnl.propertyOperationsMaint + pnl.utilities
  const mgmt = pnl.baseManagementFee + pnl.incentiveManagementFee + pnl.franchiseFee + pnl.programMarketingFee
  return rev - dept - undist - mgmt
}

/** Compute DSCR from the most-recent (up to 12) monthly entries */
function computeDSCR(entries: MonthlyEntry[]): number | null {
  const recent = entries.slice(-12)
  if (!recent.length) return null
  const totalNOI  = recent.reduce((s, e) => s + entryNOI(e), 0)
  const totalDebt = recent.reduce((s, e) => s + e.belowLine.debtServiceInterest + e.belowLine.debtServicePrincipal, 0)
  if (totalDebt === 0) return null
  return totalNOI / totalDebt
}

/** Compute Debt Yield (annualized NOI / outstanding balance) */
function computeDebtYield(entries: MonthlyEntry[], property: AccountingProperty): number | null {
  const recent = entries.slice(-12)
  if (!recent.length) return null
  const annualNOI = recent.reduce((s, e) => s + entryNOI(e), 0) * (12 / recent.length)
  const principalPaid = entries.reduce((s, e) => s + e.belowLine.debtServicePrincipal, 0)
  const balance = property.debtStructure.loanAmount - principalPaid
  if (balance <= 0) return null
  return (annualNOI / balance) * 100
}

/** Newton's method IRR — monthly cash flows, returns annualized % */
function computeAnnualIRR(
  initialInvestment: number,
  monthlyDist: number[],
  terminalEquityValue: number,
): number | null {
  if (initialInvestment <= 0 || monthlyDist.length === 0) return null
  const flows = [-initialInvestment, ...monthlyDist.slice(0, -1),
    (monthlyDist[monthlyDist.length - 1] || 0) + terminalEquityValue]

  let rate = 0.008
  for (let iter = 0; iter < 200; iter++) {
    let npv = 0; let dnpv = 0
    for (let t = 0; t < flows.length; t++) {
      const disc = Math.pow(1 + rate, t)
      npv  += flows[t] / disc
      dnpv -= t * flows[t] / (disc * (1 + rate))
    }
    if (Math.abs(dnpv) < 1e-10) break
    const delta = npv / dnpv
    rate -= delta
    if (Math.abs(delta) < 1e-8) break
  }
  if (!isFinite(rate) || rate <= -1) return null
  const annual = (Math.pow(1 + rate, 12) - 1) * 100
  return annual > -100 && annual < 1000 ? annual : null
}

/** Last 6 YYYY-MM periods ending with the current month */
function getLast6Periods(): string[] {
  const now = new Date()
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
}

function currentPeriod(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// ── Sub-types ─────────────────────────────────────────────────────────────────

type DealRow = {
  id: string
  name: string
  assetClass: string
  acquisitionDate: string
  totalCapitalization: number
  lpEquity: number
  prefReturnPct: number
  actualYTDReturnPct: number
  vsProjected: 'green' | 'yellow' | 'red' | 'none'
  irr: number | null
  coc: number | null
  equityMultiple: number | null
  dscr: number | null
  debtYield: number | null
  lastDistDate: string | null
  lastDistAmount: number
  cashOnHand: number
  dealStatus: string
  missingData: boolean
  route: string
}

type PendingAction = {
  dealName: string
  action: string
  urgency: 'high' | 'medium' | 'info'
  detail?: string
}

type ChartPoint = { period: string; inflows: number; outflows: number }

type UpcomingOutflow = {
  dealName: string
  outflowType: 'Distribution' | 'Debt Service' | 'CapEx'
  amount: number
  dueDate: string
}

// ── Category icons ────────────────────────────────────────────────────────────

const FEED_ICONS: Record<ActivityEvent['category'], string> = {
  investor:     '👤',
  subscription: '📄',
  distribution: '💸',
  document:     '📋',
  spv:          '🏢',
  financials:   '📊',
  valuation:    '📈',
}

// ── Main component ────────────────────────────────────────────────────────────

export const GpDashboard: React.FC = () => {
  const navigate    = useNavigate()
  const data        = useAppStore((s) => s.data)
  const setDeal     = useAppStore((s) => s.setDeal)
  const addActivity = useAppStore((s) => s.addActivity)

  const allProperties = useAccountingStore((s) => s.properties)
  const allEntries    = useAccountingStore((s) => s.entries)

  const { deal, offering, investors, subscriptions, operatingAgreement, spv, activityFeed } = data

  const [valuationModal, setValuationModal] = useState<string | null>(null) // property id or 'deal'
  const [valuationInput, setValuationInput] = useState('')
  const [notification, setNotification] = useState<string | null>(null)

  const notify = (msg: string) => {
    setNotification(msg)
    window.setTimeout(() => setNotification(null), 4000)
  }

  const now = new Date()
  const curPeriod = currentPeriod()

  // ── Section 1: Portfolio Summary ────────────────────────────────────────────

  const { totalAUM, totalInvestorCapital, totalDistributions, activeDealCount } = useMemo(() => {
    if (allProperties.length > 0) {
      return {
        totalAUM: allProperties.reduce((s, p) => {
          const val = p.id === 'deal' ? (deal.currentValuation ?? p.purchasePrice) : p.purchasePrice
          return s + val
        }, 0),
        totalInvestorCapital: allProperties.reduce((s, p) => s + p.waterfall.lpEquity, 0),
        totalDistributions: allEntries.reduce((s, e) =>
          s + e.distributions.actualLPDistribution + e.distributions.actualGPDistribution, 0),
        activeDealCount: allProperties.length,
      }
    }
    // Fallback: Phase 1 data only
    const paidCapital = subscriptions
      .filter((sub) => sub.status === 'paid')
      .reduce((s, sub) => {
        const inv = investors.find((i) => i.id === sub.investorId)
        return s + (inv?.subscriptionAmount || 0)
      }, 0)
    const totalCommitted = investors.reduce((s, inv) => s + (inv.subscriptionAmount || 0), 0)
    return {
      totalAUM: deal.currentValuation ?? totalCommitted,
      totalInvestorCapital: totalCommitted,
      totalDistributions: 0,
      activeDealCount: deal.entityName ? 1 : 0,
    }
  }, [allProperties, allEntries, deal, investors, subscriptions])

  // ── Section 2: Deal Portfolio Table ────────────────────────────────────────

  const dealRows: DealRow[] = useMemo(() => {
    // If accounting properties exist, build full rows from them
    if (allProperties.length > 0) {
      return allProperties.map((prop) => {
        const entries = allEntries
          .filter((e) => e.propertyId === prop.id)
          .sort((a, b) => a.period.localeCompare(b.period))

        const lpEquity    = prop.waterfall.lpEquity
        const totalEquity = lpEquity + prop.waterfall.gpEquity
        const prefPct     = prop.waterfall.lpPrefRateAnnual * 100

        // YTD distributions
        const ytdYear   = now.getFullYear()
        const ytdDist   = entries
          .filter((e) => e.period.startsWith(String(ytdYear)))
          .reduce((s, e) => s + e.distributions.actualLPDistribution, 0)
        const actualYTD = lpEquity > 0 ? (ytdDist / lpEquity) * 100 : 0
        const diff      = actualYTD - prefPct
        const vsProj    = lpEquity > 0
          ? diff >= 0 ? 'green' : diff >= -2 ? 'yellow' : 'red'
          : 'none'

        // Totals
        const totalLPDist  = entries.reduce((s, e) => s + e.distributions.actualLPDistribution, 0)
        const totalGPDist  = entries.reduce((s, e) => s + e.distributions.actualGPDistribution, 0)
        const totalDist    = totalLPDist + totalGPDist

        // CoC (YTD annual distributions / total equity)
        const ytdTotalDist = entries
          .filter((e) => e.period.startsWith(String(ytdYear)))
          .reduce((s, e) => s + e.distributions.actualLPDistribution + e.distributions.actualGPDistribution, 0)
        const coc = totalEquity > 0 ? (ytdTotalDist / totalEquity) * 100 : null

        // Equity Multiple
        const principalPaid = entries.reduce((s, e) => s + e.belowLine.debtServicePrincipal, 0)
        const outstandingDebt = Math.max(prop.debtStructure.loanAmount - principalPaid, 0)
        const currentVal   = deal.currentValuation ?? prop.purchasePrice
        const equityMultiple = totalEquity > 0
          ? (totalDist + currentVal - outstandingDebt) / totalEquity
          : null

        // IRR
        const monthlyLPDist = entries.map((e) => e.distributions.actualLPDistribution)
        const terminalEquity = Math.max((currentVal - outstandingDebt) * prop.waterfall.lpOwnershipPct, 0)
        const irr = computeAnnualIRR(lpEquity, monthlyLPDist, terminalEquity)

        // DSCR & Debt Yield
        const dscr      = computeDSCR(entries)
        const debtYield = computeDebtYield(entries, prop)

        // Last distribution
        const lastWithDist = [...entries].reverse().find(
          (e) => e.distributions.actualLPDistribution > 0 || e.distributions.actualGPDistribution > 0,
        )
        const lastDistDate   = lastWithDist?.period ?? null
        const lastDistAmount = lastWithDist
          ? lastWithDist.distributions.actualLPDistribution + lastWithDist.distributions.actualGPDistribution
          : 0

        // Cash on hand
        const lastEntry  = entries[entries.length - 1]
        const cashOnHand = lastEntry?.workingCapital.cashEnding ?? 0

        return {
          id:                  prop.id,
          name:                prop.name || prop.address,
          assetClass:          prop.assetClass === 'multifamily' ? 'Multifamily' : 'Hotel',
          acquisitionDate:     prop.acquisitionDate,
          totalCapitalization: prop.purchasePrice,
          lpEquity,
          prefReturnPct:       prefPct,
          actualYTDReturnPct:  actualYTD,
          vsProjected:         vsProj as DealRow['vsProjected'],
          irr,
          coc,
          equityMultiple,
          dscr,
          debtYield,
          lastDistDate,
          lastDistAmount,
          cashOnHand,
          dealStatus:          deal.dealStatus || 'Active',
          missingData:         entries.length === 0,
          route:               '/accounting',
        }
      })
    }

    // Fallback: Phase 1 only
    if (!deal.entityName) return []
    const paidSubs = subscriptions.filter((s) => s.status === 'paid')
    const lpEquity = investors.reduce((s, inv) => s + (inv.subscriptionAmount || 0), 0)
    return [{
      id:                  'deal',
      name:                deal.entityName,
      assetClass:          '—',
      acquisitionDate:     deal.effectiveDate || '',
      totalCapitalization: deal.currentValuation ?? lpEquity,
      lpEquity,
      prefReturnPct:       offering.preferredReturnRate ?? 0,
      actualYTDReturnPct:  0,
      vsProjected:         'none',
      irr:                 null,
      coc:                 null,
      equityMultiple:      null,
      dscr:                null,
      debtYield:           null,
      lastDistDate:        null,
      lastDistAmount:      0,
      cashOnHand:          0,
      dealStatus:          deal.dealStatus || 'Raising',
      missingData:         true,
      route:               '/accounting',
    }]
  }, [allProperties, allEntries, deal, offering, investors, subscriptions, now])

  // ── Section 3: Cash Flow ────────────────────────────────────────────────────

  const { mtdInflows, mtdOutflows, chartData, upcomingOutflows } = useMemo(() => {
    const curEntries = allEntries.filter((e) => e.period === curPeriod)
    const mtdIn  = curEntries.reduce((s, e) => s + entryRevenue(e), 0)
    const mtdOut = curEntries.reduce((s, e) => s + entryOutflows(e), 0)

    const periods = getLast6Periods()
    const chart: ChartPoint[] = periods.map((p) => {
      const pe = allEntries.filter((e) => e.period === p)
      return {
        period:   p,
        inflows:  pe.reduce((s, e) => s + entryRevenue(e), 0),
        outflows: pe.reduce((s, e) => s + entryOutflows(e), 0),
      }
    })

    // Upcoming: monthly debt service from each property + estimated LP distribution
    const upcoming: UpcomingOutflow[] = []
    allProperties.forEach((prop) => {
      const loanAmt   = prop.debtStructure.loanAmount
      const intRate   = prop.debtStructure.annualInterestRate
      const monthlyDS = loanAmt > 0 ? (loanAmt * intRate) / 12 : 0
      if (monthlyDS > 0) {
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
        upcoming.push({
          dealName:    prop.name || prop.address,
          outflowType: 'Debt Service',
          amount:      monthlyDS,
          dueDate:     monthEnd.toISOString().slice(0, 10),
        })
      }
      const lpPref = (prop.waterfall.lpEquity * prop.waterfall.lpPrefRateAnnual) / 12
      if (lpPref > 0) {
        const distDate = new Date(now.getFullYear(), now.getMonth() + 1, 15)
        upcoming.push({
          dealName:    prop.name || prop.address,
          outflowType: 'Distribution',
          amount:      lpPref,
          dueDate:     distDate.toISOString().slice(0, 10),
        })
      }
    })

    return { mtdInflows: mtdIn, mtdOutflows: mtdOut, chartData: chart, upcomingOutflows: upcoming }
  }, [allEntries, allProperties, curPeriod, now])

  const chartMax = Math.max(...chartData.flatMap((d) => [d.inflows, d.outflows]), 1)

  // ── Section 4: Pending Actions ──────────────────────────────────────────────

  const pendingActions: PendingAction[] = useMemo(() => {
    const actions: PendingAction[] = []
    const dealName = deal.entityName || 'Current Deal'

    // Investors with incomplete onboarding
    const incomplete = investors.filter(
      (inv) => !inv.accreditedInvestor || !inv.email || !inv.subscriptionAmount,
    )
    if (incomplete.length > 0) {
      actions.push({
        dealName,
        action:  `${incomplete.length} investor(s) with incomplete onboarding`,
        urgency: 'medium',
        detail:  incomplete.map((i) => i.fullLegalName).slice(0, 3).join(', '),
      })
    }

    // Unsigned subscription agreements
    const unsignedSubs = subscriptions.filter(
      (s) => s.status !== 'signed' && s.status !== 'paid',
    )
    if (unsignedSubs.length > 0) {
      actions.push({
        dealName,
        action:  `${unsignedSubs.length} subscription agreement(s) awaiting execution`,
        urgency: 'high',
      })
    }

    // Missing monthly financials (current month)
    allProperties.forEach((prop) => {
      const hasEntry = allEntries.some((e) => e.propertyId === prop.id && e.period === curPeriod)
      if (!hasEntry) {
        actions.push({
          dealName:  prop.name || prop.address,
          action:    `Missing ${fmtPeriod(curPeriod)} financials`,
          urgency:   'medium',
          detail:    'Monthly P&L not yet submitted',
        })
      }
    })

    // Upcoming distributions within 14 days
    const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate()
    if (daysLeft <= 14) {
      allProperties.forEach((prop) => {
        const lpPref = (prop.waterfall.lpEquity * prop.waterfall.lpPrefRateAnnual) / 12
        if (lpPref > 0) {
          actions.push({
            dealName:  prop.name || prop.address,
            action:    `Monthly LP distribution due — ${fmtCurrency(lpPref)}`,
            urgency:   'medium',
            detail:    `${daysLeft} day(s) remaining`,
          })
        }
      })
    }

    // Expiring accreditation — investors without accredited status
    investors.forEach((inv) => {
      if (inv.accreditedInvestor === false) {
        actions.push({
          dealName,
          action:  `${inv.fullLegalName} — accreditation not confirmed`,
          urgency: 'high',
        })
      }
    })

    // DSCR alert
    allProperties.forEach((prop) => {
      const entries = allEntries.filter((e) => e.propertyId === prop.id)
      const dscr    = computeDSCR(entries)
      if (dscr !== null && dscr < 1.25) {
        actions.push({
          dealName:  prop.name || prop.address,
          action:    `DSCR alert: ${dscr.toFixed(2)} — below 1.25 threshold`,
          urgency:   dscr < 1.0 ? 'high' : 'medium',
        })
      }
    })

    return actions
  }, [deal, investors, subscriptions, allProperties, allEntries, curPeriod, now])

  // ── Section 5: Investor Snapshot ────────────────────────────────────────────

  const { totalCommitted, totalCalled, pendingOnboarding } = useMemo(() => {
    const committed = investors.reduce((s, inv) => s + (inv.subscriptionAmount || 0), 0)
    const called    = subscriptions
      .filter((s) => s.status === 'paid')
      .reduce((s, sub) => {
        const inv = investors.find((i) => i.id === sub.investorId)
        return s + (inv?.subscriptionAmount || 0)
      }, 0)
    const pending = investors.filter((inv) => !inv.accreditedInvestor || !inv.email).length
    return { totalCommitted: committed, totalCalled: called, pendingOnboarding: pending }
  }, [investors, subscriptions])

  // ── Section 6: Activity Feed ────────────────────────────────────────────────

  const computedFeed: ActivityEvent[] = useMemo(() => {
    const events: ActivityEvent[] = []
    const dName = deal.entityName || 'Deal'

    // SPV formed
    if (spv?.formed && spv.formationDate) {
      events.push({ id: 'spv-formed', timestamp: spv.formationDate, dealName: dName, action: 'New SPV formed and registered', category: 'spv' })
    }
    // OA signed
    if (operatingAgreement.signedAt) {
      events.push({ id: 'oa-signed', timestamp: operatingAgreement.signedAt, dealName: dName, action: 'Operating Agreement signed by GP', category: 'document' })
    }
    // Subscription agreements executed
    subscriptions.filter((s) => s.signedAt).forEach((sub) => {
      const inv = investors.find((i) => i.id === sub.investorId)
      events.push({ id: `sub-signed-${sub.investorId}`, timestamp: sub.signedAt!, dealName: dName, action: `Subscription agreement signed by ${inv?.fullLegalName || 'investor'}`, category: 'subscription' })
    })
    // Capital received
    subscriptions.filter((s) => s.paidAt).forEach((sub) => {
      const inv = investors.find((i) => i.id === sub.investorId)
      events.push({ id: `wire-${sub.investorId}`, timestamp: sub.paidAt!, dealName: dName, action: `Capital received from ${inv?.fullLegalName || 'investor'} (${fmtCurrency(inv?.subscriptionAmount || 0)})`, category: 'investor' })
    })
    // Monthly financials submitted
    allEntries.forEach((entry) => {
      const prop = allProperties.find((p) => p.id === entry.propertyId)
      events.push({ id: `fin-${entry.id}`, timestamp: entry.createdAt, dealName: prop?.name || 'Property', action: `Monthly financials submitted for ${fmtPeriod(entry.period)}`, category: 'financials' })
    })

    return events
  }, [deal, spv, operatingAgreement, subscriptions, investors, allEntries, allProperties])

  const feedItems = useMemo(() => {
    return [...computedFeed, ...(activityFeed || [])]
      .filter((e, i, arr) => arr.findIndex((x) => x.id === e.id) === i) // deduplicate
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, 20)
  }, [computedFeed, activityFeed])

  // ── Valuation modal ─────────────────────────────────────────────────────────

  const openValuationModal = () => {
    setValuationInput(deal.currentValuation ? String(deal.currentValuation) : '')
    setValuationModal('deal')
  }

  const saveValuation = () => {
    const amt = parseFloat(valuationInput.replace(/,/g, ''))
    if (isNaN(amt) || amt < 0) return
    setDeal({ currentValuation: amt })
    addActivity({
      timestamp: new Date().toISOString(),
      dealName:  deal.entityName || 'Deal',
      action:    `Valuation updated to ${fmtCurrency(amt, false)}`,
      category:  'valuation',
    })
    setValuationModal(null)
    notify('Valuation updated.')
  }

  // ── Render helpers ──────────────────────────────────────────────────────────

  function dscrBadge(dscr: number | null) {
    if (dscr === null) return <span className="status-badge status-badge--grey">No data</span>
    if (dscr >= 1.25)  return <span className="status-badge status-badge--green">{dscr.toFixed(2)}</span>
    if (dscr >= 1.0)   return <span className="status-badge status-badge--yellow">{dscr.toFixed(2)}</span>
    return <span className="status-badge status-badge--red">{dscr.toFixed(2)}</span>
  }

  function debtYieldBadge(dy: number | null) {
    if (dy === null)  return <span className="status-badge status-badge--grey">No data</span>
    if (dy >= 8)      return <span className="status-badge status-badge--green">{fmtPct(dy)}</span>
    if (dy >= 6)      return <span className="status-badge status-badge--yellow">{fmtPct(dy)}</span>
    return <span className="status-badge status-badge--red">{fmtPct(dy)}</span>
  }

  function vsProjectedBadge(row: DealRow) {
    if (row.vsProjected === 'none') return <span className="status-badge status-badge--grey">—</span>
    const diff = row.actualYTDReturnPct - row.prefReturnPct
    const label = `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`
    if (row.vsProjected === 'green')  return <span className="status-badge status-badge--green">{label}</span>
    if (row.vsProjected === 'yellow') return <span className="status-badge status-badge--yellow">{label}</span>
    return <span className="status-badge status-badge--red">{label}</span>
  }

  function urgencyBadge(urgency: PendingAction['urgency']) {
    if (urgency === 'high')   return <span className="status-badge status-badge--red">Action required</span>
    if (urgency === 'medium') return <span className="status-badge status-badge--yellow">Attention</span>
    return <span className="status-badge status-badge--grey">Info</span>
  }

  function statusBadge(status: string) {
    if (status === 'Active')  return <span className="status-badge status-badge--green">Active</span>
    if (status === 'Raising') return <span className="status-badge status-badge--yellow">Raising</span>
    return <span className="status-badge status-badge--grey">Exiting</span>
  }

  // ── JSX ─────────────────────────────────────────────────────────────────────

  return (
    <div className="page-enter dash-page">

      {/* ── Page header ── */}
      <div className="dash-page-header">
        <div>
          <h1 className="dash-page-title">GP Dashboard</h1>
          <p className="dash-page-subtitle">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div className="dash-header-actions">
          <button type="button" className="btn btn-secondary" onClick={openValuationModal}>
            Update Valuation
          </button>
          {pendingActions.length > 0 && (
            <span className="dash-pending-badge">{pendingActions.length}</span>
          )}
        </div>
      </div>

      {/* Notification */}
      {notification && (
        <div className="notification notification--success" role="alert">✓ {notification}</div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          Section 1 — Portfolio Summary
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="dash-section">
        <div className="dash-section-header">
          <h2 className="dash-section-title">Portfolio Summary</h2>
        </div>
        <div className="dash-stat-grid">
          <div className="dash-stat-card">
            <div className="dash-stat-label">Total AUM</div>
            <div className="dash-stat-value">{fmtCurrency(totalAUM)}</div>
            <div className="dash-stat-sub">Across all active deals</div>
          </div>
          <div className="dash-stat-card">
            <div className="dash-stat-label">Total Investor Capital</div>
            <div className="dash-stat-value">{fmtCurrency(totalInvestorCapital)}</div>
            <div className="dash-stat-sub">LP equity deployed</div>
          </div>
          <div className="dash-stat-card">
            <div className="dash-stat-label">Distributions Paid</div>
            <div className="dash-stat-value">{fmtCurrency(totalDistributions)}</div>
            <div className="dash-stat-sub">Cumulative to date</div>
          </div>
          <div className="dash-stat-card">
            <div className="dash-stat-label">Active Deals</div>
            <div className="dash-stat-value dash-stat-value--count">{activeDealCount}</div>
            <div className="dash-stat-sub">Raising or active</div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          Section 2 — Deal Portfolio Table
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="dash-section">
        <div className="dash-section-header">
          <h2 className="dash-section-title">Deal Portfolio</h2>
          <span className="dash-section-hint">Click a row to open the deal</span>
        </div>

        {dealRows.length === 0 ? (
          <div className="dash-empty">
            No deals found. Complete the Questionnaire to get started.
          </div>
        ) : (
          <div className="dash-table-scroll">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Status</th>
                  <th>Asset Class</th>
                  <th>Acquired</th>
                  <th>Total Cap.</th>
                  <th>LP Equity</th>
                  <th>Pref %</th>
                  <th>YTD Return</th>
                  <th>vs Projected</th>
                  <th>IRR</th>
                  <th>CoC</th>
                  <th>Eq. Multiple</th>
                  <th>DSCR</th>
                  <th>Debt Yield</th>
                  <th>Last Dist.</th>
                  <th>Cash on Hand</th>
                </tr>
              </thead>
              <tbody>
                {dealRows.map((row) => (
                  <tr
                    key={row.id}
                    className={`dash-table-row${row.missingData ? ' dash-table-row--missing' : ''}`}
                    onClick={() => navigate(row.route)}
                    title={row.missingData ? 'Missing financial data — click to enter financials' : undefined}
                  >
                    <td className="dash-table-name">
                      {row.name}
                      {row.missingData && (
                        <span className="dash-missing-flag" title="Financials not submitted">⚠ No data</span>
                      )}
                    </td>
                    <td>{statusBadge(row.dealStatus)}</td>
                    <td>{row.assetClass}</td>
                    <td>{row.acquisitionDate ? fmtDate(row.acquisitionDate) : '—'}</td>
                    <td>{fmtCurrency(row.totalCapitalization)}</td>
                    <td>{fmtCurrency(row.lpEquity)}</td>
                    <td>{row.prefReturnPct > 0 ? fmtPct(row.prefReturnPct) : '—'}</td>
                    <td>{row.lpEquity > 0 ? fmtPct(row.actualYTDReturnPct) : '—'}</td>
                    <td>{vsProjectedBadge(row)}</td>
                    <td>{row.irr !== null ? fmtPct(row.irr) : <span className="dash-na">—</span>}</td>
                    <td>{row.coc !== null ? fmtPct(row.coc) : <span className="dash-na">—</span>}</td>
                    <td>{row.equityMultiple !== null ? `${row.equityMultiple.toFixed(2)}x` : <span className="dash-na">—</span>}</td>
                    <td>{dscrBadge(row.dscr)}</td>
                    <td>{debtYieldBadge(row.debtYield)}</td>
                    <td>
                      {row.lastDistDate ? (
                        <span>{fmtPeriod(row.lastDistDate)}<br /><small>{fmtCurrency(row.lastDistAmount)}</small></span>
                      ) : '—'}
                    </td>
                    <td>{row.cashOnHand > 0 ? fmtCurrency(row.cashOnHand) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          Section 3 — Cash Flow Summary
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="dash-section">
        <div className="dash-section-header">
          <h2 className="dash-section-title">Cash Flow Summary</h2>
          <span className="dash-section-hint">{fmtPeriod(curPeriod)} month-to-date</span>
        </div>

        <div className="dash-cash-layout">

          {/* MTD stats */}
          <div className="dash-cash-stats">
            <div className="dash-cash-card dash-cash-card--inflow">
              <div className="dash-cash-card-label">Total Inflows MTD</div>
              <div className="dash-cash-card-value">
                {allEntries.length > 0 ? fmtCurrency(mtdInflows, false) : <span className="dash-na">No financials submitted</span>}
              </div>
            </div>
            <div className="dash-cash-card dash-cash-card--outflow">
              <div className="dash-cash-card-label">Total Outflows MTD</div>
              <div className="dash-cash-card-value">
                {allEntries.length > 0 ? fmtCurrency(mtdOutflows, false) : <span className="dash-na">No financials submitted</span>}
              </div>
            </div>
            <div className={`dash-cash-card ${mtdInflows - mtdOutflows >= 0 ? 'dash-cash-card--net-pos' : 'dash-cash-card--net-neg'}`}>
              <div className="dash-cash-card-label">Net Cash Position</div>
              <div className="dash-cash-card-value">
                {allEntries.length > 0
                  ? fmtCurrency(mtdInflows - mtdOutflows, false)
                  : <span className="dash-na">—</span>
                }
              </div>
            </div>
          </div>

          {/* Bar chart */}
          <div className="dash-chart-wrap">
            <div className="dash-chart-title">Last 6 Months — Inflows vs. Outflows</div>
            {chartData.every((d) => d.inflows === 0 && d.outflows === 0) ? (
              <div className="dash-empty" style={{ height: 160 }}>No financial data entered yet</div>
            ) : (
              <>
                <div className="dash-chart-bars">
                  {chartData.map((d) => (
                    <div key={d.period} className="dash-chart-group">
                      <div className="dash-chart-pair">
                        <div
                          className="dash-chart-bar dash-chart-bar--inflow"
                          style={{ height: `${Math.max((d.inflows / chartMax) * 140, d.inflows > 0 ? 2 : 0)}px` }}
                          title={`Inflows: ${fmtCurrency(d.inflows, false)}`}
                        />
                        <div
                          className="dash-chart-bar dash-chart-bar--outflow"
                          style={{ height: `${Math.max((d.outflows / chartMax) * 140, d.outflows > 0 ? 2 : 0)}px` }}
                          title={`Outflows: ${fmtCurrency(d.outflows, false)}`}
                        />
                      </div>
                      <div className="dash-chart-label">{fmtPeriod(d.period).slice(0, 3)}</div>
                    </div>
                  ))}
                </div>
                <div className="dash-chart-legend">
                  <span className="dash-chart-legend-dot dash-chart-legend-dot--inflow" />Inflows
                  <span className="dash-chart-legend-dot dash-chart-legend-dot--outflow" style={{ marginLeft: 16 }} />Outflows
                </div>
              </>
            )}
          </div>

          {/* Upcoming outflows */}
          <div className="dash-upcoming">
            <div className="dash-upcoming-title">Upcoming Outflows — Next 30 Days</div>
            {upcomingOutflows.length === 0 ? (
              <div className="dash-empty" style={{ padding: '12px 0' }}>No upcoming outflows</div>
            ) : (
              <table className="dash-upcoming-table">
                <thead>
                  <tr>
                    <th>Deal</th>
                    <th>Type</th>
                    <th>Amount</th>
                    <th>Due</th>
                  </tr>
                </thead>
                <tbody>
                  {upcomingOutflows.map((o, i) => (
                    <tr key={i}>
                      <td>{o.dealName}</td>
                      <td><span className="dash-outflow-type">{o.outflowType}</span></td>
                      <td>{fmtCurrency(o.amount, false)}</td>
                      <td>{fmtDate(o.dueDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          Sections 4 + 5 side by side
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="dash-two-col">

        {/* Section 4 — Pending Actions */}
        <div className="dash-section">
          <div className="dash-section-header">
            <h2 className="dash-section-title">
              Pending Actions
              {pendingActions.length > 0 && (
                <span className="dash-count-badge">{pendingActions.length}</span>
              )}
            </h2>
          </div>
          {pendingActions.length === 0 ? (
            <div className="dash-empty dash-empty--success">
              ✓ No pending action items — you're all caught up.
            </div>
          ) : (
            <ul className="dash-action-list">
              {pendingActions.map((a, i) => (
                <li key={i} className={`dash-action-item dash-action-item--${a.urgency}`}>
                  <div className="dash-action-content">
                    <div className="dash-action-name">{a.dealName}</div>
                    <div className="dash-action-text">{a.action}</div>
                    {a.detail && <div className="dash-action-detail">{a.detail}</div>}
                  </div>
                  <div className="dash-action-badge">{urgencyBadge(a.urgency)}</div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Section 5 — Investor Snapshot */}
        <div className="dash-section">
          <div className="dash-section-header">
            <h2 className="dash-section-title">Investor Snapshot</h2>
          </div>
          <div className="dash-investor-grid">
            <div className="dash-investor-stat">
              <div className="dash-investor-stat-value">{investors.length}</div>
              <div className="dash-investor-stat-label">Total Investors</div>
            </div>
            <div className="dash-investor-stat">
              <div className="dash-investor-stat-value">{fmtCurrency(totalCommitted)}</div>
              <div className="dash-investor-stat-label">Capital Committed</div>
            </div>
            <div className="dash-investor-stat">
              <div className="dash-investor-stat-value">{fmtCurrency(totalCalled)}</div>
              <div className="dash-investor-stat-label">Capital Called</div>
            </div>
            <div className="dash-investor-stat">
              <div className={`dash-investor-stat-value ${pendingOnboarding > 0 ? 'dash-investor-stat-value--warn' : ''}`}>
                {pendingOnboarding}
              </div>
              <div className="dash-investor-stat-label">Pending Onboarding</div>
            </div>
          </div>

          {/* Call gap progress bar */}
          {totalCommitted > 0 && (
            <div className="dash-call-gap">
              <div className="dash-call-gap-label">
                Capital called: {fmtCurrency(totalCalled)} of {fmtCurrency(totalCommitted)}
              </div>
              <div className="dash-progress-bar">
                <div
                  className="dash-progress-fill"
                  style={{ width: `${Math.min((totalCalled / totalCommitted) * 100, 100)}%` }}
                />
              </div>
              <div className="dash-call-gap-pct">
                {fmtPct((totalCalled / totalCommitted) * 100, 0)} called
              </div>
            </div>
          )}

          {/* K-1 Tax Season Notice */}
          {(() => {
            const month = now.getMonth() + 1
            if (month >= 1 && month <= 3) {
              const total = investors.length
              return (
                <div className="dash-k1-notice">
                  <strong>K-1 Season</strong> — {total} K-1s required for this tax year.
                  {' '}Distribute by April 15.
                </div>
              )
            }
            return null
          })()}
        </div>

      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          Section 6 — Activity Feed
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="dash-section">
        <div className="dash-section-header">
          <h2 className="dash-section-title">Recent Activity</h2>
          <span className="dash-section-hint">Last 20 events</span>
        </div>
        {feedItems.length === 0 ? (
          <div className="dash-empty">
            No activity yet. Activity will appear here as you use the platform.
          </div>
        ) : (
          <ul className="dash-feed">
            {feedItems.map((event) => (
              <li key={event.id} className="dash-feed-item">
                <div className="dash-feed-icon" title={event.category}>
                  {FEED_ICONS[event.category]}
                </div>
                <div className="dash-feed-body">
                  <div className="dash-feed-action">{event.action}</div>
                  <div className="dash-feed-meta">
                    <span className="dash-feed-deal">{event.dealName}</span>
                    <span className="dash-feed-time">{fmtRelTime(event.timestamp)}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          Valuation Update Modal
      ══════════════════════════════════════════════════════════════════════ */}
      {valuationModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="val-modal-title">
          <div className="modal">
            <div className="modal-header">
              <h2 id="val-modal-title" className="modal-title">Update Current Valuation</h2>
            </div>
            <div className="modal-body">
              <p style={{ marginTop: 0, color: 'var(--color-slate-600)' }}>
                Enter the current estimated market value of the property. This is used for IRR,
                equity multiple, and debt yield calculations. Purchase price is used as the proxy
                until you update this value.
              </p>
              <div className="field-group">
                <label className="field-label" htmlFor="valuation-input">
                  Current Valuation ($)
                </label>
                <input
                  id="valuation-input"
                  type="number"
                  className="field-input"
                  placeholder="e.g. 8500000"
                  value={valuationInput}
                  onChange={(e) => setValuationInput(e.target.value)}
                  min={0}
                  step={1000}
                  autoFocus
                />
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-primary"
                onClick={saveValuation}
                disabled={!valuationInput || isNaN(parseFloat(valuationInput))}
              >
                Save Valuation
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setValuationModal(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
