import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type {
  EconomicsDeal,
  CapitalStack,
  ProfitSplitConfig,
  FeeEntry,
  DebtInstrument,
  AuditEntry,
  RateCurve,
  ExitScenario,
  ExitScenarioAssumptions,
} from './economicsTypes';
import { computeProjection } from '../utils/waterfallEngine';
import { buildAmortizationSchedule } from '../utils/amortization';

const STORAGE_KEY = 'equityform:economics';

// ─── Default seeders ──────────────────────────────────────────────────────────

/** The 5 standard fee entries every deal starts with (all unanswered). */
function defaultFees(): FeeEntry[] {
  return [
    { id: uuidv4(), type: 'acquisition',       label: 'Acquisition Fee',            enabled: null },
    { id: uuidv4(), type: 'asset_management',  label: 'Asset Management Fee',       enabled: null },
    { id: uuidv4(), type: 'disposition',       label: 'Disposition Fee',            enabled: null },
    { id: uuidv4(), type: 'construction_mgmt', label: 'Construction Management Fee',enabled: null },
    { id: uuidv4(), type: 'financing',         label: 'Financing Fee',              enabled: null },
  ];
}

function defaultDeal(dealId: string): EconomicsDeal {
  return {
    dealId,
    capitalStack:    undefined,
    profitSplit:     undefined,
    fees:            defaultFees(),
    rateCurves:      [],
    exitScenarios:   [],
    sectionAComplete: false,
    sectionBComplete: false,
    sectionCComplete: false,
    lockedAt:        undefined,
    lockedBy:        undefined,
    hasSeenPrefEquityWarning: false,
    auditTrail:      [],
  };
}

// ─── Persistence ──────────────────────────────────────────────────────────────

function load(): EconomicsDeal[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const deals: EconomicsDeal[] = JSON.parse(raw);
    // Migrate: ensure exitScenarios exists on old deals
    return deals.map(d => ({
      ...d,
      exitScenarios: d.exitScenarios ?? [],
    }));
  } catch {
    return [];
  }
}

function save(deals: EconomicsDeal[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(deals));
  } catch {
    // Storage quota / private mode — silently ignore
  }
}

// ─── Store interface ──────────────────────────────────────────────────────────

interface EconomicsState {
  deals: EconomicsDeal[];

  /** Returns existing deal or creates a fresh one. */
  getOrCreateDeal(dealId: string): EconomicsDeal;
  getDeal(dealId: string): EconomicsDeal | undefined;

  // ── Section A ──────────────────────────────────────────────────────────────
  updateCapitalStack(dealId: string, stack: CapitalStack): void;
  addInstrument(dealId: string, instrument: Omit<DebtInstrument, 'id'>): string;
  updateInstrument(dealId: string, instrumentId: string, patch: Partial<DebtInstrument>): void;
  removeInstrument(dealId: string, instrumentId: string): void;
  /** Reorder instruments given an ordered list of IDs. */
  reorderInstruments(dealId: string, ids: string[]): void;

  // ── Section B ──────────────────────────────────────────────────────────────
  updateProfitSplit(dealId: string, config: ProfitSplitConfig): void;

  // ── Section C ──────────────────────────────────────────────────────────────
  updateFee(dealId: string, feeId: string, patch: Partial<FeeEntry>): void;
  /** Appends a new blank custom fee entry. Returns new id. */
  addCustomFee(dealId: string): string;
  /** Only custom-type fees can be removed. Standard fees are permanent. */
  removeCustomFee(dealId: string, feeId: string): void;
  /** Replaces all fees from a template (re-ids every entry). */
  applyFeeTemplate(dealId: string, fees: FeeEntry[]): void;

  // ── Rate curves ────────────────────────────────────────────────────────────
  /** Creates a new deal-level rate curve. Returns the new curve id. */
  addRateCurve(dealId: string, curve: Omit<RateCurve, 'id' | 'dealId'>): string;
  updateRateCurve(dealId: string, curveId: string, patch: Partial<Omit<RateCurve, 'id' | 'dealId'>>): void;
  removeRateCurve(dealId: string, curveId: string): void;

  // ── Completion flags ───────────────────────────────────────────────────────
  setSectionComplete(dealId: string, section: 'A' | 'B' | 'C', complete: boolean): void;

