/**
 * waterfallEngine.ts — Pure deal-level distribution math.
 *
 * No store reads. All functions are pure and deterministic given their inputs.
 * The propose-not-dictate pattern: distribute() returns a DistributionResult
 * with proposed: true, signalling that the GP must accept or override before
 * the values are committed to accounting entries.
 */

import type {
  ProfitSplitConfig,
  WaterfallState,
  DistributionResult,
  DebtInstrument,
  PrepaymentPenaltyType,
  ExitScenarioAssumptions,
  ExitEventType,
  YearProjection,
  ProjectionResult,
  CapitalEvent,
  LoanPayoff,
  SaleConfig,
  RefiConfig,
} from '../state/economicsTypes';
import { buildAmortizationSchedule } from './amortization';

// ─── XIRR ────────────────────────────────────────────────────────────────────

/**
 * Newton-Raphson XIRR. Each flow has a date string 'YYYY-MM' and a dollar amount.
 * Negative = outflow (equity in), Positive = inflow (cash back).
 * Returns undefined if no sign change in NPV (can't converge).
 */
export function xirr(flows: { date: string; amount: number }[]): number | undefined {
  if (flows.length < 2) return undefined;

  // Ensure there is at least one positive and one negative flow
  const hasPositive = flows.some(f => f.amount > 0);
  const hasNegative = flows.some(f => f.amount < 0);
  if (!hasPositive || !hasNegative) return undefined;

  // Use first flow's date as time-zero reference
  const t0 = toDate(flows[0].date);

  function npv(rate: number): number {
    return flows.reduce((sum, f) => {
      const years = (toDate(f.date).getTime() - t0.getTime()) / (365.25 * 86_400_000);
      return sum + f.amount / Math.pow(1 + rate, years);
    }, 0);
  }

  function dnpv(rate: number): number {
    return flows.reduce((sum, f) => {
      const years = (toDate(f.date).getTime() - t0.getTime()) / (365.25 * 86_400_000);
      if (years === 0) return sum;
      return sum - (years * f.amount) / Math.pow(1 + rate, years + 1);
    }, 0);
  }

  let rate = 0.1; // initial guess
  for (let i = 0; i < 100; i++) {
    const n = npv(rate);
    const d = dnpv(rate);
    if (Math.abs(d) < 1e-14) break;
    const next = rate - n / d;
    if (Math.abs(next - rate) < 1e-7) return next;
    rate = next;
    if (rate < -0.9999) return undefined; // diverged
  }
  return Math.abs(npv(rate)) < 1 ? rate : undefined;
}

function toDate(yyyyMm: string): Date {
  return new Date(Date.UTC(
    parseInt(yyyyMm.slice(0, 4), 10),
    parseInt(yyyyMm.slice(5, 7), 10) - 1,
    1,
  ));
}

// ─── Debt constant ────────────────────────────────────────────────────────────

/**
 * Annual debt service constant = 12 × monthly payment factor.
 * annualRate decimal (0.065), amortMonths integer.
 */
export function annualDebtConstant(rate: number, amortMonths: number): number {
  if (amortMonths <= 0) return 0;
  const r = rate / 12;
  if (r === 0) return 12 / amortMonths;
  const pmt = (r * Math.pow(1 + r, amortMonths)) / (Math.pow(1 + r, amortMonths) - 1);
  return pmt * 12;
}

// ─── Loan sizing ──────────────────────────────────────────────────────────────

/**
 * Size a new loan given method and deal params.
 *
 * ltv        → target × params.value
 * debt_yield → params.noi / target
 * dscr       → (params.noi / target) / annualDebtConstant(params.rate, params.amortMonths)
 *               When params.isInterestOnly: use params.rate instead of debt constant.
 */
