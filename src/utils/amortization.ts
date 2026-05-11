/**
 * amortization.ts — Pure amortization schedule generators.
 * No store reads. Accepts a DebtInstrument and returns a full
 * month-by-month schedule for the instrument's term.
 *
 * Supported loan types:
 *   fixed        — standard amortizing, fixed rate
 *   floating     — amortizing, rate held flat at manualRate (Chatham stub at build step 15)
 *   io           — interest-only for full term, balloon at maturity
 *   hybrid       — IO for ioMonths, then amortizing remainder
 *   construction — straight-line draws, optional funded interest reserve,
 *                  optional permanent loan conversion at permConversionMonth
 */

import type { DebtInstrument, AmortizationRow, AmortizationSchedule } from '../state/economicsTypes';

// ─── Math helpers ─────────────────────────────────────────────────────────────

/**
 * Standard mortgage payment formula.
 * Returns 0 if principal is 0.
 * Falls back to simple principal/nPeriods when monthlyRate is 0.
 */
function pmt(principal: number, monthlyRate: number, nPeriods: number): number {
  if (principal <= 0 || nPeriods <= 0) return 0;
  if (monthlyRate === 0) return principal / nPeriods;
  return (
    (principal * monthlyRate * Math.pow(1 + monthlyRate, nPeriods)) /
    (Math.pow(1 + monthlyRate, nPeriods) - 1)
  );
}

/** Annual decimal rate → monthly decimal rate. */
function toMonthlyRate(annualRate: number): number {
  return annualRate / 12;
}

