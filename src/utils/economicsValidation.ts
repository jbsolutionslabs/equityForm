/**
 * economicsValidation.ts — Section-level gate validators.
 * Pure functions; no store reads.
 * Each validator returns string[] — empty means section is complete.
 */

import type {
  EconomicsDeal,
  DebtInstrument,
  LoanType,
} from '../state/economicsTypes';
import { computeSourcesAndUses, validateInstrumentPositions } from './sourcesAndUses';

// ─── Required fields per loan type ───────────────────────────────────────────

type InstrumentField = keyof DebtInstrument;

const REQUIRED_BY_TYPE: Record<LoanType, InstrumentField[]> = {
  fixed:        ['fixedRate', 'termYears', 'amortizationYears'],
  floating:     ['index',    'spread',    'termYears', 'amortizationYears'],
  io:           ['termYears'],           // rate validated separately (depends on rateIsFloating)
  hybrid:       ['termYears', 'ioMonths', 'amortizationYears'],  // rate validated separately
  construction: ['termYears', 'drawMonths'],  // rate validated separately
};

/** Human-readable label for an instrument field. */
const FIELD_LABELS: Partial<Record<InstrumentField, string>> = {
  fixedRate:         'Fixed rate',
  termYears:         'Term (years)',
  amortizationYears: 'Amortization (years)',
  index:             'Rate index',
  spread:            'Spread',
  ioMonths:          'IO period (months)',
  drawMonths:        'Draw period (months)',
};

function fieldLabel(f: InstrumentField): string {
  return FIELD_LABELS[f] ?? String(f);
}

function instrumentName(inst: DebtInstrument): string {
  return inst.lender || `${inst.position} (${inst.loanType})`;
}

function isEmpty(val: unknown): boolean {
  return val === undefined || val === null || val === '';
}

// ─── Section A ────────────────────────────────────────────────────────────────

export function validateSectionA(deal: EconomicsDeal): string[] {
  const errors: string[] = [];
  const { capitalStack } = deal;

  if (!capitalStack) return ['Capital stack is required.'];

  if (!capitalStack.purchasePrice || capitalStack.purchasePrice <= 0) {
    errors.push('Purchase price must be greater than $0.');
  }

  const instruments = capitalStack.instruments ?? [];

  // Position rules
  const posError = validateInstrumentPositions(capitalStack);
  if (posError) errors.push(posError);

  for (const inst of instruments) {
    const name = instrumentName(inst);

    if (!inst.loanAmount || inst.loanAmount <= 0) {
      errors.push(`"${name}": Loan amount must be greater than $0.`);
    }

    // Pref equity: validate pref-specific fields only; skip all debt checks
    if (inst.position === 'pref_equity') {
      if (!inst.prefEquityRate || inst.prefEquityRate <= 0) {
        errors.push(`"${name}": Preferred equity rate is required.`);
      }
      continue;
    }

    // Standard required fields by loan type
    const required = REQUIRED_BY_TYPE[inst.loanType] ?? [];
    for (const field of required) {
      if (isEmpty(inst[field])) {
        errors.push(`"${name}": ${fieldLabel(field)} is required.`);
      }
    }

    // Rate validation for IO / Hybrid / Construction (depends on rateIsFloating toggle)
    if (inst.loanType === 'io' || inst.loanType === 'hybrid' || inst.loanType === 'construction') {
      if (!inst.rateIsFloating) {
        if (isEmpty(inst.fixedRate)) {
          errors.push(`"${name}": Interest rate is required.`);
        }
      } else {
        if (!inst.chathamEnabled && isEmpty(inst.manualRate)) {
          errors.push(`"${name}": Manual rate required (Chatham integration not enabled).`);
        }
      }
    }

    // Floating rate: chathamEnabled or manualRate required
    if (inst.loanType === 'floating' && !inst.chathamEnabled) {
      if (isEmpty(inst.manualRate)) {
        errors.push(`"${name}": Manual rate required (Chatham integration not enabled).`);
      }
    }

    // Hybrid: IO period must be shorter than total amortization schedule
    if (inst.loanType === 'hybrid' && inst.ioMonths && inst.amortizationYears) {
      if (inst.ioMonths >= inst.amortizationYears * 12) {
        errors.push(
          `"${name}": IO period (${inst.ioMonths} months) must be less than amortization schedule ` +
          `(${inst.amortizationYears * 12} months). Increase amortization years or shorten IO period.`
        );
      }
    }

    // Rate cap: if flagged, required fields
    if (inst.hasCap) {
      if (isEmpty(inst.capStrikeRate)) errors.push(`"${name}": Cap strike rate is required.`);
      if (isEmpty(inst.capPremium))    errors.push(`"${name}": Cap premium cost is required.`);
      if (isEmpty(inst.capTermMonths)) errors.push(`"${name}": Cap term (months) is required.`);
    }

    // Prepayment penalty: type required if enabled
    if (inst.hasPrepaymentPenalty && !inst.prepaymentPenaltyType) {
      errors.push(`"${name}": Prepayment penalty type is required.`);
    }

    // Construction perm conversion: validate perm fields if enabled
    if (inst.loanType === 'construction' && inst.hasPermanentConversion) {
      if (isEmpty(inst.permRate))   errors.push(`"${name}": Permanent loan rate is required.`);
      if (!inst.permTermYears)      errors.push(`"${name}": Permanent loan term is required.`);
      if (!inst.permAmortYears)     errors.push(`"${name}": Permanent loan amortization years is required.`);
    }
  }

  // S&U balance check (only meaningful when there is debt)
  if (instruments.length > 0 && (capitalStack.purchasePrice ?? 0) > 0) {
    const { gapOrSurplus } = computeSourcesAndUses(capitalStack);
    if (Math.abs(gapOrSurplus) > 1) {
      errors.push('Sources do not equal uses — adjust equity raise or debt amounts.');
    }
  }

  return errors;
}