export function sizeLoan(
  method: 'ltv' | 'dscr' | 'debt_yield',
  target: number,
  params: {
    value?: number;    // required for ltv
    noi?: number;      // required for dscr / debt_yield
    rate?: number;     // required for dscr
    amortMonths?: number; // required for dscr (unless isInterestOnly)
    isInterestOnly?: boolean;
  },
): number {
  switch (method) {
    case 'ltv':
      return target * (params.value ?? 0);

    case 'debt_yield':
      if (target === 0) return 0;
      return (params.noi ?? 0) / target;

    case 'dscr': {
      if (target === 0) return 0;
      const noi = params.noi ?? 0;
      if (params.isInterestOnly) {
        const rate = params.rate ?? 0;
        if (rate === 0) return 0;
        return (noi / target) / rate;
      }
      const dc = annualDebtConstant(params.rate ?? 0, params.amortMonths ?? 0);
      if (dc === 0) return 0;
      return (noi / target) / dc;
    }

    default:
      return 0;
  }
}

// ─── Prepayment penalty ───────────────────────────────────────────────────────

/**
 * Calculate prepayment penalty for an instrument.
 *
 * @param instrument     The debt instrument being paid off
 * @param payoffMonth    1-based month within the loan term
 * @param balance        Outstanding balance at payoff
 * @param marketRate     Current market rate for yield maintenance (optional)
 */
export function calcPrepaymentPenalty(
  instrument: {
    prepaymentPenaltyType?: PrepaymentPenaltyType;
    prepaymentPenaltySchedule?: string; // e.g. "3,2,1" = 3% yr0, 2% yr1, 1% yr2
    penaltyPct?: number;
    loanAmount?: number;
    fixedRate?: number;
    termYears?: number;
  },
  payoffMonth: number,
  balance: number,
  marketRate?: number,
): number {
  const penaltyType = instrument.prepaymentPenaltyType ?? 'none';

  switch (penaltyType) {
    case 'none':
      return 0;

    case 'flat':
      return balance * (instrument.penaltyPct ?? 0);

    case 'step_down': {
      if (!instrument.prepaymentPenaltySchedule) return 0;
      const steps = instrument.prepaymentPenaltySchedule
        .split(',')
        .map(s => parseFloat(s.trim()) / 100);
      const yearIndex = Math.floor((payoffMonth - 1) / 12);
      if (yearIndex >= steps.length) return 0;
      const rate = steps[yearIndex] ?? 0;
      return balance * rate;
    }

    case 'yield_maintenance': {
      // Simplified: penalty = present value of remaining interest spread over treasury
      // minimum 1% of balance
      const coupon    = instrument.fixedRate ?? 0;
      const treasury  = marketRate ?? (coupon * 0.8); // fallback stub
      const spread    = Math.max(0, coupon - treasury);
      const termMonths = (instrument.termYears ?? 0) * 12;
      const remainingMonths = Math.max(0, termMonths - payoffMonth);
      if (remainingMonths === 0) return balance * 0.01;
      const r = treasury / 12;
      let pv = 0;
      const monthlyPenalty = balance * spread / 12;
      for (let m = 1; m <= remainingMonths; m++) {
        pv += monthlyPenalty / Math.pow(1 + r, m);
      }
      return Math.max(pv, balance * 0.01);
    }

    case 'defeasance':
    case 'make_whole':
      // Not implemented in v1; callers should show a note
      return 0;

    default:
      return 0;
  }
}

// ─── IRR helpers ──────────────────────────────────────────────────────────────

/**
 * Compound a past LP flow forward to `asOf` at a given annual hurdle rate.
 * Returns how many more dollars LP needs to hit the hurdle.
 *
 * Uses: sum(flow.amount × (1+hurdle)^((asOf-flow.date)/365))
 */
export function lpDollarsToHurdle(
  lpFlows: { date: string; amount: number }[],
  hurdle: number,
  asOf: string,
): number {
  const asOfDate = toDate(asOf);
  const fv = lpFlows.reduce((sum, f) => {
    const flowDate = toDate(f.date);
    const years = (asOfDate.getTime() - flowDate.getTime()) / (365 * 86_400_000);
    return sum + f.amount * Math.pow(1 + hurdle, years);
  }, 0);
  // If fv < 0, LP has not recouped even principal: needs |fv| more dollars.
  return fv < 0 ? Math.abs(fv) : 0;
}

// ─── Promote tier allocation ──────────────────────────────────────────────────

/**
 * Allocate remaining cash (after pref + RoC) across promote tiers.
 *
 * Simple mode: LP gets simpleLpSplit%, GP gets rest.
 * Advanced mode: iterate tiers ascending by hurdleIrr; allocate to LP until
 * hurdle is hit, then use that tier's split for any remaining cash.
 */
