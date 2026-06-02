import React, { useEffect, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useEconomicsStore } from '../../../state/economicsStore'
import { validateSectionB } from '../../../utils/economicsValidation'
import { computeSourcesAndUses } from '../../../utils/sourcesAndUses'
import { CurrencyInput } from '../../components/CurrencyInput'
import type {
  ProfitSplitConfig,
  PrefConfig,
  PrefType,
  PrefCompounding,
  WaterfallConfig,
  WaterfallMode,
  WaterfallTier,
  CapitalStack,
} from '../../../state/economicsTypes'

// ─── Display maps ─────────────────────────────────────────────────────────────

const PREF_TYPE_LABELS: Record<PrefType, string> = {
  none:          'None',
  simple:        'Simple',
  compound:      'Compound',
  accrual:       'Accrual',
  participating: 'Participating',
}

const PREF_TYPE_DESCRIPTIONS: Record<PrefType, string> = {
  none:          'No preferred return — all profits go straight to the waterfall.',
  simple:        'Non-compounding annual pref on LP equity (most common).',
  compound:      'Unpaid preferred return compounds at the selected frequency.',
  accrual:       'Pref accrues and is paid in full at exit event.',
  participating: 'LP receives pref plus participates in upside alongside GP.',
}

const COMPOUNDING_OPTIONS: { value: PrefCompounding; label: string }[] = [
  { value: 'monthly',   label: 'Monthly'   },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annual',    label: 'Annual'    },
]

// ─── Default seeds ────────────────────────────────────────────────────────────

const DEFAULT_SPLIT: ProfitSplitConfig = {
  pref:      { type: 'none' },
  waterfall: { mode: 'simple', simpleLpSplit: 70 },
}

function defaultTier(index: number, hurdleIrr?: number): WaterfallTier {
  return {
    id:        uuidv4(),
    label:     `Tier ${index + 1}`,
    hurdleIrr,
    lpSplit:   70,
    gpSplit:   30,
  }
}

function defaultAdvancedTiers(): WaterfallTier[] {
  return [
    { id: uuidv4(), label: 'Tier 1', hurdleIrr: 0.08, lpSplit: 80, gpSplit: 20 },
    { id: uuidv4(), label: 'Tier 2', hurdleIrr: 0.12, lpSplit: 70, gpSplit: 30 },
    { id: uuidv4(), label: 'Tier 3', hurdleIrr: 0.18, lpSplit: 50, gpSplit: 50 },
  ]
}

// ─── Rate helpers (decimal ↔ display string) ──────────────────────────────────

function toDisplayRate(v?: number): string {
  if (v == null || v === 0) return ''
  return String(parseFloat((v * 100).toFixed(4)))
}

function fromDisplayRate(s: string): number {
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n / 100
}

// ─── Sub-component: Split bar visualization ───────────────────────────────────

const SplitBar: React.FC<{ lp: number; gp: number }> = ({ lp, gp }) => (
  <div className="split-bar" title={`LP ${lp}% / GP ${gp}%`}>
    <div className="split-bar-lp" style={{ width: `${Math.min(lp, 100)}%` }}>
      {lp >= 15 && <span>{lp}%</span>}
    </div>
    <div className="split-bar-gp" style={{ width: `${Math.min(gp, 100)}%` }}>
      {gp >= 15 && <span>{gp}%</span>}
    </div>
  </div>
)

// ─── Sub-component: Waterfall preview (right rail) ───────────────────────────

interface PreviewProps {
  config:              ProfitSplitConfig
  hasPrefEquityInst:   boolean
}