// ─── Section B ────────────────────────────────────────────────────────────────

export function validateSectionB(deal: EconomicsDeal): string[] {
  const errors: string[] = [];
  const { profitSplit } = deal;

  if (!profitSplit) return ['Profit split configuration is required.'];

  const { pref, waterfall } = profitSplit;

  // Pref
  if (!pref.type) {
    errors.push('Preferred return type must be selected (choose "None" to skip).');
  }
  if (pref.type && pref.type !== 'none') {
    if (isEmpty(pref.rate)) {
      errors.push('Preferred return rate is required when pref type is not None.');
    } else if ((pref.rate ?? 0) <= 0) {
      errors.push('Preferred return rate must be greater than 0%.');
    }
  }

  // Waterfall
  if (!waterfall.mode) {
    errors.push('Waterfall mode must be selected.');
  }

  if (waterfall.mode === 'simple') {
    if (isEmpty(waterfall.simpleLpSplit)) {
      errors.push('LP split percentage is required in simple waterfall mode.');
    } else {
      const lp = waterfall.simpleLpSplit ?? 0;
      if (lp < 0 || lp > 100) {
        errors.push('LP split must be between 0% and 100%.');
      }
    }
  }

  if (waterfall.mode === 'advanced') {
    const tiers = waterfall.tiers ?? [];

    if (tiers.length === 0) {
      errors.push('At least one waterfall tier is required in advanced mode.');
    }

    tiers.forEach((tier, i) => {
      const n = i + 1;
      const splitTotal = (tier.lpSplit ?? 0) + (tier.gpSplit ?? 0);
      if (Math.abs(splitTotal - 100) > 0.01) {
        errors.push(`Tier ${n} ("${tier.label}"): LP + GP splits must equal 100% (currently ${splitTotal}%).`);
      }
      // Hurdles must be ascending
      if (i > 0) {
        const prevHurdle = tiers[i - 1].hurdleIrr;
        const currHurdle = tier.hurdleIrr;
        if (prevHurdle !== undefined && currHurdle !== undefined && currHurdle <= prevHurdle) {
          errors.push(`Tier ${n}: Hurdle IRR must be greater than Tier ${i} (${(prevHurdle * 100).toFixed(1)}%).`);
        }
      }
    });

    // Catch-up
    if (waterfall.hasCatchUp && isEmpty(waterfall.catchUpRate)) {
      errors.push('Catch-up rate is required when catch-up is enabled.');
    }
  }

  return errors;
}

// ─── Section C ────────────────────────────────────────────────────────────────

export function validateSectionC(deal: EconomicsDeal): string[] {
  const errors: string[] = [];
  const { fees } = deal;

  // All standard fees must have a Yes/No answer
  const unanswered = fees.filter(f => f.type !== 'custom' && f.enabled === null);
  if (unanswered.length > 0) {
    const labels = unanswered.map(f => f.label || f.type).join(', ');
    errors.push(`The following fees need a Yes/No answer: ${labels}.`);
  }

  // Enabled fees need full configuration
  for (const fee of fees.filter(f => f.enabled === 'yes')) {
    const name = fee.label || fee.type;

    if (!fee.basisType) {
      errors.push(`Fee "${name}": Basis type is required.`);
      continue; // No point checking rate/amount without basis
    }

    if (fee.basisType === 'flat') {
      if (!fee.flatAmount || fee.flatAmount <= 0) {
        errors.push(`Fee "${name}": Flat dollar amount is required.`);
      }
    } else {
      if (isEmpty(fee.rate) || (fee.rate ?? 0) <= 0) {
        errors.push(`Fee "${name}": Rate (%) is required.`);
      }
    }

    if (fee.type === 'custom' && !fee.label?.trim()) {
      errors.push('A custom fee must have a label.');
    }
  }

  return errors;
}

// ─── Aggregate ────────────────────────────────────────────────────────────────

export interface SectionErrors {
  A: string[];
  B: string[];
  C: string[];
}

export function getAllErrors(deal: EconomicsDeal): SectionErrors {
  return {
    A: validateSectionA(deal),
    B: validateSectionB(deal),
    C: validateSectionC(deal),
  };
}

export function isSectionComplete(errors: string[]): boolean {
  return errors.length === 0;
}
