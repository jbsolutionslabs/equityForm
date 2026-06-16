/**
 * amortization.ts — Pure amortization schedule generators.
 * No store reads. Accepts a DebtInstrument and returns a full
 * month-by-month schedule for the instrument's term.
 *
 * Supported loan types:
 *   fixed        — standard amortizing, fixed rate
 *   floating     — amortizing, rate from forward curve or manualRate fallback
 *   io           — interest-only for full term, balloon at maturity
 *   hybrid       — IO for ioMonths, then amortizing remainder
 *   construction — straight-line draws, optional funded interest reserve,
 *                  optional permanent loan conversion at permConversionMonth
 *
 * Day count conventions (Part 1 of the loan interest upgrade):
 *   ACT/360  — actual days in month ÷ 360  (most CRE loans)
 *   ACT/365  — actual days in month ÷ 365  (always 365, even in leap years)
 *   30/360   — always 30 ÷ 360 = 1/12      (flat; daylight-saving safe)
 *   ACT/ACT  — actual days ÷ 365 or 366 based on whether the period year is a leap year
 *
 * Rate curve interpolation (Part 2 of the loan interest upgrade):
 *   FLAT_FORWARD — stair-step: use rate of the most-recent tenor point (default)
 *   LINEAR       — linear interpolation between adjacent tenor points
 */

import type {
  DebtInstrument,
  AmortizationRow,
  AmortizationSchedule,
  DayCountConvention,
  RateCurve,
} from '../state/economicsTypes';

// ─── UTC date helpers (all date math in UTC to avoid DST ±1-hour drift) ───────

/** Convert 'YYYY-MM' to the first day of that month in UTC. */
function toUTCDate(yyyyMm: string): Date {
  return new Date(Date.UTC(
    parseInt(yyyyMm.slice(0, 4), 10),
    parseInt(yyyyMm.slice(5, 7), 10) - 1,
    1,
  ));
}

/** Advance a UTC Date by n months (stays on the 1st of the month). */
function addUTCMonths(d: Date, n: number): Date {
  return new Date(Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth() + n,
    1,
  ));
}

/** Whether the given year is a leap year. */
function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

// ─── Day count fraction ────────────────────────────────────────────────────────

/**
 * Returns the fraction of a year that the period (one calendar month) represents,
 * under the loan's chosen day-count convention.
 *
 * @param periodDate  'YYYY-MM' of the period start
 * @param convention  The day-count rule on the loan
 */
export function dayCountFraction(
  periodDate: string,
  convention: DayCountConvention,
): number {
  if (convention === 'thirty_360') {
    // 30/360 always = 30/360. Never count real days.
    return 30 / 360;
  }

  const start      = toUTCDate(periodDate);
  const end        = addUTCMonths(start, 1);          // first day of next month
  const actualDays = (end.getTime() - start.getTime()) / 86_400_000;

  switch (convention) {
    case 'actual_360':
      return actualDays / 360;

    case 'actual_365':
      // Always 365 per definition — not 366 in a leap year.
      return actualDays / 365;

    case 'actual_actual': {
      // Use 366 only when the period's month falls in a leap year.
      const daysInYear = isLeapYear(start.getUTCFullYear()) ? 366 : 365;
      return actualDays / daysInYear;
    }

    default:
      return 1 / 12;
  }
}

// ─── Rate curve interpolation ──────────────────────────────────────────────────

/**
 * Look up the index rate at a given tenor (months from loan start) using the
 * curve's interpolation mode.
 *
 * FLAT_FORWARD (stair-step, default): rate of the last tenor point ≤ current tenor.
 * LINEAR: linear interpolation between the two adjacent tenor points.
 *
 * Returns 0 if the curve has no points.
 */
export function interpolateCurve(curve: RateCurve, tenorMonths: number): number {
  const pts = [...curve.points].sort((a, b) => a.tenorMonths - b.tenorMonths);
  if (pts.length === 0) return 0;
  if (pts.length === 1) return pts[0].rate;

  // Before first point — use first rate
  if (tenorMonths <= pts[0].tenorMonths) return pts[0].rate;
  // After last point — use last rate
  if (tenorMonths >= pts[pts.length - 1].tenorMonths) return pts[pts.length - 1].rate;

  // Find surrounding points
  let lo = pts[0];
  let hi = pts[1];
  for (let i = 0; i < pts.length - 1; i++) {
    if (pts[i].tenorMonths <= tenorMonths && pts[i + 1].tenorMonths >= tenorMonths) {
      lo = pts[i];
      hi = pts[i + 1];
      break;
    }
  }

  if (curve.interpolation === 'LINEAR') {
    const span = hi.tenorMonths - lo.tenorMonths;
    if (span === 0) return lo.rate;
    const t = (tenorMonths - lo.tenorMonths) / span;
    return lo.rate + t * (hi.rate - lo.rate);
  }

  // FLAT_FORWARD (stair-step): return the rate of the largest tenor point
  // that is ≤ the current tenor. Iterating sorted pts, keep updating as long
  // as pt.tenorMonths ≤ tenorMonths — the last match wins.
  let flatRate = pts[0].rate;
  for (const pt of pts) {
    if (pt.tenorMonths <= tenorMonths) flatRate = pt.rate;
  }
  return flatRate;
}