const WaterfallPreview: React.FC<PreviewProps> = ({ config, hasPrefEquityInst }) => {
  const { pref, waterfall } = config
  const hasPref  = pref.type !== 'none' && !!pref.rate
  const advanced = waterfall.mode === 'advanced'
  const tiers    = waterfall.tiers ?? []

  function toFrequencyLabel(v?: PrefCompounding): string | null {
    if (!v) return null
    return v.charAt(0).toUpperCase() + v.slice(1)
  }

  function prefTag(): string | null {
    if (pref.type === 'none') return null
    if (pref.type === 'simple' || pref.type === 'participating') {
      const label = toFrequencyLabel(pref.paymentFrequency)
      return label ? `(${label})` : null
    }
    if (pref.type === 'compound') {
      const label = toFrequencyLabel(pref.compounding)
      return label ? `(${label})` : null
    }
    if (pref.type === 'accrual') {
      return '(at exit)'
    }
    return null
  }

  const prefTagLabel = prefTag()

  return (
    <div className="waterfall-preview">
      <div className="waterfall-preview-title">Distribution Structure</div>
      <p className="waterfall-preview-subtitle">Order of cash flow priority</p>

      <div className="waterfall-preview-stack">

        {/* Tier 0 — Pref equity instruments */}
        {hasPrefEquityInst && (
          <div className="wf-row wf-row--tier0">
            <div className="wf-row-badge wf-row-badge--0">T0</div>
            <div className="wf-row-body">
              <div className="wf-row-label">Preferred Equity Return</div>
              <div className="wf-row-desc">Priority return before LP common equity</div>
              <div className="wf-row-split-label">100% to pref equity holders</div>
            </div>
          </div>
        )}

        {/* Preferred return tier */}
        {hasPref && (
          <div className="wf-row wf-row--pref">
            <div className="wf-row-badge wf-row-badge--pref">P</div>
            <div className="wf-row-body">
              <div className="wf-row-label">
                {toDisplayRate(pref.rate)}% Preferred Return
                {prefTagLabel && <span className="wf-row-tag">{prefTagLabel}</span>}
              </div>
              <div className="wf-row-desc">
                {PREF_TYPE_DESCRIPTIONS[pref.type]}
              </div>
              <div className="wf-row-split-label">100% to LPs until pref satisfied</div>
            </div>
          </div>
        )}

        {/* Simple mode — single split */}
        {!advanced && (
          <div className="wf-row wf-row--simple">
            <div className="wf-row-badge wf-row-badge--1">T1</div>
            <div className="wf-row-body">
              <div className="wf-row-label">
                {hasPref ? 'Remaining profits' : 'All profits'}
              </div>
              <SplitBar
                lp={waterfall.simpleLpSplit ?? 0}
                gp={100 - (waterfall.simpleLpSplit ?? 0)}
              />
            </div>
          </div>
        )}

        {/* Advanced mode — tiers */}
        {advanced && tiers.map((tier, i) => {
          const prevHurdle = tiers[i - 1]?.hurdleIrr
          const hasHurdle  = tier.hurdleIrr != null
          const rangeLabel = !hasHurdle
            ? (prevHurdle != null ? `Above ${toDisplayRate(prevHurdle)}% IRR` : 'All profits')
            : (prevHurdle != null
              ? `${toDisplayRate(prevHurdle)}–${toDisplayRate(tier.hurdleIrr!)}% IRR`
              : `Below ${toDisplayRate(tier.hurdleIrr!)}% IRR`)

          return (
            <div key={tier.id} className="wf-row wf-row--tier">
              <div className={`wf-row-badge wf-row-badge--${Math.min(i + 1, 9)}`}>
                T{i + 1}
              </div>
              <div className="wf-row-body">
                <div className="wf-row-label">{tier.label || `Tier ${i + 1}`}</div>
                <div className="wf-row-desc">{rangeLabel}</div>
                <SplitBar lp={tier.lpSplit} gp={tier.gpSplit} />
              </div>
            </div>
          )
        })}

        {advanced && tiers.length === 0 && (
          <div className="wf-row-empty">Add at least one tier to build the waterfall.</div>
        )}

        {/* Catch-up */}
        {waterfall.hasCatchUp && (
          <div className="wf-flag wf-flag--catchup">
            <span className="wf-flag-icon" aria-hidden="true">↩</span>
            Catch-up target {waterfall.catchUpTargetPct ?? 20}% / speed {waterfall.catchUpSpeedPct ?? 50}%
          </div>
        )}

        {/* Clawback */}
        {waterfall.hasClawback && (
          <div className="wf-flag wf-flag--clawback">
            <span className="wf-flag-icon" aria-hidden="true">⚑</span>
            Clawback provision <span className="wf-flag-note">(flag only — full math in v2)</span>
          </div>
        )}

      </div>
    </div>
  )
}

// ─── Sub-component: Single tier row ──────────────────────────────────────────

interface TierRowProps {
  tier:       WaterfallTier
  index:      number
  totalTiers: number
  prevTier?:  WaterfallTier
  locked:     boolean
  onChange:   (patch: Partial<WaterfallTier>) => void
  onRemove:   () => void
}

