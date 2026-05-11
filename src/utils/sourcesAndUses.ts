/**
 * sourcesAndUses.ts — Pure Sources & Uses computation.
 * No store reads. All functions accept CapitalStack and return computed values.
 */

import type { CapitalStack, SourcesAndUses, LoanPosition } from '../state/economicsTypes';

// ─── Core computation ─────────────────────────────────────────────────────────

/**
 * Derives Sources & Uses from a CapitalStack.
 *
 * Uses:
 *   Purchase price + closing costs + other uses
 *
 * Sources:
 *   Equity (residual) = total uses − total debt
 *   Debt   (per position) = sum of instrument loan amounts
 *
 * Metrics:
 *   LTV = senior debt / purchase price
 *   LTC = total debt / total uses
 *   gapOrSurplus = sources.total − uses.total  (must = 0 to pass validation)
 */
export function computeSourcesAndUses(stack: CapitalStack): SourcesAndUses {
  const {
    purchasePrice,
    closingCosts,
    operatingReserves = 0,
    capexReserves = 0,
    otherUses,
    instruments,
  } = stack;

  // ── Uses ──
  const totalUses = purchasePrice + closingCosts + operatingReserves + capexReserves + otherUses;
  const uses = {
    purchasePrice,
    closingCosts,
    operatingReserves,
    capexReserves,
    otherUses,
    total: totalUses,
  };

  // ── Debt by position ──
  const byPosition: Partial<Record<LoanPosition, number>> = {};
  let totalDebt = 0;

  for (const inst of instruments) {
    const pos = inst.position;
    byPosition[pos] = (byPosition[pos] ?? 0) + inst.loanAmount;
    totalDebt += inst.loanAmount;
  }

  // ── Equity (residual) ──
  const equity = Math.max(totalUses - totalDebt, 0);

  const sources = {
    equity,
    byPosition,
    totalDebt,
    total: equity + totalDebt,
  };

  // ── Leverage metrics ──
  const seniorDebt = byPosition['senior'] ?? 0;
  const ltv        = purchasePrice > 0 ? seniorDebt / purchasePrice : 0;
  const ltc        = totalUses > 0 ? totalDebt / totalUses : 0;

  // ── Gap / surplus (positive = too much debt, negative = equity shortfall) ──
  const gapOrSurplus = sources.total - uses.total;

  return { uses, sources, ltv, ltc, gapOrSurplus };
}

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Returns an error string if sources ≠ uses, otherwise null.
 * Tolerance: $1 rounding.
 */
export function validateSourcesBalance(stack: CapitalStack): string | null {
  const { gapOrSurplus } = computeSourcesAndUses(stack);
  if (Math.abs(gapOrSurplus) > 1) {
    const dir    = gapOrSurplus > 0 ? 'surplus' : 'gap';
    const amount = Math.abs(Math.round(gapOrSurplus)).toLocaleString();
    return `Capital stack has a $${amount} ${dir}. Sources must equal uses.`;
  }
  return null;
}

/**
 * Returns a validation error if the instrument array violates position rules.
 * - Senior is required if any debt instruments exist.
 * - Maximum 5 instruments.
 */
export function validateInstrumentPositions(stack: CapitalStack): string | null {
  const { instruments } = stack;
  if (instruments.length === 0) return null;
  if (instruments.length > 5) return 'Maximum of 5 debt instruments allowed per deal.';
  const hasSenior = instruments.some(i => i.position === 'senior');
  if (!hasSenior) return 'A Senior instrument is required when any debt is present.';
  const seniorCount = instruments.filter(i => i.position === 'senior').length;
  if (seniorCount > 1) return 'Only one Senior instrument is allowed.';
  return null;
}

// ─── Display helpers ──────────────────────────────────────────────────────────

export interface LeverageMetrics {
  ltvPct:     string;   // e.g. "65.0%"
  ltcPct:     string;   // e.g. "70.2%"
  ltvDecimal: number;
  ltcDecimal: number;
}

export function getLeverageMetrics(stack: CapitalStack): LeverageMetrics {
  const { ltv, ltc } = computeSourcesAndUses(stack);
  return {
    ltvPct:     `${(ltv * 100).toFixed(1)}%`,
    ltcPct:     `${(ltc * 100).toFixed(1)}%`,
    ltvDecimal: ltv,
    ltcDecimal: ltc,
  };
}

/** Human-readable label for a LoanPosition value. */
export function positionLabel(position: LoanPosition): string {
  const map: Record<LoanPosition, string> = {
    senior:      'Senior Debt',
    subordinate: 'Subordinate (Mezzanine)',
    pref_equity: 'Preferred Equity',
  };
  return map[position] ?? position;
}
