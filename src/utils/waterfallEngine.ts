/**
 * waterfallEngine.ts — Institutional CRE waterfall distribution engine.
 *
 * No store reads. All functions are pure and deterministic given their inputs.
 *
 * Propose-not-dictate: distribute() returns WaterfallDistribution with proposed: true.
 * GP must accept or override before values are committed to accounting entries.
 *
 * Build order:
 *   Steps 1-5:  Sale path (remainingPrincipal → net proceeds → distribute)
 *   Steps R1-R4: Refi path (MIN_OF sizing → cashout → allowPromote flag → loan swap)
 *   Institutional: pref modes, GP catch-up, clawback
 */

import type {
  ProfitSplitConfig,
  WaterfallState,      // kept for legacy type refs
  DistributionResult,  // kept for legacy type refs
  DebtInstrument,
  PrepaymentPenaltyType,
  ExitScenarioAssumptions,
  YearProjection,
  ProjectionResult,
  CapitalEvent,
  LoanPayoff,
  SaleConfig,
  RefiConfig,
  DealWaterfallConfig,
  DealWaterfallState,
  WaterfallDistribution,
  CapitalAccount,
  EngineWaterfallTier,
} from '../state/economicsTypes';
import { buildAmortizationSchedule } from './amortization';

// Suppress unused-import lint for kept legacy types
void (undefined as unknown as WaterfallState);
void (undefined as unknown as DistributionResult);

// ─── XIRR ────────────────────────────────────────────────────────────────────

/**
 * Newton-Raphson XIRR. Each flow has a date string 'YYYY-MM' and a dollar amount.
 * Negative = outflow (equity in), Positive = inflow (cash back).
 * Returns undefined if no sign change in NPV (can't converge).
 */