const TierRow: React.FC<TierRowProps> = ({ tier, index, totalTiers, prevTier, locked, onChange, onRemove }) => {
  const splitTotal = (tier.lpSplit ?? 0) + (tier.gpSplit ?? 0)
  const splitError = Math.abs(splitTotal - 100) > 0.01
    ? `LP + GP = ${splitTotal}% (must equal 100%)`
    : null

  const hurdleError = prevTier?.hurdleIrr != null && tier.hurdleIrr != null
    && tier.hurdleIrr <= prevTier.hurdleIrr
    ? 'Hurdle IRR must be higher than previous tier.'
    : null

  const isFinalTier = index === totalTiers - 1

  function handleLpChange(v: string) {
    const lp = Math.min(100, Math.max(0, parseFloat(v) || 0))
    onChange({ lpSplit: lp, gpSplit: Math.round((100 - lp) * 100) / 100 })
  }

  return (
    <div className={`tier-row${splitError || hurdleError ? ' tier-row--error' : ''}`}>
      <div className="tier-row-inner">
        {/* Drag handle placeholder */}
        <span className="tier-drag-handle" aria-hidden="true">⠿</span>

        {/* Tier number badge */}
        <span className={`tier-num-badge tier-num-badge--${Math.min(index + 1, 9)}`}>
          T{index + 1}
        </span>

        {/* Label */}
        <div className="tier-cell tier-cell--label">
          <input
            type="text"
            className="field-input field-input--sm"
            value={tier.label}
            placeholder={`Tier ${index + 1}`}
            disabled={locked}
            onChange={e => onChange({ label: e.target.value })}
          />
        </div>

        {/* Hurdle IRR */}
        <div className="tier-cell tier-cell--hurdle">
          <div style={{ position: 'relative' }}>
            <input
              type="number"
              className={`field-input field-input--sm${hurdleError ? ' field-input--error' : ''}`}
              value={toDisplayRate(tier.hurdleIrr)}
              min={0}
              max={100}
              step={1}
              placeholder="No hurdle"
              disabled={locked}
              onChange={e => {
                const v = e.target.value
                onChange({ hurdleIrr: v === '' ? undefined : fromDisplayRate(v) })
              }}
            />
            <span className="tier-pct-suffix">%</span>
          </div>
          {hurdleError && <div className="tier-inline-error">{hurdleError}</div>}
          {isFinalTier && !hurdleError && (
            <div className="tier-inline-hint">Final tier — applies to all distributions above this threshold.</div>
          )}
        </div>

        {/* LP split */}
        <div className="tier-cell tier-cell--split">
          <div style={{ position: 'relative' }}>
            <input
              type="number"
              className={`field-input field-input--sm${splitError ? ' field-input--error' : ''}`}
              value={tier.lpSplit}
              min={0}
              max={100}
              step={1}
              disabled={locked}
              onChange={e => handleLpChange(e.target.value)}
            />
            <span className="tier-pct-suffix">%</span>
          </div>
        </div>

        {/* GP split (auto) */}
        {/* Remove */}
        {!locked && (
          <button
            type="button"
            className="btn btn-ghost btn-xs tier-remove-btn"
            onClick={() => {
              const tierName = tier.label || `Tier ${index + 1}`
              if (window.confirm(`Remove ${tierName}?`)) onRemove()
            }}
            aria-label={`Remove ${tier.label || `Tier ${index + 1}`}`}
          >
            ✕
          </button>
        )}
      </div>

      {splitError && (
        <div className="tier-inline-error tier-inline-error--row">{splitError}</div>
      )}
    </div>
  )
}

// ─── Live preview math ────────────────────────────────────────────────────────

interface PreviewResult {
  totalProceeds:  number
  totalProfit:    number
  prefReturn:     number
  profitAfterPref: number
  lpShare:        number
  gpShare:        number
  lpTotal:        number
  lpEM:           number
  impliedIrr:     number
  appliedTierIdx: number   // -1 = simple mode
}

function calcPrefReturn(equity: number, pref: PrefConfig, years: number): number {
  if (pref.type === 'none' || !pref.rate || equity <= 0 || years <= 0) return 0
  if (pref.type === 'simple' || pref.type === 'participating') {
    return equity * pref.rate * years
  }
  if (pref.type === 'accrual' && !pref.accrualCompounds) {
    return equity * pref.rate * years
  }
  // compound / accrual — compound to the hold period
  const n = pref.compounding === 'monthly' ? 12 : pref.compounding === 'quarterly' ? 4 : 1
  const rn = pref.rate / n
  return equity * (Math.pow(1 + rn, n * years) - 1)
}

function runWaterfallPreview(
  equity:    number,
  multiple:  number,
  holdYears: number,
  config:    ProfitSplitConfig,
): PreviewResult {
  const { pref, waterfall } = config
  const totalProceeds   = equity * multiple
  const totalProfit     = Math.max(totalProceeds - equity, 0)
  const prefReturn      = Math.min(calcPrefReturn(equity, pref, holdYears), totalProfit)
  const profitAfterPref = Math.max(totalProfit - prefReturn, 0)

  // Implied IRR (MOIC-based approximation)
  const impliedIrr = equity > 0 && holdYears > 0
    ? Math.pow(totalProceeds / equity, 1 / holdYears) - 1
    : 0

  let lpShare = 0, gpShare = 0, appliedTierIdx = -1

  if (waterfall.mode === 'simple') {
    const lpPct = (waterfall.simpleLpSplit ?? 0) / 100
    lpShare = profitAfterPref * lpPct
    gpShare = profitAfterPref * (1 - lpPct)
  } else {
    const tiers = waterfall.tiers ?? []
    // Find highest qualifying tier (last tier whose hurdle ≤ implied IRR, or tier with no hurdle)
    let tierIdx = tiers.length > 0 ? 0 : -1
    for (let i = 0; i < tiers.length; i++) {
      const hurdle = tiers[i].hurdleIrr
      if (hurdle == null || impliedIrr >= hurdle) tierIdx = i
    }
    if (tierIdx >= 0) {
      const t = tiers[tierIdx]
      lpShare = profitAfterPref * (t.lpSplit / 100)
      gpShare = profitAfterPref * (t.gpSplit / 100)
      appliedTierIdx = tierIdx
    }
  }

  // Participating pref: LP also participates in residual after the regular LP split above
  // (pref.type === 'participating' means LP gets pref PLUS their pro-rata waterfall share)
  // The lpShare already includes the participating LP's waterfall portion — no extra calc needed.

  const lpTotal = equity + prefReturn + lpShare
  const lpEM    = equity > 0 ? lpTotal / equity : 0

  return {
    totalProceeds, totalProfit, prefReturn, profitAfterPref,
    lpShare, gpShare, lpTotal, lpEM, impliedIrr, appliedTierIdx,
  }
}

// ─── Sub-component: Live return preview panel ─────────────────────────────────