export function promoteTiers(
  remaining: number,
  deal: ProfitSplitConfig,
  state: WaterfallState,
  _lpGivenSoFar: number,
): { lpPromote: number; gpPromote: number } {
  if (remaining <= 0) return { lpPromote: 0, gpPromote: 0 };

  const wf = deal.waterfall;

  if (wf.mode === 'simple') {
    const lpPct = (wf.simpleLpSplit ?? 70) / 100;
    return {
      lpPromote: remaining * lpPct,
      gpPromote: remaining * (1 - lpPct),
    };
  }

  // Advanced: tiers
  const tiers = [...(wf.tiers ?? [])].sort((a, b) => {
    // catch-all (undefined hurdle) goes last
    if (a.hurdleIrr == null) return 1;
    if (b.hurdleIrr == null) return -1;
    return a.hurdleIrr - b.hurdleIrr;
  });

  if (tiers.length === 0) {
    return { lpPromote: remaining, gpPromote: 0 };
  }

  let lpTotal = 0;
  let gpTotal = 0;
  let cash    = remaining;

  const now = new Date().toISOString().slice(0, 7); // 'YYYY-MM'

  for (const tier of tiers) {
    if (cash <= 0) break;
    const hurdle = tier.hurdleIrr;
    if (hurdle != null) {
      // Compute how many more LP dollars are needed to hit the hurdle
      const needed = lpDollarsToHurdle(state.lpFlows, hurdle, now);
      if (needed > 0) {
        // LP needs to catch up to the hurdle first — all cash goes to LP
        const lpCatchup = Math.min(cash, needed);
        lpTotal += lpCatchup;
        cash    -= lpCatchup;
      }
    }
    if (cash <= 0) break;
    // Remaining cash splits at this tier's LP/GP ratio
    const lpPct = tier.lpSplit / 100;
    lpTotal += cash * lpPct;
    gpTotal += cash * (1 - lpPct);
    cash = 0;
  }

  // Any residual (shouldn't happen with a catch-all tier) goes to LP
  lpTotal += cash;

  return { lpPromote: lpTotal, gpPromote: gpTotal };
}

// ─── Core distribute() ────────────────────────────────────────────────────────

/**
 * Propose how to split a period's total distributable cash.
 *
 * Allocation order: LP Pref → LP/GP RoC → Promote tiers
 *
 * Test vector: cash=$1,206,028, lpEquity=$4,819,500, accruedPref=$385,560
 * → lpPref=$385,560, lpRoC=$820,468, lpPromote=$0, total=$1,206,028 ✓
 *
 * @param totalCash    Total distributable cash for the period
 * @param lpOwnership  LP ownership fraction (0.9 = 90%)
 * @param deal         ProfitSplitConfig from Section B
 * @param state        Running WaterfallState
 * @returns proposed DistributionResult + updated WaterfallState
 */
export function distribute(
  totalCash: number,
  lpOwnership: number,
  deal: ProfitSplitConfig,
  state: WaterfallState,
): { result: DistributionResult; newState: WaterfallState } {
  const gpOwnership = 1 - lpOwnership;
  let cash = totalCash;

  // 1. LP pref from accrued bucket
  const lpPref = Math.min(cash, state.accruedPrefUnpaid);
  cash -= lpPref;

  // 2. Return of capital (LP and GP pro-rata)
  const lpCapital = state.unreturnedCapital * lpOwnership;
  const gpCapital = state.unreturnedCapital * gpOwnership;

  const lpRoC = Math.min(cash * lpOwnership, lpCapital);
  const gpRoC = Math.min(cash * gpOwnership, gpCapital);
  cash -= (lpRoC + gpRoC);

  // 3. Promote tiers on remaining
  const { lpPromote, gpPromote } = promoteTiers(
    Math.max(0, cash),
    deal,
    state,
    lpPref + lpRoC,
  );

  // Build new state
  const newState: WaterfallState = {
    unreturnedCapital: Math.max(0, state.unreturnedCapital - (lpRoC + gpRoC)),
    accruedPrefUnpaid: Math.max(0, state.accruedPrefUnpaid - lpPref),
    lpFlows: [
      ...state.lpFlows,
      { date: new Date().toISOString().slice(0, 7), amount: lpPref + lpRoC + lpPromote },
    ],
  };

  const result: DistributionResult = {
    lpPref,
    lpRoC,
    lpPromote,
    gpRoC,
    gpPromote,
    proposed: true,
  };

  return { result, newState };
}