export function xirr(flows: { date: string; amount: number }[]): number | undefined {
  if (flows.length < 2) return undefined;

  const hasPositive = flows.some(f => f.amount > 0);
  const hasNegative = flows.some(f => f.amount < 0);
  if (!hasPositive || !hasNegative) return undefined;

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

  let rate = 0.1;
  for (let i = 0; i < 100; i++) {
    const n = npv(rate);
    const d = dnpv(rate);
    if (Math.abs(d) < 1e-14) break;
    const next = rate - n / d;
    if (Math.abs(next - rate) < 1e-7) return next;
    rate = next;
    if (rate < -0.9999) return undefined;
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
 * min_of     → compute each constraint with its specific target, return the minimum
 *              (uses ltvTarget, dyTarget, dscrTarget from params; falls back to `target`)
 */
export function sizeLoan(
  method: 'ltv' | 'dscr' | 'debt_yield' | 'min_of',
  target: number,
  params: {
    value?: number;
    noi?: number;
    rate?: number;
    amortMonths?: number;
    isInterestOnly?: boolean;
    // For min_of: per-constraint targets (optional; falls back to `target`)
    ltvTarget?: number;
    dyTarget?: number;
    dscrTarget?: number;
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

    case 'min_of': {
      const sizes: number[] = [];
      // LTV constraint
      if (params.value != null) {
        const ltvT = params.ltvTarget ?? target;
        if (ltvT > 0) sizes.push(ltvT * params.value);
      }
      // Debt yield constraint
      if (params.noi != null) {
        const dyT = params.dyTarget ?? target;
        if (dyT > 0) sizes.push(params.noi / dyT);
      }
      // DSCR constraint
      if (params.noi != null && params.rate != null && params.amortMonths != null) {
        const dscrT = params.dscrTarget ?? target;
        if (dscrT > 0) {
          const dc = annualDebtConstant(params.rate, params.amortMonths);
          if (dc > 0) sizes.push((params.noi / dscrT) / dc);
        }
      }
      return sizes.length > 0 ? Math.min(...sizes) : 0;
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
      const coupon   = instrument.fixedRate ?? 0;
      const treasury = marketRate ?? (coupon * 0.8);
      const spread   = Math.max(0, coupon - treasury);
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
      // V1: defeasance is out of scope — approximate with yield-maintenance PV calc.
      // TODO-UI: flag as approximation in instrument card when defeasance is selected.
      // Fall through intentional.
    case 'make_whole': {
      // Approximate make_whole / defeasance with YM (PV of remaining scheduled interest).
      const coupon2   = instrument.fixedRate ?? 0;
      const treasury2 = marketRate ?? (coupon2 * 0.8);
      const spread2   = Math.max(0, coupon2 - treasury2);
      const termMonths2 = (instrument.termYears ?? 0) * 12;
      const remaining2  = Math.max(0, termMonths2 - payoffMonth);
      if (remaining2 === 0) return balance * 0.01;
      const r2 = treasury2 / 12;
      let pv2 = 0;
      for (let m = 1; m <= remaining2; m++) {
        pv2 += (balance * spread2 / 12) / Math.pow(1 + r2, m);
      }
      return Math.max(pv2, balance * 0.01);
    }

    default:
      return 0;
  }
}

// ─── Step 1: Remaining principal ──────────────────────────────────────────────

/**
 * Compute outstanding principal balance at a given month (1-based) by reading
 * the instrument's amortization schedule. More accurate than simple linear
 * interpolation — handles IO periods, balloons, construction draws.
 *
 * @param instrument  The debt instrument
 * @param eventMonth  1-based month since loan origination (e.g. year 5 = month 60)
 */
export function remainingPrincipal(
  instrument: DebtInstrument,
  eventMonth: number,
): number {
  const schedule = buildAmortizationSchedule(instrument);
  if (schedule.rows.length === 0) return instrument.loanAmount ?? 0;

  const row = schedule.rows.find(r => r.period === eventMonth);
  if (row) return row.endBalance;

  const lastRow = schedule.rows[schedule.rows.length - 1];
  if (eventMonth > lastRow.period) return 0; // beyond term: paid off
  return instrument.loanAmount ?? 0;         // before first period
}

// ─── IRR helpers ──────────────────────────────────────────────────────────────

/**
 * Compound a past LP flow forward to `asOf` at a given annual hurdle rate.
 * Returns how many more dollars LP needs to hit the hurdle.
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
  return fv < 0 ? Math.abs(fv) : 0;
}

// ─── accruePref ───────────────────────────────────────────────────────────────

/**
 * Accrue LP preferred return for a time period and return updated state.
 *
 * SIMPLE  — pref accrues on LP unreturned capital only
 * COMPOUND — pref accrues on capital + outstanding unpaid pref (compounding)
 * ACCRUAL  — same as SIMPLE (cash-basis difference handled at payment time)
 *
 * @param config  DealWaterfallConfig with prefRate and prefType
 * @param state   Current DealWaterfallState
 * @param years   Fraction of a year (1.0 = annual, 0.25 = quarterly)
 */
export function accruePref(
  config: Pick<DealWaterfallConfig, 'prefRate' | 'prefType'>,
  state: DealWaterfallState,
  years: number,
): DealWaterfallState {
  const { prefRate, prefType } = config;
  if (prefRate <= 0) return state;

  let lpAccrual: number;
  switch (prefType) {
    case 'COMPOUND':
      // Compounds on outstanding pref balance too
      lpAccrual = (state.lp.unreturnedCapital + state.lp.accruedPrefUnpaid) * prefRate * years;
      break;
    case 'SIMPLE':
    case 'ACCRUAL':
    default:
      // Simple: pref on unreturned capital only
      lpAccrual = state.lp.unreturnedCapital * prefRate * years;
  }

  return {
    ...state,
    lp: {
      ...state.lp,
      accruedPrefUnpaid: state.lp.accruedPrefUnpaid + lpAccrual,
    },
  };
}

// ─── buildDealWaterfallConfig ─────────────────────────────────────────────────

/**
 * Convert a ProfitSplitConfig (from Section B UI) + ownership fraction into
 * a DealWaterfallConfig that the engine consumes.
 *
 * Defaults: promoteOnRefi=false, clawback=true, hurdleBasis='IRR', prefType='SIMPLE'
 */
export function buildDealWaterfallConfig(
  profitSplit: ProfitSplitConfig,
  lpOwnership: number,
): DealWaterfallConfig {
  const { pref, waterfall } = profitSplit;
  const gpOwnership = 1 - lpOwnership;

  const tiers: EngineWaterfallTier[] = [];
  if (waterfall.mode === 'simple') {
    const lpPct = waterfall.simpleLpSplit ?? 70;
    tiers.push({ lpSplit: lpPct, gpSplit: 100 - lpPct });
  } else if (waterfall.tiers && waterfall.tiers.length > 0) {
    for (const t of waterfall.tiers) {
      tiers.push({
        irrHurdle: t.hurdleIrr,
        lpSplit:   t.lpSplit,
        gpSplit:   t.gpSplit,
      });
    }
  } else {
    tiers.push({ lpSplit: 70, gpSplit: 30 });
  }

  return {
    lpOwnership,
    gpOwnership,
    prefRate:   pref.rate ?? 0,
    prefType:   pref.accrualCompounds ? 'COMPOUND' : 'SIMPLE',
    tiers,
    hurdleBasis:      waterfall.hurdleBasis ?? 'IRR',
    gpCatchup:        waterfall.gpCatchup,
    promoteOnRefi:    waterfall.promoteOnRefi ?? false,
    clawback:         waterfall.hasClawback ?? true, // spec default: on (dormant unless promoteOnRefi=true)
    distributeResidual: true,
  };
}

// ─── Internal: promote tier allocation ───────────────────────────────────────

/**
 * Distribute remaining promote cash through IRR/EM waterfall tiers using the
 * A.CRE bucket approach (TYPE A):
 *   - For each tier with a hurdle: compute a "bucket" (total pool at the tier's
 *     LP/GP split) that gives LP exactly `needed` LP dollars to clear the hurdle.
 *   - If cash >= bucket: fill the bucket, continue to the next tier.
 *   - If cash < bucket: split all remaining at the tier's ratio and stop.
 *   - Catch-all tier (no hurdle): split all remaining and stop.
 *
 * @param lpAlreadyReceived  LP dollars already allocated in this distribute() call
 *                           (pref + RoC + catch-up) so the hurdle calculation is
 *                           accurate when promote tiers are reached.
 */
function allocatePromoteTiers(
  remaining: number,
  config: DealWaterfallConfig,
  state: DealWaterfallState,
  date: string,
  lpAlreadyReceived: number = 0,
): { lp: number; gp: number } {
  if (remaining <= 0 || config.tiers.length === 0) {
    return { lp: remaining, gp: 0 };
  }

  const sorted = [...config.tiers].sort((a, b) => {
    if (a.irrHurdle == null) return 1;
    if (b.irrHurdle == null) return -1;
    return a.irrHurdle - b.irrHurdle;
  });

  let lpTotal = 0;
  let gpTotal = 0;
  let cash    = remaining;

  // Running total of LP amounts already allocated in promote tiers this call.
  // Added to lpAlreadyReceived so each successive tier's hurdle check reflects
  // what LP has actually received so far (pref + RoC + prior promote tiers).
  let lpReceivedInPromote = 0;

  for (const tier of sorted) {
    if (cash <= 0) break;

    const lpPct = tier.lpSplit / 100;

    if (tier.irrHurdle != null) {
      // Build augmented flows: historical flows + everything LP has received
      // in the current distribute() call so far (pref, RoC, lower promote tiers).
      const totalLpThisCall = lpAlreadyReceived + lpReceivedInPromote;
      const augmented: { date: string; amount: number }[] =
        totalLpThisCall > 0
          ? [...state.lp.flows, { date, amount: totalLpThisCall }]
          : state.lp.flows;

      let needed = 0;
      if (config.hurdleBasis === 'EQUITY_MULTIPLE') {
        const totalIn  = augmented.filter(f => f.amount < 0).reduce((s, f) => s + Math.abs(f.amount), 0);
        const totalOut = augmented.filter(f => f.amount > 0).reduce((s, f) => s + f.amount, 0);
        needed = Math.max(0, totalIn * tier.irrHurdle - totalOut);
      } else {
        needed = lpDollarsToHurdle(augmented, tier.irrHurdle, date);
      }

      if (needed <= 0) {
        // LP already cleared this hurdle from prior distributions — skip without consuming cash.
        continue;
      }

      if (lpPct <= 0) continue; // degenerate; avoid division by zero

      // Bucket approach: total pool at this tier's split that yields LP exactly `needed`.
      const bucketSize = needed / lpPct;

      if (bucketSize >= cash) {
        // Can't fully fill this tier's bucket — split all remaining at the tier ratio.
        lpTotal             += cash * lpPct;
        gpTotal             += cash * (1 - lpPct);
        lpReceivedInPromote += cash * lpPct;
        cash = 0;
        break;
      } else {
        // Fill the bucket, carry remaining cash forward to the next tier.
        lpTotal             += needed;                    // = bucketSize * lpPct
        gpTotal             += bucketSize * (1 - lpPct);
        lpReceivedInPromote += needed;
        cash                -= bucketSize;
      }
    } else {
      // Catch-all tier (no hurdle): split all remaining cash and stop.
      lpTotal             += cash * lpPct;
      gpTotal             += cash * (1 - lpPct);
      lpReceivedInPromote += cash * lpPct;
      cash = 0;
      break;
    }
  }

  lpTotal += cash; // residual: no catch-all tier defined → LP gets the rest
  return { lp: lpTotal, gp: gpTotal };
}

// ─── Internal: GP catch-up ────────────────────────────────────────────────────

function applyGpCatchup(
  remaining: number,
  config: DealWaterfallConfig,
  state: DealWaterfallState,
): { lpCatchup: number; gpCatchup: number; remaining: number } {
  if (!config.gpCatchup || remaining <= 0) {
    return { lpCatchup: 0, gpCatchup: 0, remaining };
  }
  const { targetPct, gpShare } = config.gpCatchup;

  // GP catch-up: GP gets gpShare% of cash until GP's cumulative promote
  // equals targetPct% of total promote distributed so far
  // Simplified v1: allocate gpShare% of remaining to GP as catch-up
  const gpCatchupAmt = remaining * (gpShare / 100);
  const lpCatchupAmt = remaining - gpCatchupAmt;

  return {
    lpCatchup: lpCatchupAmt,
    gpCatchup: gpCatchupAmt,
    remaining: 0,
  };
}

// ─── Core distribute() ────────────────────────────────────────────────────────

/**
 * Propose how to split distributable cash using the institutional waterfall:
 *   1. LP pref from accrued bucket
 *   2. LP + GP return of capital (pro-rata by ownership)
 *   3. If allowPromote: optional GP catch-up → promote tiers
 *
 * Test vector A: cash=$1,206,028, LP equity=$4,819,500 (90%), GP=$535,500 (10%),
 *                accruedPref=$385,560
 *   → lpPref=$385,560, lpRoC=$738,421, gpRoC=$82,047, promote=$0 ✓
 *
 * @param cash         Total distributable cash for the period
 * @param config       DealWaterfallConfig (built via buildDealWaterfallConfig)
 * @param state        Current DealWaterfallState (per-partner capital accounts)
 * @param opts.allowPromote  true = distribute to promote tiers; false = RoC only (refi lookback)
 * @param opts.date          'YYYY-MM' for IRR calculations; defaults to current month
 */
export function distribute(
  cash: number,
  config: DealWaterfallConfig,
  state: DealWaterfallState,
  opts: { allowPromote?: boolean; date?: string } = {},
): { result: WaterfallDistribution; newState: DealWaterfallState } {
  const { lpOwnership, gpOwnership } = config;
  const allowPromote = opts.allowPromote !== false; // default true
  const date = opts.date ?? new Date().toISOString().slice(0, 7);

  let remaining = Math.max(0, cash);

  // Step 1: LP pref from accrued bucket
  const lpPref = Math.min(remaining, state.lp.accruedPrefUnpaid);
  remaining -= lpPref;

  // Step 2: Return of capital — pool total unreturned capital then split pro-rata (per spec §2)
  // totalUnreturned - roc <= 1e-6 is the canonical promote gate check (capital fully returned)
  const totalUnreturned = state.lp.unreturnedCapital + state.gp.unreturnedCapital;
  const roc   = Math.min(remaining, totalUnreturned);
  const lpRoC = roc * lpOwnership;
  const gpRoC = roc * gpOwnership;
  remaining   -= roc;

  // Step 3: Promote (if allowed) — only fires once ALL capital is fully returned
  let lpCatchup = 0;
  let gpCatchup = 0;
  let lpPromote = 0;
  let gpPromote = 0;

  if (allowPromote && totalUnreturned - roc <= 1e-6 && remaining > 0) {
    // Optional GP catch-up
    if (config.gpCatchup && remaining > 0) {
      const cu = applyGpCatchup(remaining, config, state);
      lpCatchup = cu.lpCatchup;
      gpCatchup = cu.gpCatchup;
      remaining = cu.remaining;
    }

    // Promote tiers — pass LP's pref + RoC + catchup from this call so hurdles are accurate.
    if (remaining > 0) {
      // Pass lpPref + lpRoC + lpCatchup so tiers see LP's true cumulative return for this call.
      const { lp, gp } = allocatePromoteTiers(remaining, config, state, date, lpPref + lpRoC + lpCatchup);
      lpPromote = lp;
      gpPromote = gp;
      remaining = 0;
    }
  }

  const retained = remaining; // > 0 only if !distributeResidual (currently always 0)

  const newState: DealWaterfallState = {
    lp: {
      ...state.lp,
      unreturnedCapital: Math.max(0, state.lp.unreturnedCapital - lpRoC),
      accruedPrefUnpaid: Math.max(0, state.lp.accruedPrefUnpaid - lpPref),
      flows: [
        ...state.lp.flows,
        { date, amount: lpPref + lpRoC + lpCatchup + lpPromote },
      ],
    },
    gp: {
      ...state.gp,
      unreturnedCapital: Math.max(0, state.gp.unreturnedCapital - gpRoC),
      flows: [
        ...state.gp.flows,
        { date, amount: gpRoC + gpCatchup + gpPromote },
      ],
    },
    cumulativeGpPromote: state.cumulativeGpPromote + gpCatchup + gpPromote,
  };

  const result: WaterfallDistribution = {
    lpPref, gpPref: 0, lpRoC, gpRoC,
    lpCatchup, gpCatchup, lpPromote, gpPromote,
    retained, proposed: true,
  };

  // ── V1 SCOPE BOUNDARIES (flag, don't build) ──────────────────────────────
  // Multiple LP classes / tranches: DealWaterfallConfig currently has one LP
  //   ownership fraction. To support tranches, replace lpOwnership/lp with an
  //   array of CapitalAccount keyed by class ID, each with its own pref rate
  //   and promote tier schedule. `distribute()` would iterate the class array.
  //
  // K-1 tax allocations: plug in after result is built; take lpPref/lpRoC/
  //   lpPromote and split them into ordinary income vs. capital-gain buckets
  //   per the operating agreement's § 704(c) allocation schedule.
  //
  // Capital-call shortfalls: plug in at DealWaterfallState.lp.unreturnedCapital;
  //   if LP fails to fund a call, reduce their ownership fraction for that period
  //   (dilution or default waterfall per the OA) before calling distribute().
  //
  // Distribution withholding: plug in after result is built; multiply LP amounts
  //   by (1 − withholdingRate) before recording flows, and record the withheld
  //   amount separately as a tax liability on the LP's capital account.
  // ─────────────────────────────────────────────────────────────────────────

  return { result, newState };
}

// ─── computeClawback ─────────────────────────────────────────────────────────

/**
 * At terminal sale, compute how much GP must return if they over-collected promote.
 * Only relevant when config.clawback=true and config.promoteOnRefi=true.
 *
 * V1 logic: if LP's total XIRR across the full hold is below the lowest hurdle,
 * all GP promote received (cumulativeGpPromote) must be returned.
 */
export function computeClawback(
  config: DealWaterfallConfig,
  state: DealWaterfallState,
): number {
  if (!config.clawback || state.cumulativeGpPromote === 0) return 0;

  const lpIrr = xirr(state.lp.flows);
  const minHurdle = config.tiers.find(t => t.irrHurdle != null)?.irrHurdle ?? config.prefRate;

  if (lpIrr == null || lpIrr < minHurdle) {
    // LP did not hit hurdle — all GP promote is subject to clawback
    return state.cumulativeGpPromote;
  }

  return 0;
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
      return (sale.grossMultiple ?? 0) * noi;
    case 'direct':
      return sale.directValue ?? 0;
    default:
      return 0;
  }
}

// ─── Year debt service ────────────────────────────────────────────────────────

function sumYearDebtService(
  instruments: DebtInstrument[],
  year: number,
  closingDate: string,
): number {
  // Fiscal year window: month 1 of year y is closingDate + (y-1)*12 + 1,
  // last month is closingDate + y*12. This gives exactly 12 months per year.
  // e.g. year=1, closingDate='2026-06' → '2026-07' through '2027-06' (Jul–Jun)
  const yearStart = addMonthsStr(closingDate, (year - 1) * 12 + 1);
  const yearEnd   = addMonthsStr(closingDate, year * 12);
  let total = 0;
  for (const inst of instruments) {
    const schedule = buildAmortizationSchedule(inst);
    total += schedule.rows
      .filter(r => r.date >= yearStart && r.date <= yearEnd)
      .reduce((s, r) => s + r.payment, 0);
  }
  return total;
}

// ─── computeProjection ────────────────────────────────────────────────────────

/**
 * Run a full hold-period projection using the institutional waterfall engine.
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
  /** Annual recurring fee deduction from NCF (e.g. asset management fee). Default 0. */
  annualFeeDeduction: number = 0,
): ProjectionResult {
  const { holdYears, beginNoi, noiGrowthPct, reservesPerYear, eventType, eventYear } = assumptions;

  // Per-year NOI growth helper: uses noiGrowthRates array when provided, else flat rate.
  function noiForYear(y: number): number {
    if (assumptions.noiGrowthRates && assumptions.noiGrowthRates.length > 0) {
      let n = beginNoi;
      for (let i = 0; i < y - 1; i++) {
        n *= 1 + (assumptions.noiGrowthRates[i] ?? noiGrowthPct);
      }
      return n;
    }
    return beginNoi * Math.pow(1 + noiGrowthPct, y - 1);
  }

  const totalEquity = lpEquity + gpEquity;
  const lpOwnership = totalEquity > 0 ? lpEquity / totalEquity : 0.9;

  const config = buildDealWaterfallConfig(deal, lpOwnership);

  let state: DealWaterfallState = {
    lp: {
      unreturnedCapital: lpEquity,
      accruedPrefUnpaid: 0,
      flows: [{ date: closingDate, amount: -lpEquity }],
    },
    gp: {
      unreturnedCapital: gpEquity,
      accruedPrefUnpaid: 0,
      flows: [{ date: closingDate, amount: -gpEquity }],
    },
    cumulativeGpPromote: 0,
  };

  const years: YearProjection[] = [];
  let activeInstruments = [...instruments];
  // Track LP's actual operating distributions (non-event years only) for lpCashOnCash.
  // Using actual waterfall output is more accurate than proportional (cashToInvestors * lpPct)
  // because LP receives pref first, not a flat ownership-weighted share.
  let lpOperatingDistTotal = 0;

  for (let y = 1; y <= holdYears; y++) {
    const noi         = noiForYear(y);
    const yearDate    = yearToDate(y, closingDate);
    const debtService = sumYearDebtService(activeInstruments, y, closingDate);
    // Loan balance: use instrument-relative months so refi'd loans read correctly
    const loanBalance = activeInstruments.reduce((sum, inst) => {
      const m = instrumentMonths(inst.startDate, yearDate);
      return sum + remainingPrincipal(inst, m);
    }, 0);
    const cashToInvestors = Math.max(0, noi - debtService - reservesPerYear - annualFeeDeduction);

    // A.CRE model: pref is NOT accrued separately — it is embedded in the Tier 1 IRR hurdle.
    // accruePref() is intentionally NOT called here.  All operating cash flows directly through
    // the IRR-based tier walk (allowPromote=true below).  In the first years, capital is not
    // yet fully returned so promote is 0 and the 90/10 RoC split matches A.CRE's Tier 1 flow.
    // Once capital is returned, the IRR tiers fire and LP/GP share shifts per each hurdle.

    let event: CapitalEvent | undefined;
    let saleDoneThisYear = false;
    let lpDistribution = 0;
    let gpDistribution = 0;
    let yearDistribution: WaterfallDistribution | undefined;

    const isEventYear = eventType !== 'none' && eventYear === y;

    if (isEventYear) {
      if (eventType === 'SALE' && assumptions.sale) {
        // Step 3: combine operating NCF + sale proceeds in ONE distribute() call
        const built = buildSaleEvent(y, noi, assumptions.sale, activeInstruments, yearDate);
        const totalCash = cashToInvestors + built.netProceeds;
        const { result, newState: ns } = distribute(totalCash, config, state, {
          allowPromote: true,
          date: yearDate,
        });
        state = ns;
        // Clawback true-up: if GP collected promote at a prior refi (promoteOnRefi=true) and
        // LP's full-hold IRR is still below the hurdle, GP must return the over-collected promote.
        // Dormant (returns 0) when promoteOnRefi=false (institutional default).
        const clawbackAmt = computeClawback(config, state);
        const finalResult = clawbackAmt > 0
          ? { ...result, gpPromote: result.gpPromote - clawbackAmt, lpRoC: result.lpRoC + clawbackAmt, gpClawback: clawbackAmt }
          : result;
        event = { ...built.event, proposedDistribution: finalResult } as CapitalEvent;
        lpDistribution = finalResult.lpPref + finalResult.lpRoC + finalResult.lpCatchup + finalResult.lpPromote;
        gpDistribution = finalResult.gpRoC + finalResult.gpCatchup + finalResult.gpPromote;
        yearDistribution = finalResult;
        saleDoneThisYear = true;

      } else if (eventType === 'REFI' && assumptions.refi) {
        // Refi: distributes its own cashOut (with promote deferred by default)
        const built = buildRefiEvent(y, noi, assumptions.refi, activeInstruments, state, config, yearDate);
        event             = built.event;
        state             = built.newState;
        activeInstruments = built.newInstruments; // R4: old loan retired, new loan active
        if (event.proposedDistribution) {
          const d = event.proposedDistribution;
          lpDistribution = d.lpPref + d.lpRoC + d.lpCatchup + d.lpPromote;
          gpDistribution = d.gpRoC + d.gpCatchup + d.gpPromote;
          yearDistribution = d;
        }
      }
    }

    // saleAfterRefi: if the primary event was a REFI and this year is the follow-on sale year
    if (!saleDoneThisYear && eventType === 'REFI' && assumptions.saleAfterRefi) {
      const { saleYear, sale } = assumptions.saleAfterRefi;
      if (y === saleYear) {
        const built = buildSaleEvent(y, noi, sale, activeInstruments, yearDate);
        const totalCash = cashToInvestors + built.netProceeds;
        const { result, newState: ns } = distribute(totalCash, config, state, {
          allowPromote: true,
          date: yearDate,
        });
        state = ns;
        // Terminal-sale clawback true-up (same as direct SALE path above)
        const clawbackAmt = computeClawback(config, state);
        const finalResult = clawbackAmt > 0
          ? { ...result, gpPromote: result.gpPromote - clawbackAmt, lpRoC: result.lpRoC + clawbackAmt, gpClawback: clawbackAmt }
          : result;
        event = { ...built.event, proposedDistribution: finalResult } as CapitalEvent;
        lpDistribution = finalResult.lpPref + finalResult.lpRoC + finalResult.lpCatchup + finalResult.lpPromote;
        gpDistribution = finalResult.gpRoC + finalResult.gpCatchup + finalResult.gpPromote;
        yearDistribution = finalResult;
        saleDoneThisYear = true;
      }
    }

    // Distribute operating cash for non-event years.
    // A.CRE fires ALL waterfall tiers every year (allowPromote: true).
    // In early years capital is not yet returned so promote=0 and the 90/10 RoC step
    // exactly matches A.CRE's Tier 1 distributions.  Once capital is returned (typically
    // Year 2 in the mock deal), the IRR tiers fire on all excess cash.
    if (!saleDoneThisYear && cashToInvestors > 0) {
      const { result: opResult, newState } = distribute(cashToInvestors, config, state, {
        allowPromote: true, // A.CRE: all tiers fire every year
        date: yearDate,
      });
      const lpOp = opResult.lpPref + opResult.lpRoC + opResult.lpCatchup + opResult.lpPromote;
      const gpOp = opResult.gpRoC + opResult.gpCatchup + opResult.gpPromote;
      // Accumulate LP's actual waterfall share (pref + RoC) for lpCashOnCash denominator
      lpOperatingDistTotal += lpOp;
      lpDistribution = lpOp;
      gpDistribution = gpOp;
      yearDistribution = opResult;
      state = newState;
    }

    years.push({ year: y, beginNoi, noi, debtService, cashToInvestors, loanBalance, event, lpDistribution, gpDistribution, distribution: yearDistribution });
  }

  const lpIrr = xirr(state.lp.flows);
  const gpIrr = xirr(state.gp.flows);

  const totalLpIn  = Math.abs(state.lp.flows.filter(f => f.amount < 0).reduce((s, f) => s + f.amount, 0));
  const totalLpOut = state.lp.flows.filter(f => f.amount > 0).reduce((s, f) => s + f.amount, 0);
  const lpEquityMultiple = totalLpIn > 0 ? totalLpOut / totalLpIn : undefined;

  const totalGpIn  = Math.abs(state.gp.flows.filter(f => f.amount < 0).reduce((s, f) => s + f.amount, 0));
  const totalGpOut = state.gp.flows.filter(f => f.amount > 0).reduce((s, f) => s + f.amount, 0);
  const gpEquityMultiple = totalGpIn > 0 ? totalGpOut / totalGpIn : undefined;

  // Cash-on-cash: average annual LP operating distribution (excl. terminal event) / LP equity.
  // Uses actual waterfall output so pref gets properly credited before proportional RoC.
  const lpCashOnCash = lpEquity > 0 && holdYears > 0
    ? (lpOperatingDistTotal / holdYears) / lpEquity
    : undefined;

  return { years, lpIrr, gpIrr, lpEquityMultiple, gpEquityMultiple, lpCashOnCash };
}

// ─── Event builders ───────────────────────────────────────────────────────────

/**
 * Compute sale event economics WITHOUT calling distribute().
 * Caller must combine netProceeds with operating NCF and call distribute() once.
 * This ensures Step 3: cash = operatingNCF + netProceeds in ONE distribute() call.
 */
function buildSaleEvent(
  year: number,
  noi: number,
  sale: SaleConfig,
  instruments: DebtInstrument[],
  date: string,
): { event: Omit<CapitalEvent, 'proposedDistribution'>; netProceeds: number } {
  const grossValue   = grossSaleValue(noi, sale);
  const closingCosts = grossValue * (sale.closingCostsPct ?? 0.02);
  const netBeforePayoff = grossValue - closingCosts;

  // Step 1: use instrumentMonths for accurate balloon (handles refi'd loans)
  const loanPayoffs: LoanPayoff[] = instruments.map(inst => {
    const m = instrumentMonths(inst.startDate, date);
    const balance = remainingPrincipal(inst, m);
    const penalty = calcPrepaymentPenalty(inst, m, balance);
    return {
      instrumentId: inst.id,
      balance,
      penalty,
      method: inst.prepaymentPenaltyType ?? 'none',
    };
  });

  const totalPayoff = loanPayoffs.reduce((s, lp) => s + lp.balance + lp.penalty, 0);
  const netProceeds = Math.max(0, netBeforePayoff - totalPayoff);

  // Caller handles distribute() with combined cash
  return {
    event: {
      type: 'SALE',
      year,
      grossValue,
      closingCosts,
      loanPayoffs,
      netProceeds,
    },
    netProceeds,
  };
}

function buildRefiEvent(
  year: number,
  noi: number,
  refi: RefiConfig,
  instruments: DebtInstrument[],
  state: DealWaterfallState,
  config: DealWaterfallConfig,
  date: string,
): { event: CapitalEvent; newState: DealWaterfallState; newInstruments: DebtInstrument[] } {
  // Step R1: compute remaining principal using instrument-relative months (handles prior refis)
  const loanPayoffs: LoanPayoff[] = instruments.map(inst => {
    const m = instrumentMonths(inst.startDate, date);
    const balance = remainingPrincipal(inst, m);
    const penalty = calcPrepaymentPenalty(inst, m, balance);
    return {
      instrumentId: inst.id,
      balance,
      penalty,
      method: inst.prepaymentPenaltyType ?? 'none',
    };
  });

  const existingBalance = loanPayoffs.reduce((s, lp) => s + lp.balance, 0);
  const prepayTotal     = loanPayoffs.reduce((s, lp) => s + lp.penalty, 0);

  // Step R2: size new loan (MIN_OF by default, supports per-constraint targets)
  const sizeParams = {
    noi,
    value:          refi.propertyValue,
    rate:           refi.newRate,
    amortMonths:    refi.newAmortYears * 12,
    isInterestOnly: refi.isInterestOnly,
    ltvTarget:      refi.ltvTarget,
    dyTarget:       refi.dyTarget,
    dscrTarget:     refi.dscrTarget,
  };
  const newLoanAmount = sizeLoan(refi.sizingMethod, refi.target, sizeParams);

  // R1: track which constraint bound the MIN_OF result (for UI display)
  let refiBinding: 'ltv' | 'dscr' | 'debt_yield' | undefined;
  if (refi.sizingMethod === 'min_of') {
    const ltvT  = refi.ltvTarget  ?? refi.target;
    const dyT   = refi.dyTarget   ?? refi.target;
    const dscrT = refi.dscrTarget ?? refi.target;
    const ltvAmt  = (refi.propertyValue != null && ltvT  > 0) ? ltvT * refi.propertyValue : Infinity;
    const dyAmt   = dyT  > 0 ? noi / dyT : Infinity;
    const dscrAmt = (() => {
      if (dscrT <= 0) return Infinity;
      const dc = annualDebtConstant(refi.newRate, refi.newAmortYears * 12);
      return dc > 0 ? (noi / dscrT) / dc : Infinity;
    })();
    const minAmt = Math.min(ltvAmt, dyAmt, dscrAmt);
    if (isFinite(minAmt)) {
      if (minAmt === ltvAmt)  refiBinding = 'ltv';
      else if (minAmt === dyAmt)  refiBinding = 'debt_yield';
      else if (minAmt === dscrAmt) refiBinding = 'dscr';
    }
  }

  // R2: cashOut = newLoan − oldPayoff − prepayPenalty − refiCosts
  const refiCosts = newLoanAmount * (refi.refiCostPct ?? 0.01);
  const cashOut   = Math.max(0, newLoanAmount - existingBalance - prepayTotal - refiCosts);

  // Step R3: distribute cash-out; promote deferred by default (promoteOnRefi=false)
  let newState = state;
  let proposedDistribution: WaterfallDistribution | undefined;

  if (refi.cashOutDistribute && cashOut > 0) {
    const { result, newState: ns } = distribute(cashOut, config, state, {
      allowPromote: config.promoteOnRefi, // institutional lookback: false by default
      date,
    });
    newState = ns;
    proposedDistribution = result;
  }

  // Step R4: loan swap — retire old instruments, activate new loan
  // New loan starts at the refi date so its amort schedule aligns to calendar dates.
  const newInstrument: DebtInstrument = {
    id:                 `__refi_y${year}__`,
    position:           'senior',
    loanType:           refi.isInterestOnly ? 'io' : 'fixed',
    loanAmount:         newLoanAmount,
    startDate:          date,                         // 'YYYY-MM' of the refi closing
    termYears:          refi.newTermYears,
    amortizationYears:  refi.isInterestOnly ? undefined : refi.newAmortYears,
    fixedRate:          refi.newRate,
    dayCountConvention: 'thirty_360',
  };

  return {
    event: {
      type: 'REFI',
      year,
      grossValue: newLoanAmount,
      closingCosts: refiCosts,
      loanPayoffs,
      netProceeds: cashOut,
      proposedDistribution,
      refiBinding,
    },
    newState,
    newInstruments: [newInstrument], // old instruments retired, new loan active
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function yearToDate(year: number, closingDate: string): string {
  // Returns the YEAR-END date (closing + year*12 months).
  // e.g. yearToDate(1, '2026-06') → '2027-06', yearToDate(5, '2026-06') → '2031-06'
  return addMonthsStr(closingDate, year * 12);
}

/** Add n months to a 'YYYY-MM' string. */
function addMonthsStr(yyyyMm: string, n: number): string {
  const y = parseInt(yyyyMm.slice(0, 4), 10);
  const m = parseInt(yyyyMm.slice(5, 7), 10) - 1 + n; // 0-based month
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Months elapsed from loan's startDate to a deal event date.
 * Used to get the correct period index into an amortization schedule,
 * regardless of whether the loan was originated at deal close or at a refi.
 */
function instrumentMonths(instrumentStartDate: string, eventDate: string): number {
  const sy = parseInt(instrumentStartDate.slice(0, 4), 10);
  const sm = parseInt(instrumentStartDate.slice(5, 7), 10);
  const ey = parseInt(eventDate.slice(0, 4), 10);
  const em = parseInt(eventDate.slice(5, 7), 10);
  return Math.max(1, (ey - sy) * 12 + (em - sm));
}