interface LivePreviewProps {
  config:      ProfitSplitConfig
  capitalStack?: CapitalStack
}

function fmt(n: number): string {
  return '$' + Math.round(n).toLocaleString()
}
function fmtPct(n: number): string {
  return (n * 100).toFixed(1) + '%'
}
function fmtX(n: number): string {
  return n.toFixed(2) + 'x'
}

const LivePreview: React.FC<LivePreviewProps> = ({ config, capitalStack }) => {
  const suEquity = capitalStack ? computeSourcesAndUses(capitalStack).sources.equity : 0
  const [equityOverride, setEquityOverride] = useState<number>(0)
  const [multiple, setMultiple]             = useState<number>(1.5)
  const [holdYears, setHoldYears]           = useState<number>(5)

  const effectiveEquity = equityOverride > 0 ? equityOverride : suEquity
  const hasEquity       = effectiveEquity > 0
  const tiers           = config.waterfall.tiers ?? []

  const result = hasEquity
    ? runWaterfallPreview(effectiveEquity, multiple, holdYears, config)
    : null

  return (
    <div className="lp-preview">
      <div className="lp-preview-title">Return Scenario</div>
      <p className="lp-preview-subtitle">Quick check — not a full IRR model</p>

      {/* Inputs */}
      <div className="lp-preview-inputs">
        <div className="lp-preview-field">
          <label className="lp-preview-label">
            Equity Invested
            {suEquity > 0 && !equityOverride && (
              <span className="lp-preview-source"> (from S&amp;U)</span>
            )}
          </label>
          <CurrencyInput
            className="field-input field-input--sm"
            value={equityOverride > 0 ? equityOverride : suEquity}
            onChange={v => setEquityOverride(v === suEquity ? 0 : v)}
          />
        </div>

        <div className="lp-preview-field">
          <label className="lp-preview-label">Profit Multiple</label>
          <div style={{ position: 'relative' }}>
            <input
              type="number"
              className="field-input field-input--sm"
              value={multiple}
              min={1}
              max={10}
              step={1}
              onChange={e => {
                const v = parseFloat(e.target.value)
                if (!isNaN(v) && v >= 1) setMultiple(v)
              }}
            />
            <span className="tier-pct-suffix">x</span>
          </div>
        </div>

        <div className="lp-preview-field">
          <label className="lp-preview-label">Hold Period</label>
          <div style={{ position: 'relative' }}>
            <input
              type="number"
              className="field-input field-input--sm"
              value={holdYears}
              min={1}
              max={30}
              step={1}
              onChange={e => {
                const v = parseInt(e.target.value, 10)
                if (!isNaN(v) && v >= 1) setHoldYears(v)
              }}
            />
            <span className="tier-pct-suffix" style={{ fontSize: 11 }}>yr</span>
          </div>
        </div>
      </div>

      {!hasEquity && (
        <div className="lp-preview-empty">
          Complete Section A to see return projections, or enter an equity amount above.
        </div>
      )}

      {result && (
        <>
          {/* Waterfall breakdown */}
          <div className="lp-preview-stack">
            <div className="lp-stack-row">
              <span className="lp-stack-label">Total Proceeds</span>
              <span className="lp-stack-value">{fmt(result.totalProceeds)}</span>
            </div>
            <div className="lp-stack-row lp-stack-row--sub">
              <span className="lp-stack-label">− Return of Equity</span>
              <span className="lp-stack-value lp-stack-value--muted">{fmt(effectiveEquity)}</span>
            </div>
            <div className="lp-stack-row lp-stack-row--total">
              <span className="lp-stack-label">Total Profit</span>
              <span className="lp-stack-value">{fmt(result.totalProfit)}</span>
            </div>

            {result.prefReturn > 0 && (
              <>
                <div className="lp-stack-divider" />
                <div className="lp-stack-row">
                  <span className="lp-stack-label lp-stack-label--pref">
                    Pref Return ({config.pref.type})
                  </span>
                  <span className="lp-stack-value lp-stack-value--pref">
                    {fmt(result.prefReturn)}
                  </span>
                </div>
                <div className="lp-stack-row lp-stack-row--sub">
                  <span className="lp-stack-label">Profit After Pref</span>
                  <span className="lp-stack-value">{fmt(result.profitAfterPref)}</span>
                </div>
              </>
            )}

            <div className="lp-stack-divider" />

            {/* Applied tier label for advanced mode */}
            {config.waterfall.mode === 'advanced' && result.appliedTierIdx >= 0 && (
              <div className="lp-stack-tier-label">
                Applied: {tiers[result.appliedTierIdx]?.label || `Tier ${result.appliedTierIdx + 1}`}
                {' '}({fmtPct(impliedIrrFromResult(result))} implied IRR)
              </div>
            )}

            <div className="lp-stack-row">
              <span className="lp-stack-label lp-stack-label--lp">LP Profit Share</span>
              <span className="lp-stack-value lp-stack-value--lp">{fmt(result.lpShare)}</span>
            </div>
            <div className="lp-stack-row">
              <span className="lp-stack-label lp-stack-label--gp">GP Profit Share</span>
              <span className="lp-stack-value lp-stack-value--gp">{fmt(result.gpShare)}</span>
            </div>
          </div>

          {/* Summary metrics */}
          <div className="lp-preview-metrics">
            <div className="lp-metric">
              <div className="lp-metric-value">{fmtX(result.lpEM)}</div>
              <div className="lp-metric-label">LP Equity Multiple</div>
            </div>
            <div className="lp-metric">
              <div className="lp-metric-value">{fmt(result.lpTotal)}</div>
              <div className="lp-metric-label">Total LP Return</div>
            </div>
            <div className="lp-metric">
              <div className="lp-metric-value">{fmt(result.gpShare)}</div>
              <div className="lp-metric-label">GP Promote</div>
            </div>
          </div>

          <div className="lp-preview-disclaimer">
            Simplified model. Assumes equity = LP equity. Full IRR + carry in v2.
          </div>
        </>
      )}
    </div>
  )
}