// ─── Gross value computation ──────────────────────────────────────────────────

function grossSaleValue(noi: number, sale: SaleConfig): number {
  switch (sale.valuationMethod) {
    case 'cap_rate':
      if (!sale.capRate || sale.capRate === 0) return 0;
      return noi / sale.capRate;
    case 'per_unit':
      return sale.perUnitValue ?? 0;
    case 'gross_multiple':
      return (sale.grossMultiple ?? 0) * noi; // rough — caller passes in total equity value or equiv
    case 'direct':
      return sale.directValue ?? 0;
    default:
      return 0;
  }
}

function sumYearDebtService(
  instruments: DebtInstrument[],
  year: number,
  startDate: string, // 'YYYY-MM'
): number {
  let total = 0;
  for (const inst of instruments) {
    const schedule = buildAmortizationSchedule(inst);
    // year is 1-based; months for year N are periods ((N-1)*12+1)..N*12
    const startPeriod = (year - 1) * 12 + 1;
    const endPeriod   = year * 12;
    total += schedule.rows
      .filter(r => r.period >= startPeriod && r.period <= endPeriod)
      .reduce((s, r) => s + r.payment, 0);
  }
  return total;
}

function endOfYearBalance(instruments: DebtInstrument[], year: number): number {
  let total = 0;
  for (const inst of instruments) {
    const schedule = buildAmortizationSchedule(inst);
    const endPeriod = year * 12;
    const row = schedule.rows.find(r => r.period === endPeriod);
    if (row) {
      total += row.endBalance;
    } else if (year * 12 > inst.termYears * 12) {
      total += 0; // paid off
    } else {
      total += inst.loanAmount; // not yet started
    }
  }
  return total;
}

// ─── computeProjection ────────────────────────────────────────────────────────

/**
 * Run a full hold-period projection.
 *
 * @param deal        ProfitSplitConfig (Section B)
 * @param assumptions ExitScenarioAssumptions from Section D form
 * @param instruments Capital stack instruments (for debt service)
 * @param lpEquity    LP equity invested at close (dollar)
 * @param gpEquity    GP equity invested at close (dollar)
 * @param closingDate 'YYYY-MM' — used as time-zero for LP cash flows
 */
