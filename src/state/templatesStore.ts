import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type {
  FirmTemplates,
  DebtInstrumentTemplate,
  PrefTemplate,
  WaterfallTemplate,
  FeeTemplate,
} from './economicsTypes';

const STORAGE_KEY = 'equityform:templates';

// ─── Persistence ──────────────────────────────────────────────────────────────

function emptyTemplates(): FirmTemplates {
  return { debtInstruments: [], prefs: [], waterfalls: [], fees: [] };
}

function load(): FirmTemplates {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : emptyTemplates();
  } catch {
    return emptyTemplates();
  }
}

function save(t: FirmTemplates) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
  } catch {
    // Storage quota / private mode — silently ignore
  }
}

// ─── Store interface ──────────────────────────────────────────────────────────

interface TemplatesState {
  templates: FirmTemplates;

  // Debt instrument templates (multiple can be applied per deal)
  addDebtTemplate(t: Omit<DebtInstrumentTemplate, 'id'>): string;
  updateDebtTemplate(id: string, patch: Partial<DebtInstrumentTemplate>): void;
  deleteDebtTemplate(id: string): void;

  // Pref templates
  addPrefTemplate(t: Omit<PrefTemplate, 'id'>): string;
  updatePrefTemplate(id: string, patch: Partial<PrefTemplate>): void;
  deletePrefTemplate(id: string): void;

  // Waterfall templates
  addWaterfallTemplate(t: Omit<WaterfallTemplate, 'id'>): string;
  updateWaterfallTemplate(id: string, patch: Partial<WaterfallTemplate>): void;
  deleteWaterfallTemplate(id: string): void;

  // Fee templates
  addFeeTemplate(t: Omit<FeeTemplate, 'id'>): string;
  updateFeeTemplate(id: string, patch: Partial<FeeTemplate>): void;
  deleteFeeTemplate(id: string): void;

  reset(): void;
}

// ─── Store implementation ─────────────────────────────────────────────────────

export const useTemplatesStore = create<TemplatesState>((set) => {
  function mutate(fn: (t: FirmTemplates) => void) {
    set(state => {
      // Shallow-clone top level and each array so Zustand detects the change
      const templates: FirmTemplates = {
        debtInstruments: [...state.templates.debtInstruments],
        prefs:           [...state.templates.prefs],
        waterfalls:      [...state.templates.waterfalls],
        fees:            [...state.templates.fees],
      };
      fn(templates);
      save(templates);
      return { templates };
    });
  }

  return {
    templates: load(),

    // ── Debt instrument templates ──────────────────────────────────────────

    addDebtTemplate(t) {
      const id = uuidv4();
      mutate(tpls => {
        tpls.debtInstruments = [...tpls.debtInstruments, { ...t, id }];
      });
      return id;
    },

    updateDebtTemplate(id, patch) {
      mutate(tpls => {
        tpls.debtInstruments = tpls.debtInstruments.map(t =>
          t.id === id ? { ...t, ...patch } : t
        );
      });
    },

    deleteDebtTemplate(id) {
      mutate(tpls => {
        tpls.debtInstruments = tpls.debtInstruments.filter(t => t.id !== id);
      });
    },

    // ── Pref templates ─────────────────────────────────────────────────────

    addPrefTemplate(t) {
      const id = uuidv4();
      mutate(tpls => {
        tpls.prefs = [...tpls.prefs, { ...t, id }];
      });
      return id;
    },

    updatePrefTemplate(id, patch) {
      mutate(tpls => {
        tpls.prefs = tpls.prefs.map(t => (t.id === id ? { ...t, ...patch } : t));
      });
    },

    deletePrefTemplate(id) {
      mutate(tpls => {
        tpls.prefs = tpls.prefs.filter(t => t.id !== id);
      });
    },

    // ── Waterfall templates ────────────────────────────────────────────────

    addWaterfallTemplate(t) {
      const id = uuidv4();
      mutate(tpls => {
        tpls.waterfalls = [...tpls.waterfalls, { ...t, id }];
      });
      return id;
    },

    updateWaterfallTemplate(id, patch) {
      mutate(tpls => {
        tpls.waterfalls = tpls.waterfalls.map(t =>
          t.id === id ? { ...t, ...patch } : t
        );
      });
    },

    deleteWaterfallTemplate(id) {
      mutate(tpls => {
        tpls.waterfalls = tpls.waterfalls.filter(t => t.id !== id);
      });
    },

    // ── Fee templates ──────────────────────────────────────────────────────

    addFeeTemplate(t) {
      const id = uuidv4();
      mutate(tpls => {
        tpls.fees = [...tpls.fees, { ...t, id }];
      });
      return id;
    },

    updateFeeTemplate(id, patch) {
      mutate(tpls => {
        tpls.fees = tpls.fees.map(t => (t.id === id ? { ...t, ...patch } : t));
      });
    },

    deleteFeeTemplate(id) {
      mutate(tpls => {
        tpls.fees = tpls.fees.filter(t => t.id !== id);
      });
    },

    reset() {
      save(emptyTemplates());
      set({ templates: emptyTemplates() });
    },
  };
});