// Helper: extract implied IRR from result (used in JSX)
function impliedIrrFromResult(r: PreviewResult): number {
  return r.impliedIrr
}

// ─── Main Section B component ─────────────────────────────────────────────────

interface Props {
  dealId: string
  locked: boolean
  setTab: (tab: 'A' | 'B' | 'C') => void
}

export const SectionB: React.FC<Props> = ({ dealId, locked, setTab }) => {
  const deal = useEconomicsStore(s => s.deals.find(d => d.dealId === dealId))
  const { updateProfitSplit, setSectionComplete } = useEconomicsStore()
  const [notification, setNotification] = useState<string | null>(null)

  // Seed default on first open
  useEffect(() => {
    if (deal && !deal.profitSplit) {
      updateProfitSplit(dealId, DEFAULT_SPLIT)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!deal || !deal.profitSplit) return null

  const profitSplit = deal.profitSplit
  const { pref, waterfall } = profitSplit

  // Pref equity instruments from Section A → Tier 0
  const prefEquityInsts = deal.capitalStack?.instruments.filter(i => i.position === 'pref_equity') ?? []
  const hasPrefEquityInst = prefEquityInsts.length > 0

  // Validation
  const errors      = validateSectionB(deal)
  const canComplete = errors.length === 0

  // Auto-sync: pref → Tier 1 hurdle mismatch detection
  const showSyncBanner =
    waterfall.mode === 'advanced' &&
    pref.type !== 'none' &&
    !!pref.rate &&
    (waterfall.tiers?.length ?? 0) > 0 &&
    Math.abs((waterfall.tiers![0].hurdleIrr ?? -1) - pref.rate) > 0.0001

  // ── Patch helpers ──────────────────────────────────────────────────────────

  function patchPref(patch: Partial<PrefConfig>) {
    updateProfitSplit(dealId, { pref: { ...pref, ...patch }, waterfall })
    if (deal!.sectionBComplete) setSectionComplete(dealId, 'B', false)
  }

  function patchWaterfall(patch: Partial<WaterfallConfig>) {
    updateProfitSplit(dealId, { pref, waterfall: { ...waterfall, ...patch } })
    if (deal!.sectionBComplete) setSectionComplete(dealId, 'B', false)
  }

  // ── Pref handlers ──────────────────────────────────────────────────────────

  function handlePrefTypeChange(type: PrefType) {
    if (type === 'none') {
      patchPref({
        type,
        rate: undefined,
        paymentFrequency: undefined,
        accrualCompounds: undefined,
        compounding: undefined,
      })
      return
    }

    if (type === 'simple' || type === 'participating') {
      patchPref({
        type,
        rate: pref.rate ?? 0.08,
        paymentFrequency: pref.paymentFrequency ?? 'quarterly',
        accrualCompounds: undefined,
        compounding: undefined,
      })
      return
    }

    if (type === 'compound') {
      patchPref({
        type,
        rate: pref.rate ?? 0.08,
        paymentFrequency: undefined,
        accrualCompounds: undefined,
        compounding: pref.compounding ?? 'quarterly',
      })
      return
    }

    patchPref({
      type,
      rate: pref.rate ?? 0.08,
      paymentFrequency: undefined,
      accrualCompounds: pref.accrualCompounds ?? false,
      compounding: pref.compounding ?? 'quarterly',
    })
  }

  // ── Waterfall handlers ─────────────────────────────────────────────────────

  function handleModeChange(mode: WaterfallMode) {
    if (mode === 'advanced' && (!waterfall.tiers || waterfall.tiers.length === 0)) {
      // Seed default market-style tiers
      patchWaterfall({
        mode,
        tiers: defaultAdvancedTiers(),
      })
    } else {
      patchWaterfall({ mode })
    }
  }

  function handleSimpleLpChange(val: string) {
    const lp = Math.min(100, Math.max(0, parseFloat(val) || 0))
    patchWaterfall({ simpleLpSplit: lp })
  }

  function handleTierChange(id: string, patch: Partial<WaterfallTier>) {
    patchWaterfall({
      tiers: (waterfall.tiers ?? []).map(t => t.id === id ? { ...t, ...patch } : t),
    })
  }

  function handleTierRemove(id: string) {
    patchWaterfall({
      tiers: (waterfall.tiers ?? []).filter(t => t.id !== id),
    })
  }

  function handleAddTier() {
    const currentTiers = waterfall.tiers ?? []
    if (currentTiers.length >= 10) return
    patchWaterfall({ tiers: [...currentTiers, defaultTier(currentTiers.length)] })
  }

  function handleSyncPrefToTier1() {
    if (!pref.rate || !waterfall.tiers?.length) return
    patchWaterfall({
      tiers: waterfall.tiers.map((t, i) =>
        i === 0 ? { ...t, hurdleIrr: pref.rate } : t
      ),
    })
    setNotification('Tier 1 hurdle synced to pref rate.')
    setTimeout(() => setNotification(null), 3000)
  }

  function handleComplete() {
    if (!canComplete) return
    setSectionComplete(dealId, 'B', true)
    setNotification('Section B complete.')
    setTab('C')
    setTimeout(() => setNotification(null), 3000)
  }

  const tiers = waterfall.tiers ?? []
  const gpAuto = Math.round((100 - (waterfall.simpleLpSplit ?? 0)) * 100) / 100

  return (
    <div>
      <div className="econ-a-layout">
        <div className="econ-main">

          {/* ── Preferred Return ── */}
          <div className="form-section">
            <h2 className="form-section-title">Preferred Return</h2>

            {/* Pref type selector */}
            <div className="field-group">
              <label className="field-label">Preferred Return Type</label>
              <div className="pref-type-group" role="group" aria-label="Preferred return type">
                {(Object.keys(PREF_TYPE_LABELS) as PrefType[]).map(t => (
                  <button
                    key={t}
                    type="button"
                    disabled={locked}
                    className={['pref-type-btn', pref.type === t ? 'pref-type-btn--active' : ''].filter(Boolean).join(' ')}
                    onClick={() => handlePrefTypeChange(t)}
                  >
                    {PREF_TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
              {pref.type && (
                <p className="field-hint">{PREF_TYPE_DESCRIPTIONS[pref.type]}</p>
              )}
            </div>

            {/* Rate + compounding (conditional) */}
            {pref.type !== 'none' && (
              <div className="instrument-form-grid" style={{ marginTop: 16 }}>
                <div className="field-group">
                  <label className="field-label">Annual Preferred Rate (%)</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="number"
                      className="field-input"
                      value={toDisplayRate(pref.rate)}
                      min={0}
                      max={50}
                      step={1}
                      placeholder="e.g. 8.0"
                      disabled={locked}
                      onChange={e => patchPref({ rate: fromDisplayRate(e.target.value) })}
                    />
                    <span className="tier-pct-suffix" style={{ right: 12 }}>%</span>
                  </div>
                  <p className="field-hint">Enter as percentage — e.g. 8.0 for 8.000%</p>
                </div>

                {(pref.type === 'simple' || pref.type === 'participating') && (
                  <div className="field-group">
                    <label className="field-label">Payment Frequency</label>
                    <div className="waterfall-mode-toggle" role="group">
                      {COMPOUNDING_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          disabled={locked}
                          className={[
                            'waterfall-mode-btn',
                            (pref.paymentFrequency ?? 'quarterly') === opt.value ? 'waterfall-mode-btn--active' : '',
                          ].filter(Boolean).join(' ')}
                          onClick={() => patchPref({ paymentFrequency: opt.value })}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {pref.type === 'compound' && (
                  <div className="field-group">
                    <label className="field-label">Compounding Period</label>
                    <div className="waterfall-mode-toggle" role="group">
                      {COMPOUNDING_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          disabled={locked}
                          className={[
                            'waterfall-mode-btn',
                            (pref.compounding ?? 'quarterly') === opt.value ? 'waterfall-mode-btn--active' : '',
                          ].filter(Boolean).join(' ')}
                          onClick={() => patchPref({ compounding: opt.value })}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {pref.type === 'accrual' && (
                  <div className="field-group">
                    <label className="field-label">Does unpaid pref compound?</label>
                    <div className="waterfall-mode-toggle" role="group">
                      <button
                        type="button"
                        disabled={locked}
                        className={[
                          'waterfall-mode-btn',
                          pref.accrualCompounds === true ? 'waterfall-mode-btn--active' : '',
                        ].filter(Boolean).join(' ')}
                        onClick={() => patchPref({ accrualCompounds: true, compounding: pref.compounding ?? 'quarterly' })}
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        disabled={locked}
                        className={[
                          'waterfall-mode-btn',
                          pref.accrualCompounds === false ? 'waterfall-mode-btn--active' : '',
                        ].filter(Boolean).join(' ')}
                        onClick={() => patchPref({ accrualCompounds: false })}
                      >
                        No
                      </button>
                    </div>
                    {pref.accrualCompounds === false && (
                      <p className="field-hint">Unpaid preferred return accrues without compounding.</p>
                    )}
                  </div>
                )}

                {pref.type === 'accrual' && pref.accrualCompounds && (
                  <div className="field-group">
                    <label className="field-label">Compounding Period</label>
                    <div className="waterfall-mode-toggle" role="group">
                      {COMPOUNDING_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          disabled={locked}
                          className={[
                            'waterfall-mode-btn',
                            (pref.compounding ?? 'quarterly') === opt.value ? 'waterfall-mode-btn--active' : '',
                          ].filter(Boolean).join(' ')}
                          onClick={() => patchPref({ compounding: opt.value })}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Waterfall Distribution ── */}
          <div className="form-section">
            <h2 className="form-section-title">Waterfall Distribution</h2>

            {/* Mode toggle */}
            <div className="field-group">
              <label className="field-label">Waterfall Mode</label>
              <div className="waterfall-mode-toggle" role="group" aria-label="Waterfall mode">
                <button
                  type="button"
                  disabled={locked}
                  className={['waterfall-mode-btn', waterfall.mode === 'simple' ? 'waterfall-mode-btn--active' : ''].filter(Boolean).join(' ')}
                  onClick={() => handleModeChange('simple')}
                >
                  Simple
                </button>
                <button
                  type="button"
                  disabled={locked}
                  className={['waterfall-mode-btn', waterfall.mode === 'advanced' ? 'waterfall-mode-btn--active' : ''].filter(Boolean).join(' ')}
                  onClick={() => handleModeChange('advanced')}
                >
                  Advanced
                </button>
              </div>
              <p className="field-hint">
                {waterfall.mode === 'simple'
                  ? 'Single LP/GP split after preferred return.'
                  : 'Multiple tiers with IRR hurdles and tiered promote structure.'}
              </p>
            </div>

            {/* ── Simple mode ── */}
            {waterfall.mode === 'simple' && (
              <div className="instrument-form-grid" style={{ marginTop: 16 }}>
                <div className="field-group">
                  <label className="field-label">LP Split (%)</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="number"
                      className="field-input"
                      value={waterfall.simpleLpSplit ?? ''}
                      min={0}
                      max={100}
                      step={1}
                      placeholder="e.g. 70"
                      disabled={locked}
                      onChange={e => handleSimpleLpChange(e.target.value)}
                    />
                    <span className="tier-pct-suffix" style={{ right: 12 }}>%</span>
                  </div>
                </div>
                <div className="field-group">
                  <label className="field-label">GP Split</label>
                  <div className="tier-gp-readonly">
                    <span className="tier-gp-display">{gpAuto}%</span>
                  </div>
                </div>
              </div>
            )}

            {/* ── Advanced mode: tier builder ── */}
            {waterfall.mode === 'advanced' && (
              <div style={{ marginTop: 16 }}>

                {/* Column headers */}
                <div className="tier-header-row">
                  <span></span>{/* drag handle col */}
                  <span></span>{/* num badge col */}
                  <span className="tier-header-cell">Label</span>
                  <span
                    className="tier-header-cell"
                    title="Cumulative LP IRR since inception. Split applies to distributions above this threshold up to the next tier."
                  >
                    Hurdle IRR
                  </span>
                  <span className="tier-header-cell">LP Split</span>
                  <span></span>{/* remove col */}
                </div>

                {/* Tier 0 Return of Capital (display only) */}
                <div className="tier-row tier-row--tier0-readonly">
                  <div className="tier-row-inner">
                    <span className="tier-drag-handle" aria-hidden="true"></span>
                    <span className="tier-num-badge tier-num-badge--0">T0</span>
                    <div className="tier-cell tier-cell--label">
                      <span className="tier-ro-value">Return of Capital</span>
                    </div>
                    <div className="tier-cell tier-cell--hurdle">
                      <span className="tier-ro-value">Priority</span>
                    </div>
                    <div className="tier-cell tier-cell--split">
                      <span className="tier-ro-value">100%</span>
                    </div>
                    <span style={{ width: 24 }}></span>
                  </div>
                  <div className="tier-inline-hint">100% to LP until LP unreturned capital is fully returned.</div>
                </div>

                {/* Tier 0 (derived, read-only) */}
                {hasPrefEquityInst && (
                  <div className="tier-row tier-row--tier0-readonly">
                    <div className="tier-row-inner">
                      <span className="tier-drag-handle" aria-hidden="true"></span>
                      <span className="tier-num-badge tier-num-badge--0">T0</span>
                      <div className="tier-cell tier-cell--label">
                        <span className="tier-ro-value">Preferred Equity Return</span>
                      </div>
                      <div className="tier-cell tier-cell--hurdle">
                        <span className="tier-ro-value">Priority</span>
                      </div>
                      <div className="tier-cell tier-cell--split">
                        <span className="tier-ro-value">100%</span>
                      </div>
                      <span style={{ width: 24 }}></span>
                    </div>
                  </div>
                )}

                {/* Editable tiers */}
                <div className="tier-list">
                  {tiers.map((tier, i) => (
                    <TierRow
                      key={tier.id}
                      tier={tier}
                      index={i}
                      totalTiers={tiers.length}
                      prevTier={tiers[i - 1]}
                      locked={locked}
                      onChange={p => handleTierChange(tier.id, p)}
                      onRemove={() => handleTierRemove(tier.id)}
                    />
                  ))}
                </div>

                {tiers.length === 0 && (
                  <div className="info-box" style={{ marginBottom: 12 }}>
                    No tiers yet. Add at least one tier to define the distribution structure.
                  </div>
                )}

                {/* Add tier button */}
                {!locked && tiers.length < 10 && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ marginTop: 8 }}
                    onClick={handleAddTier}
                  >
                    + Add Tier
                  </button>
                )}

                {/* Pref → Tier 1 auto-sync banner */}
                {showSyncBanner && (
                  <div className="pref-sync-banner">
                    <div className="pref-sync-banner-msg">
                      <span aria-hidden="true">⚡</span>
                      Pref rate ({toDisplayRate(pref.rate)}%) differs from Tier 1 hurdle
                      ({tiers[0].hurdleIrr != null
                        ? `${toDisplayRate(tiers[0].hurdleIrr)}%`
                        : 'not set'}).
                    </div>
                    {!locked && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-xs"
                        onClick={handleSyncPrefToTier1}
                      >
                        Sync Tier 1 hurdle
                      </button>
                    )}
                  </div>
                )}

                {/* Catch-up */}
                <div className="instrument-form-section">
                  <div className="instrument-form-section-title">Catch-Up</div>
                  <div className="field-group" style={{ marginBottom: 12 }}>
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={!!waterfall.hasCatchUp}
                        disabled={locked}
                        onChange={e => {
                          const checked = e.target.checked
                          patchWaterfall(
                            checked
                              ? {
                                  hasCatchUp: true,
                                  catchUpTargetPct: waterfall.catchUpTargetPct ?? 20,
                                  catchUpSpeedPct: waterfall.catchUpSpeedPct ?? 50,
                                }
                              : { hasCatchUp: false }
                          )
                        }}
                      />
                      Include a GP catch-up provision
                    </label>
                  </div>
                  {waterfall.hasCatchUp && (
                    <div className="instrument-form-grid">
                      <div className="field-group">
                        <label className="field-label">Catch-up Target (%)</label>
                        <div style={{ position: 'relative' }}>
                          <input
                            type="number"
                            className="field-input"
                            value={waterfall.catchUpTargetPct ?? 20}
                            min={0}
                            max={100}
                            step={1}
                            placeholder="e.g. 20"
                            disabled={locked}
                            onChange={e =>
                              patchWaterfall({ catchUpTargetPct: parseFloat(e.target.value) || 0 })
                            }
                          />
                          <span className="tier-pct-suffix" style={{ right: 12 }}>%</span>
                        </div>
                        <p className="field-hint">GP's target share of profits above pref. Typically 20%.</p>
                      </div>
                      <div className="field-group">
                        <label className="field-label">Catch-up Speed (%)</label>
                        <div style={{ position: 'relative' }}>
                          <input
                            type="number"
                            className="field-input"
                            value={waterfall.catchUpSpeedPct ?? 50}
                            min={0}
                            max={100}
                            step={1}
                            placeholder="e.g. 50"
                            disabled={locked}
                            onChange={e =>
                              patchWaterfall({ catchUpSpeedPct: parseFloat(e.target.value) || 0 })
                            }
                          />
                          <span className="tier-pct-suffix" style={{ right: 12 }}>%</span>
                        </div>
                        <p className="field-hint">Portion of catch-up tier distributions allocated to GP. Common values: 50% (LP-friendly) or 100% (GP-friendly).</p>
                      </div>
                      <div className="field-group" style={{ gridColumn: '1 / -1' }}>
                        <p className="field-hint">
                          GP receives {waterfall.catchUpSpeedPct ?? 50}% of distributions until GP has received {waterfall.catchUpTargetPct ?? 20}% of total profits above pref.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Clawback */}
                <div className="instrument-form-section">
                  <div className="instrument-form-section-title">Clawback</div>
                  <div className="field-group">
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={!!waterfall.hasClawback}
                        disabled={locked}
                        onChange={e => patchWaterfall({ hasClawback: e.target.checked })}
                      />
                      Include a GP clawback provision
                    </label>
                    <p className="field-hint">
                      Clawback flag only in v1 — full recapture math is deferred to v2.
                    </p>
                  </div>
                </div>

              </div>
            )}
          </div>

          {/* ── Validation errors ── */}
          {errors.length > 0 && (
            <div className="econ-section-errors">
              <div className="econ-section-errors-title">Required to complete this section:</div>
              <ul>{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </div>
          )}

          {/* ── Complete / Reopen ── */}
          {deal.sectionBComplete ? (
            <div className="econ-section-complete">
              <span aria-hidden="true">✓</span>
              Section B complete
              {!locked && (
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  style={{ marginLeft: 'auto' }}
                  onClick={() => setSectionComplete(dealId, 'B', false)}
                >
                  Reopen
                </button>
              )}
            </div>
          ) : (
            <div className="econ-section-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={!canComplete || locked}
                onClick={handleComplete}
              >
                Complete Section B
              </button>
            </div>
          )}

          {notification && (
            <div className="notification notification--success" style={{ marginTop: 12 }}>
              {notification}
            </div>
          )}

        </div>{/* /econ-main */}

        {/* ── Right rail: waterfall preview ── */}
        <div className="econ-rail">
          <WaterfallPreview config={profitSplit} hasPrefEquityInst={hasPrefEquityInst} />
        </div>

      </div>

      {/* ── Live return preview (full-width, below two-column layout) ── */}
      <LivePreview config={profitSplit} capitalStack={deal.capitalStack ?? undefined} />

    </div>
  )
}