export function computeProjection(
  deal: ProfitSplitConfig,
  assumptions: ExitScenarioAssumptions,
  instruments: DebtInstrument[],
  lpEquity: number,
  gpEquity: number,
  closingDate: string,
): ProjectionResult {
  const { holdYears, beginNoi, noiGrowthPct, reservesPerYear, eventType, eventYear } = assumptions;

  const totalEquity = lpEquity + gpEquity;
  const lpOwnership = totalEquity > 0 ? lpEquity / totalEquity : 0.9;
  const lpPrefRate  = deal.pref.rate ?? 0;

  let waterfallState: WaterfallState = {
    unreturnedCapital: totalEquity,
    accruedPrefUnpaid: 0,
    lpFlows: [{ date: closingDate, amount: -lpEquity }],
  };

  const years: YearProjection[] = [];

  for (let y = 1; y <= holdYears; y++) {
    const noi         = beginNoi * Math.pow(1 + noiGrowthPct, y - 1);
    const debtService = sumYearDebtService(instruments, y, closingDate);
    const loanBalance = endOfYearBalance(instruments, y);
    const cashToInvestors = Math.max(0, noi - debtService - reservesPerYear);

    // Accrue pref for the year
    const annualPrefAccrual = lpEquity * lpPrefRate;
    waterfallState = {
      ...waterfallState,
      accruedPrefUnpaid: waterfallState.accruedPrefUnpaid + annualPrefAccrual,
    };

    let event: CapitalEvent | undefined;

    // ── Capital event in this year ──
    const isEventYear = (eventType !== 'none') && (eventYear === y);
    if (isEventYear) {
      if (eventType === 'SALE' && assumptions.sale) {
        event = buildSaleEvent(y, noi, assumptions.sale, instruments, loanBalance, waterfallState, lpOwnership, deal);
      } else if (eventType === 'REFI' && assumptions.refi) {
        event = buildRefiEvent(y, loanBalance, assumptions.refi);
      }
    }

    // Distribute operating cash
    if (cashToInvestors > 0) {
      const { result, newState } = distribute(cashToInvestors, lpOwnership, deal, waterfallState);
      waterfallState = {
        ...newState,
        lpFlows: [
          ...newState.lpFlows.slice(0, -1), // remove auto-added flow from distribute()
          { date: yearToDate(y, closingDate), amount: result.lpPref + result.lpRoC + result.lpPromote },
        ],
      };
    }

    years.push({ year: y, beginNoi, noi, debtService, cashToInvestors, loanBalance, event });
  }

  // IRR computation on LP flows
  const lpIrr = xirr(waterfallState.lpFlows);

  // LP equity multiple
  const totalLpIn  = Math.abs(waterfallState.lpFlows.filter(f => f.amount < 0).reduce((s, f) => s + f.amount, 0));
  const totalLpOut = waterfallState.lpFlows.filter(f => f.amount > 0).reduce((s, f) => s + f.amount, 0);
  const lpEquityMultiple = totalLpIn > 0 ? totalLpOut / totalLpIn : undefined;

  // LP CoC — avg annual operating distributions / lpEquity
  const operatingDist = years.reduce((s, y) => s + (y.cashToInvestors * lpOwnership), 0);
  const lpCashOnCash  = lpEquity > 0 && holdYears > 0 ? (operatingDist / holdYears) / lpEquity : undefined;

  return { years, lpIrr, lpEquityMultiple, lpCashOnCash };
}

// ─── Event builders ───────────────────────────────────────────────────────────

function buildSaleEvent(
  year: number,
  noi: number,
  sale: SaleConfig,
  instruments: DebtInstrument[],
  loanBalance: number,
  state: WaterfallState,
  lpOwnership: number,
  deal: ProfitSplitConfig,
): CapitalEvent {
  const grossValue   = grossSaleValue(noi, sale);
  const closingCosts = grossValue * (sale.closingCostsPct ?? 0.02);
  const netBeforePayoff = grossValue - closingCosts;

  const loanPayoffs: LoanPayoff[] = instruments.map(inst => ({
    instrumentId: inst.id,
    balance:      loanBalance / instruments.length, // simplified equal split
    penalty:      calcPrepaymentPenalty(inst, (year * 12), loanBalance / instruments.length),
    method:       inst.prepaymentPenaltyType ?? 'none',
  }));

  const totalPayoff   = loanPayoffs.reduce((s, lp) => s + lp.balance + lp.penalty, 0);
  const netProceeds   = Math.max(0, netBeforePayoff - totalPayoff);

  const { result } = distribute(netProceeds, lpOwnership, deal, state);

  return {
    type: 'SALE',
    year,
    grossValue,
    closingCosts,
    loanPayoffs,
    netProceeds,
    proposedDistribution: result,
  };
}

function buildRefiEvent(
  year: number,
  existingBalance: number,
  refi: RefiConfig,
): CapitalEvent {
  // Simplified: just size the new loan and compute cash-out
  const newLoanAmount = sizeLoan(refi.sizingMethod, refi.target, {
    value: existingBalance * 1.1, // rough stub without NOI passed through
  });
  const netProceeds = Math.max(0, newLoanAmount - existingBalance);

  return {
    type: 'REFI',
    year,
    grossValue: newLoanAmount,
    closingCosts: 0,
    loanPayoffs: [{
      instrumentId: 'existing',
      balance: existingBalance,
      penalty: 0,
      method: 'none',
    }],
    netProceeds,
    proposedDistribution: undefined,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function yearToDate(year: number, closingDate: string): string {
  const [yStr, mStr] = closingDate.split('-');
  const baseYear  = parseInt(yStr, 10);
  const baseMonth = parseInt(mStr, 10);
  const targetYear  = baseYear + year - 1;
  return `${targetYear}-${String(baseMonth).padStart(2, '0')}`;
}