  // ── Module lock ────────────────────────────────────────────────────────────
  lockEconomics(dealId: string, lockedBy?: string): void;
  unlockEconomics(dealId: string, reason: string): void;

  // ── Pref equity warning ────────────────────────────────────────────────────
  markPrefEquityWarningSeen(dealId: string): void;

  // ── Exit scenarios ─────────────────────────────────────────────────────────
  addExitScenario(dealId: string, assumptions: ExitScenarioAssumptions, name?: string): string;
  updateExitScenario(dealId: string, scenarioId: string, patch: Partial<Pick<ExitScenario, 'name' | 'assumptions'>>): void;
  removeExitScenario(dealId: string, scenarioId: string): void;
  runProjection(dealId: string, scenarioId: string): void;

  // ── Audit ──────────────────────────────────────────────────────────────────
  addAuditEntry(dealId: string, action: string, note?: string, changedFields?: string[]): void;

  reset(): void;
}

// ─── Store implementation ─────────────────────────────────────────────────────

export const useEconomicsStore = create<EconomicsState>((set, get) => {
  /**
   * Helper: find deal by id, apply mutation fn, persist, return updated state.
   * Silently no-ops if deal not found.
   */
  function mutateDeal(dealId: string, fn: (deal: EconomicsDeal) => void) {
    set(state => {
      const idx = state.deals.findIndex(d => d.dealId === dealId);
      if (idx === -1) return state;
      const deals = [...state.deals];
      const deal: EconomicsDeal = { ...deals[idx] };
      fn(deal);
      deals[idx] = deal;
      save(deals);
      return { deals };
    });
  }

  return {
    deals: load(),

    getOrCreateDeal(dealId) {
      const existing = get().deals.find(d => d.dealId === dealId);
      if (existing) return existing;
      const deal = defaultDeal(dealId);
      const deals = [...get().deals, deal];
      save(deals);
      set({ deals });
      return deal;
    },

    getDeal(dealId) {
      return get().deals.find(d => d.dealId === dealId);
    },

    // ── Section A ──────────────────────────────────────────────────────────

    updateCapitalStack(dealId, stack) {
      mutateDeal(dealId, deal => {
        deal.capitalStack = stack;
      });
    },

    addInstrument(dealId, instrument) {
      const id = uuidv4();
      mutateDeal(dealId, deal => {
        if (!deal.capitalStack) return;
        deal.capitalStack = {
          ...deal.capitalStack,
          instruments: [...deal.capitalStack.instruments, { ...instrument, id }],
        };
      });
      return id;
    },

    updateInstrument(dealId, instrumentId, patch) {
      mutateDeal(dealId, deal => {
        if (!deal.capitalStack) return;
        deal.capitalStack = {
          ...deal.capitalStack,
          instruments: deal.capitalStack.instruments.map(i =>
            i.id === instrumentId ? { ...i, ...patch } : i
          ),
        };
      });
    },

    removeInstrument(dealId, instrumentId) {
      mutateDeal(dealId, deal => {
        if (!deal.capitalStack) return;
        deal.capitalStack = {
          ...deal.capitalStack,
          instruments: deal.capitalStack.instruments.filter(i => i.id !== instrumentId),
        };
      });
    },

    reorderInstruments(dealId, ids) {
      mutateDeal(dealId, deal => {
        if (!deal.capitalStack) return;
        const map = Object.fromEntries(deal.capitalStack.instruments.map(i => [i.id, i]));
        deal.capitalStack = {
          ...deal.capitalStack,
          instruments: ids.map(id => map[id]).filter(Boolean) as DebtInstrument[],
        };
      });
    },

    // ── Rate curves ────────────────────────────────────────────────────────

    addRateCurve(dealId, curve) {
      const id = uuidv4();
      mutateDeal(dealId, deal => {
        if (!deal.rateCurves) deal.rateCurves = [];
        deal.rateCurves = [...deal.rateCurves, { ...curve, id, dealId }];
      });
      return id;
    },

    updateRateCurve(dealId, curveId, patch) {
      mutateDeal(dealId, deal => {
        if (!deal.rateCurves) return;
        deal.rateCurves = deal.rateCurves.map(c =>
          c.id === curveId ? { ...c, ...patch } : c
        );
      });
    },

    removeRateCurve(dealId, curveId) {
      mutateDeal(dealId, deal => {
        if (!deal.rateCurves) return;
        deal.rateCurves = deal.rateCurves.filter(c => c.id !== curveId);
        // Unlink any instruments pointing to this curve
        if (deal.capitalStack) {
          deal.capitalStack = {
            ...deal.capitalStack,
            instruments: deal.capitalStack.instruments.map(i =>
              i.rateCurveId === curveId ? { ...i, rateCurveId: undefined } : i
            ),
          };
        }
      });
    },

    // ── Section B ──────────────────────────────────────────────────────────

    updateProfitSplit(dealId, config) {
      mutateDeal(dealId, deal => {
        deal.profitSplit = config;
      });
    },

    // ── Section C ──────────────────────────────────────────────────────────

    updateFee(dealId, feeId, patch) {
      mutateDeal(dealId, deal => {
        deal.fees = deal.fees.map(f => (f.id === feeId ? { ...f, ...patch } : f));
      });
    },

    addCustomFee(dealId) {
      const id = uuidv4();
      mutateDeal(dealId, deal => {
        deal.fees = [...deal.fees, { id, type: 'custom', label: '', enabled: null }];
      });
      return id;
    },

    removeCustomFee(dealId, feeId) {
      mutateDeal(dealId, deal => {
        const fee = deal.fees.find(f => f.id === feeId);
        if (fee?.type !== 'custom') return; // guard: only custom fees are removable
        deal.fees = deal.fees.filter(f => f.id !== feeId);
      });
    },

    applyFeeTemplate(dealId, fees) {
      mutateDeal(dealId, deal => {
        deal.fees = fees.map(f => ({ ...f, id: uuidv4() }));
      });
      get().addAuditEntry(dealId, 'fee_template_applied');
    },

    // ── Completion flags ───────────────────────────────────────────────────

    setSectionComplete(dealId, section, complete) {
      mutateDeal(dealId, deal => {
        if (section === 'A') deal.sectionAComplete = complete;
        if (section === 'B') deal.sectionBComplete = complete;
        if (section === 'C') deal.sectionCComplete = complete;
      });
    },

    // ── Module lock ────────────────────────────────────────────────────────

    lockEconomics(dealId, lockedBy) {
      const ts = new Date().toISOString();
      const entry: AuditEntry = {
        id:     uuidv4(),
        ts,
        action: 'locked',
        note:   lockedBy,
      };
      mutateDeal(dealId, deal => {
        deal.lockedAt  = ts;
        deal.lockedBy  = lockedBy;
        deal.auditTrail = [...deal.auditTrail, entry];
      });
    },

    unlockEconomics(dealId, reason) {
      const ts = new Date().toISOString();
      const entry: AuditEntry = {
        id:     uuidv4(),
        ts,
        action: 'unlocked',
        note:   reason,
      };
      mutateDeal(dealId, deal => {
        deal.lockedAt  = undefined;
        deal.lockedBy  = undefined;
        deal.auditTrail = [...deal.auditTrail, entry];
      });
    },

    // ── Pref equity warning ────────────────────────────────────────────────

    markPrefEquityWarningSeen(dealId) {
      mutateDeal(dealId, deal => {
        deal.hasSeenPrefEquityWarning = true;
      });
    },

    // ── Exit scenarios ─────────────────────────────────────────────────────

    addExitScenario(dealId, assumptions, name) {
      const id = uuidv4();
      mutateDeal(dealId, deal => {
        if (!deal.exitScenarios) deal.exitScenarios = [];
        deal.exitScenarios = [
          ...deal.exitScenarios,
          {
            id,
            name: name ?? `Scenario ${deal.exitScenarios.length + 1}`,
            assumptions,
            createdAt: new Date().toISOString(),
          },
        ];
      });
      return id;
    },

    updateExitScenario(dealId, scenarioId, patch) {
      mutateDeal(dealId, deal => {
        if (!deal.exitScenarios) return;
        deal.exitScenarios = deal.exitScenarios.map(s =>
          s.id === scenarioId ? { ...s, ...patch } : s
        );
      });
    },

    removeExitScenario(dealId, scenarioId) {
      mutateDeal(dealId, deal => {
        if (!deal.exitScenarios) return;
        deal.exitScenarios = deal.exitScenarios.filter(s => s.id !== scenarioId);
      });
    },

    runProjection(dealId, scenarioId) {
      const deal = get().getDeal(dealId);
      if (!deal) return;
      const scenario = deal.exitScenarios?.find(s => s.id === scenarioId);
      if (!scenario || !deal.profitSplit) return;

      const instruments    = deal.capitalStack?.instruments ?? [];
      const purchasePrice  = deal.capitalStack?.purchasePrice ?? 0;
      const closingCosts   = deal.capitalStack?.closingCosts ?? 0;
      const opReserves     = deal.capitalStack?.operatingReserves ?? 0;
      const capexReserves  = deal.capitalStack?.capexReserves ?? 0;
      const otherUses      = deal.capitalStack?.otherUses ?? 0;
      const lpEquityPct    = deal.capitalStack?.lpEquityPct ?? 0.9;
      const totalDebt      = instruments.reduce((s, i) => s + (i.loanAmount ?? 0), 0);
      // Total project cost (matches Sources & Uses: purchasePrice + closingCosts + reserves)
      const totalCost      = purchasePrice + closingCosts + opReserves + capexReserves + otherUses;
      const totalEquityPlug = Math.max(0, totalCost - totalDebt);
      const closingDate = deal.capitalStack?.closingDate?.slice(0, 7) ??
        new Date().toISOString().slice(0, 7);

      // Year 0 equity reduction: if user supplies partial-year NOI before the hold,
      // auto-compute Year 0 debt service (amortization rows from closingDate through
      // Dec of the closing calendar year) and subtract Year 0 net CF from gross equity.
      let effectiveEquity = totalEquityPlug;
      if (scenario.assumptions.year0Noi && scenario.assumptions.year0Noi > 0) {
        const closingYear  = parseInt(closingDate.slice(0, 4));
        const year0EndDate = `${closingYear}-12`;
        let year0DebtService = 0;
        for (const inst of instruments) {
          const sched = buildAmortizationSchedule(inst);
          year0DebtService += sched.rows
            .filter(r => r.date >= closingDate && r.date <= year0EndDate)
            .reduce((s, r) => s + r.payment, 0);
        }
        const year0NetCf = scenario.assumptions.year0Noi - year0DebtService;
        effectiveEquity  = Math.max(0, totalEquityPlug - year0NetCf);
      }
      const lpEquity = effectiveEquity * lpEquityPct;
      const gpEquity = effectiveEquity * (1 - lpEquityPct);

      // Annual asset management fee — deducted from NCF each hold year
      const totalEquity = lpEquity + gpEquity;
      const annualFeeDeduction = (deal.fees ?? [])
        .filter(f => f.type === 'asset_management' && f.enabled === 'yes')
        .reduce((sum, f) => {
          if (f.basisType === 'flat')         return sum + (f.flatAmount ?? 0);
          if (f.basisType === 'pct_raise')    return sum + (f.rate ?? 0) * totalEquity;
          if (f.basisType === 'pct_purchase') return sum + (f.rate ?? 0) * purchasePrice;
          if (f.basisType === 'pct_cost')     return sum + (f.rate ?? 0) * totalCost;
          return sum;
        }, 0);

      const result = computeProjection(
        deal.profitSplit,
        scenario.assumptions,
        instruments,
        lpEquity,
        gpEquity,
        closingDate,
        annualFeeDeduction,
      );

      mutateDeal(dealId, d => {
        if (!d.exitScenarios) return;
        d.exitScenarios = d.exitScenarios.map(s =>
          s.id === scenarioId ? { ...s, result } : s
        );
      });
    },

    // ── Audit ──────────────────────────────────────────────────────────────

    addAuditEntry(dealId, action, note, changedFields) {
      const entry: AuditEntry = {
        id:    uuidv4(),
        ts:    new Date().toISOString(),
        action,
        note,
        changedFields,
      };
      mutateDeal(dealId, deal => {
        deal.auditTrail = [...deal.auditTrail, entry];
      });
    },

    reset() {
      save([]);
      set({ deals: [] });
    },
  };
});

// ─── Selector helpers (import alongside the store) ────────────────────────────

export function isEconomicsLocked(deal: EconomicsDeal | undefined): boolean {
  return !!deal?.lockedAt;
}

export function isEconomicsComplete(deal: EconomicsDeal | undefined): boolean {
  return !!(deal?.sectionAComplete && deal.sectionBComplete && deal.sectionCComplete);
}

export function canLockEconomics(deal: EconomicsDeal | undefined): boolean {
  return isEconomicsComplete(deal) && !isEconomicsLocked(deal);
}