/** Advance a 'YYYY-MM' string by n months. */
function addMonths(yyyyMm: string, n: number): string {
  const year  = parseInt(yyyyMm.slice(0, 4), 10);
  const month = parseInt(yyyyMm.slice(5, 7), 10) - 1; // 0-indexed
  const d = new Date(year, month + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Returns the effective annual rate for a given instrument and period.
 *
 * v1 (build steps 1-13): returns manualRate (or spread as fallback) held flat.
 *
 * TODO build step 15: swap chathamForwardRate() in here once procurement completes.
 *   import { chathamForwardRate } from '../api/chatham';
 *   if (instrument.chathamEnabled) return await chathamForwardRate(instrument, periodMonth);
 */
function effectiveAnnualRate(instrument: DebtInstrument, _periodMonth: string): number {
  if (instrument.loanType === 'floating' || instrument.rateIsFloating) {
    // Chatham integration pending. Use manualRate; fall back to spread if unset.
    return instrument.manualRate ?? instrument.spread ?? 0;
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

  const rows: AmortizationRow[] = [];
  let balance = loanAmount;

  for (let i = 1; i <= termMonths; i++) {
    const interest    = balance * mr;
    const principal   = Math.min(Math.max(payment - interest, 0), balance);
    const beginBalance = balance;
    balance = Math.max(balance - principal, 0);

    rows.push({
      period:       i,
      date:         addMonths(startDate, i - 1),
      beginBalance,
      payment:      interest + principal,
      interest,
      principal,
      endBalance:   balance,
    });
  }

  return rows;
}

function buildFloating(instrument: DebtInstrument): AmortizationRow[] {
  const { loanAmount, termYears, amortizationYears, startDate } = instrument;
  const termMonths  = termYears * 12;
  const amortMonths = (amortizationYears ?? termYears) * 12;

  const rows: AmortizationRow[] = [];
  let balance = loanAmount;

  for (let i = 1; i <= termMonths; i++) {
    const date       = addMonths(startDate, i - 1);
    const annualRate = effectiveAnnualRate(instrument, date);
    const mr         = toMonthlyRate(annualRate);
    // Recalculate payment on remaining balance each period (held-flat simplification)
    const remaining  = amortMonths - (i - 1);
    const payment    = pmt(balance, mr, remaining);
    const interest   = balance * mr;
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
      note:         'Rate held flat (manual — Chatham pending)',
    });
  }

  return rows;
}

function buildIO(instrument: DebtInstrument): AmortizationRow[] {
  const { loanAmount, termYears, startDate } = instrument;
  const annualRate = effectiveAnnualRate(instrument, startDate);
  const mr         = toMonthlyRate(annualRate);
  const termMonths = termYears * 12;
  const interest   = loanAmount * mr;

  return Array.from({ length: termMonths }, (_, i) => ({
    period:       i + 1,
    date:         addMonths(startDate, i),
    beginBalance: loanAmount,
    payment:      interest,
    interest,
    principal:    0,
    endBalance:   loanAmount,
    note:         i === termMonths - 1 ? 'Balloon payment at maturity' : 'IO period',
  }));
}

function buildHybrid(instrument: DebtInstrument): AmortizationRow[] {
  const {
    loanAmount,
    termYears,
    amortizationYears,
    startDate,
    ioMonths = 0,
  } = instrument;
  const annualRate  = effectiveAnnualRate(instrument, startDate);
  const mr          = toMonthlyRate(annualRate);
  const termMonths  = termYears * 12;
  // Amortization schedule runs from ioMonths+1; total amort months = (amortizationYears * 12) - ioMonths
  const totalAmort  = (amortizationYears ?? termYears) * 12;
  const amortMonths = totalAmort - ioMonths;

  const rows: AmortizationRow[] = [];
  let balance = loanAmount;

  for (let i = 1; i <= termMonths; i++) {
    const date     = addMonths(startDate, i - 1);
    const isIO     = i <= ioMonths;
    const interest = balance * mr;

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
      // Amortizing phase — recalc on remaining amort months from this point
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

function buildConstruction(instrument: DebtInstrument): AmortizationRow[] {
  const {
    loanAmount,
    termYears,
    startDate,
    drawMonths        = 12,
    permConversionMonth,
    hasFundedInterestReserve = false,
    amortizationYears,
  } = instrument;
  const annualRate     = effectiveAnnualRate(instrument, startDate);
  const mr             = toMonthlyRate(annualRate);
  const termMonths     = termYears * 12;
  const drawPerMonth   = loanAmount / drawMonths;
  // Default: perm conversion happens the month after draws end
  const convMonth      = permConversionMonth ?? drawMonths + 1;
  const permAmortMonths = (amortizationYears ?? 30) * 12;

  const rows: AmortizationRow[] = [];
  let balance = 0;

  for (let i = 1; i <= termMonths; i++) {
    const date           = addMonths(startDate, i - 1);
    const isConstruction = i < convMonth;
    const isDraw         = i <= drawMonths;
    const drawAmount     = isDraw ? drawPerMonth : 0;

    if (isConstruction) {
      const interest = balance * mr;
      // If funded interest reserve: interest is capitalized (added to balance), cash payment = 0
      const capitalizedInterest = hasFundedInterestReserve ? interest : 0;
      const cashInterest        = hasFundedInterestReserve ? 0 : interest;
      const beginBalance        = balance;

      // Advance balance: add draw + any capitalized interest
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
      // Permanent loan phase — standard amortization on balance at conversion
      const elapsedPerm    = i - convMonth;
      const remainingAmort = permAmortMonths - elapsedPerm;

      if (remainingAmort <= 0 || balance <= 0) break;

      const payment      = pmt(balance, mr, remainingAmort);
      const interest     = balance * mr;
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
 */
export function buildAmortizationSchedule(instrument: DebtInstrument): AmortizationSchedule {
  let rows: AmortizationRow[];

  switch (instrument.loanType) {
    case 'fixed':        rows = buildFixed(instrument);        break;
    case 'floating':     rows = buildFloating(instrument);     break;
    case 'io':           rows = buildIO(instrument);           break;
    case 'hybrid':       rows = buildHybrid(instrument);       break;
    case 'construction': rows = buildConstruction(instrument); break;
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
  period: string // 'YYYY-MM'
): { interest: number; principal: number; payment: number } {
  const schedule = buildAmortizationSchedule(instrument);
  const row = schedule.rows.find(r => r.date === period);
  if (!row) return { interest: 0, principal: 0, payment: 0 };
  return { interest: row.interest, principal: row.principal, payment: row.payment };
}

/**
 * Returns the outstanding balance at the start of a given calendar period.
 * Returns the full loan amount if the period precedes the instrument start date.
 */
export function getBalanceAtPeriod(instrument: DebtInstrument, period: string): number {
  const schedule = buildAmortizationSchedule(instrument);
  const row = schedule.rows.find(r => r.date === period);
  return row ? row.beginBalance : instrument.loanAmount;
}