// ─── Math helpers ─────────────────────────────────────────────────────────────

/**
 * Standard mortgage payment formula.
 * Returns 0 if principal is 0.
 * Falls back to simple principal/nPeriods when monthlyRate is 0.
 *
 * NOTE: monthlyRate is always annualRate/12 for the payment formula — the day-count
 * fraction only affects the interest line, not this constant-payment calculation.
 */
function pmt(principal: number, monthlyRate: number, nPeriods: number): number {
  if (principal <= 0 || nPeriods <= 0) return 0;
  if (monthlyRate === 0) return principal / nPeriods;
  return (
    (principal * monthlyRate * Math.pow(1 + monthlyRate, nPeriods)) /
    (Math.pow(1 + monthlyRate, nPeriods) - 1)
  );
}

/** Annual decimal rate → monthly decimal rate (used only for PMT calculation). */
function toMonthlyRate(annualRate: number): number {
  return annualRate / 12;
}

/** Advance a 'YYYY-MM' string by n months. */
function addMonths(yyyyMm: string, n: number): string {
  const d = addUTCMonths(toUTCDate(yyyyMm), n);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// ─── Effective annual rate ────────────────────────────────────────────────────

/**
 * Returns the all-in annual rate for a given period.
 *
 * Priority order (floating loans):
 *  1. User forward curve: interpolatedIndex (floor-clamped) + spread, then cap-clamped
 *  2. manualRate: user's flat all-in rate (already includes spread — no further addition)
 *  3. spread alone (legacy fallback — kept for backward compat but will show only the markup)
 *
 * Fixed loans: return fixedRate directly.
 *
 * @param instrument  The debt instrument
 * @param periodIndex 1-based month number within the loan term
 * @param curve       Optional deal-level forward rate curve
 */
function effectiveAnnualRate(
  instrument: DebtInstrument,
  periodIndex: number,
  curve?: RateCurve,
): number {
  if (instrument.loanType === 'floating' || instrument.rateIsFloating) {
    // 1. Forward curve
    if (curve && curve.points.length > 0) {
      const tenorMonths = periodIndex - 1; // 0 at loan start
      const rawIndex    = interpolateCurve(curve, tenorMonths);
      const indexRate   = Math.max(rawIndex, instrument.floor ?? 0);
      const allIn       = indexRate + (instrument.spread ?? 0);
      return instrument.cap != null ? Math.min(allIn, instrument.cap) : allIn;
    }
    // 2. Manual all-in rate
    if (instrument.manualRate != null) return instrument.manualRate;
    // 3. Legacy: spread only (known to be wrong — shown with a note in the schedule)
    return instrument.spread ?? 0;
  }
  return instrument.fixedRate ?? 0;
}

// ─── Per-type builders ────────────────────────────────────────────────────────

function buildFixed(instrument: DebtInstrument): AmortizationRow[] {
  const { loanAmount, termYears, amortizationYears, startDate } = instrument;
  const annualRate   = instrument.fixedRate ?? 0;
  const mr           = toMonthlyRate(annualRate);
  const termMonths   = termYears * 12;
  const amortMonths  = (amortizationYears ?? termYears) * 12;
  const payment      = pmt(loanAmount, mr, amortMonths);
  const convention   = instrument.dayCountConvention ?? 'actual_360';

  const rows: AmortizationRow[] = [];
  let balance = loanAmount;

  for (let i = 1; i <= termMonths; i++) {
    const date        = addMonths(startDate, i - 1);
    const frac        = dayCountFraction(date, convention);
    const interest    = balance * annualRate * frac;
    const principal   = Math.min(Math.max(payment - interest, 0), balance);
    const beginBalance = balance;
    balance = Math.max(balance - principal, 0);

    rows.push({
      period:       i,
      date,
      beginBalance,
      payment:      interest + principal,
      interest,
      principal,
      endBalance:   balance,
    });
  }

  return rows;
}

function buildFloating(instrument: DebtInstrument, curve?: RateCurve): AmortizationRow[] {
  const { loanAmount, termYears, amortizationYears, startDate } = instrument;
  const termMonths  = termYears * 12;
  const amortMonths = (amortizationYears ?? termYears) * 12;
  const convention  = instrument.dayCountConvention ?? 'actual_360';

  const rows: AmortizationRow[] = [];
  let balance = loanAmount;
  const hasCurve = !!(curve && curve.points.length > 0);

  for (let i = 1; i <= termMonths; i++) {
    const date       = addMonths(startDate, i - 1);
    const annualRate = effectiveAnnualRate(instrument, i, curve);
    const mr         = toMonthlyRate(annualRate);
    const frac       = dayCountFraction(date, convention);
    // Recalculate payment on remaining balance each period so the loan amortizes on schedule
    const remaining  = amortMonths - (i - 1);
    const payment    = pmt(balance, mr, remaining);
    const interest   = balance * annualRate * frac;
    const principal  = Math.min(Math.max(payment - interest, 0), balance);
    const beginBalance = balance;
    balance = Math.max(balance - principal, 0);

    rows.push({
      period:       i,
      date,
      beginBalance,
      payment:      interest + principal,
      interest,
      principal,
      endBalance:   balance,
      note: hasCurve ? undefined : 'Rate held flat (no curve — paste a forward curve above)',
    });
  }

  return rows;
}

function buildIO(instrument: DebtInstrument, curve?: RateCurve): AmortizationRow[] {
  const { loanAmount, termYears, startDate } = instrument;
  const convention = instrument.dayCountConvention ?? 'actual_360';
  const termMonths = termYears * 12;

  return Array.from({ length: termMonths }, (_, idx) => {
    const i    = idx + 1;
    const date = addMonths(startDate, idx);
    const annualRate = effectiveAnnualRate(instrument, i, curve);
    const frac       = dayCountFraction(date, convention);
    const interest   = loanAmount * annualRate * frac;

    return {
      period:       i,
      date,
      beginBalance: loanAmount,
      payment:      interest,
      interest,
      principal:    0,
      endBalance:   loanAmount,
      note:         i === termMonths ? 'Balloon payment at maturity' : 'IO period',
    };
  });
}

function buildHybrid(instrument: DebtInstrument, curve?: RateCurve): AmortizationRow[] {
  const {
    loanAmount,
    termYears,
    amortizationYears,
    startDate,
    ioMonths = 0,
  } = instrument;
  const convention  = instrument.dayCountConvention ?? 'actual_360';
  const termMonths  = termYears * 12;
  const totalAmort  = (amortizationYears ?? termYears) * 12;
  const amortMonths = totalAmort - ioMonths;

  const rows: AmortizationRow[] = [];
  let balance = loanAmount;

  for (let i = 1; i <= termMonths; i++) {
    const date       = addMonths(startDate, i - 1);
    const annualRate = effectiveAnnualRate(instrument, i, curve);
    const mr         = toMonthlyRate(annualRate);
    const frac       = dayCountFraction(date, convention);
    const isIO       = i <= ioMonths;
    const interest   = balance * annualRate * frac;

    if (isIO) {
      rows.push({
        period:       i,
        date,
        beginBalance: balance,
        payment:      interest,
        interest,
        principal:    0,
        endBalance:   balance,
        note:         'IO period',
      });
    } else {
      const elapsedAmort   = i - ioMonths - 1;
      const remainingAmort = amortMonths - elapsedAmort;
      const payment        = pmt(balance, mr, remainingAmort);
      const principal      = Math.min(Math.max(payment - interest, 0), balance);
      const beginBalance   = balance;
      balance = Math.max(balance - principal, 0);

      rows.push({
        period:       i,
        date,
        beginBalance,
        payment:      interest + principal,
        interest,
        principal,
        endBalance:   balance,
        note:         i === ioMonths + 1 ? 'Amortization begins' : undefined,
      });
    }
  }

  return rows;
}

function buildConstruction(instrument: DebtInstrument, curve?: RateCurve): AmortizationRow[] {
  const {
    loanAmount,
    termYears,
    startDate,
    drawMonths        = 12,
    permConversionMonth,
    hasFundedInterestReserve = false,
    amortizationYears,
  } = instrument;
  const convention     = instrument.dayCountConvention ?? 'actual_360';
  const termMonths     = termYears * 12;
  const drawPerMonth   = loanAmount / drawMonths;
  const convMonth      = permConversionMonth ?? drawMonths + 1;
  const permAmortMonths = (amortizationYears ?? 30) * 12;

  const rows: AmortizationRow[] = [];
  let balance = 0;

  for (let i = 1; i <= termMonths; i++) {
    const date           = addMonths(startDate, i - 1);
    const annualRate     = effectiveAnnualRate(instrument, i, curve);
    const mr             = toMonthlyRate(annualRate);
    const frac           = dayCountFraction(date, convention);
    const isConstruction = i < convMonth;
    const isDraw         = i <= drawMonths;
    const drawAmount     = isDraw ? drawPerMonth : 0;

    if (isConstruction) {
      const interest            = balance * annualRate * frac;
      const capitalizedInterest = hasFundedInterestReserve ? interest : 0;
      const cashInterest        = hasFundedInterestReserve ? 0 : interest;
      const beginBalance        = balance;

      balance += drawAmount + capitalizedInterest;

      rows.push({
        period:            i,
        date,
        beginBalance,
        payment:           cashInterest,
        interest:          cashInterest,
        principal:         0,
        endBalance:        balance,
        drawAmount,
        capitalizedInterest,
        note: isDraw
          ? `Construction draw ${i}/${drawMonths}`
          : 'Post-draw, pre-conversion',
      });
    } else {
      const elapsedPerm    = i - convMonth;
      const remainingAmort = permAmortMonths - elapsedPerm;

      if (remainingAmort <= 0 || balance <= 0) break;

      const payment      = pmt(balance, mr, remainingAmort);
      const interest     = balance * annualRate * frac;
      const principal    = Math.min(Math.max(payment - interest, 0), balance);
      const beginBalance = balance;
      balance = Math.max(balance - principal, 0);

      rows.push({
        period:       i,
        date,
        beginBalance,
        payment:      interest + principal,
        interest,
        principal,
        endBalance:   balance,
        note:         i === convMonth ? 'Permanent conversion' : undefined,
      });
    }
  }

  return rows;
}

// ─── Main dispatch ────────────────────────────────────────────────────────────

/**
 * Builds a full amortization schedule for any supported loan type.
 * Returns per-row data plus totals.
 *
 * @param instrument  The debt instrument configuration
 * @param curve       Optional deal-level forward rate curve for floating loans.
 *                    Pass undefined for fixed-rate loans (it will be ignored anyway).
 */
export function buildAmortizationSchedule(
  instrument: DebtInstrument,
  curve?: RateCurve,
): AmortizationSchedule {
  let rows: AmortizationRow[];

  switch (instrument.loanType) {
    case 'fixed':        rows = buildFixed(instrument);              break;
    case 'floating':     rows = buildFloating(instrument, curve);    break;
    case 'io':           rows = buildIO(instrument, curve);          break;
    case 'hybrid':       rows = buildHybrid(instrument, curve);      break;
    case 'construction': rows = buildConstruction(instrument, curve); break;
    default:             rows = buildFixed(instrument);
  }

  return {
    instrumentId:   instrument.id,
    rows,
    totalInterest:  rows.reduce((s, r) => s + r.interest,  0),
    totalPrincipal: rows.reduce((s, r) => s + r.principal, 0),
    totalPayments:  rows.reduce((s, r) => s + r.payment,   0),
  };
}

/**
 * Returns debt service components for a single calendar period.
 * Used by the live preview panel and accounting module debt-service auto-fill.
 * Returns zeros if the period falls outside the instrument's term.
 */
export function getDebtServiceForMonth(
  instrument: DebtInstrument,
  period: string, // 'YYYY-MM'
  curve?: RateCurve,
): { interest: number; principal: number; payment: number } {
  const schedule = buildAmortizationSchedule(instrument, curve);
  const row = schedule.rows.find(r => r.date === period);
  if (!row) return { interest: 0, principal: 0, payment: 0 };
  return { interest: row.interest, principal: row.principal, payment: row.payment };
}

/**
 * Returns the outstanding balance at the start of a given calendar period.
 * Returns the full loan amount if the period precedes the instrument start date.
 */
export function getBalanceAtPeriod(
  instrument: DebtInstrument,
  period: string,
  curve?: RateCurve,
): number {
  const schedule = buildAmortizationSchedule(instrument, curve);
  const row = schedule.rows.find(r => r.date === period);
  return row ? row.beginBalance : instrument.loanAmount;
}
