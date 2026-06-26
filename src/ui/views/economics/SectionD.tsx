import React, { useState } from 'react'
import { useEconomicsStore } from '../../../state/economicsStore'
import type {
  ExitScenarioAssumptions,
  ExitEventType,
  SaleValuationMethod,
  RefiSizingMethod,
  SaleConfig,
  ProjectionResult,
  DistributionResult,
  YearProjection,
} from '../../../state/economicsTypes'
import { CurrencyInput } from '../../components/CurrencyInput'

// ─── Formatting helpers ───────────────────────────────────────────────────────

function fmtUSD(n: number | undefined, fallback = '—'): string {
  if (n == null || isNaN(n)) return fallback
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function fmtPct(n: number | undefined, decimals = 1, fallback = '—'): string {
  if (n == null || isNaN(n)) return fallback
  return `${(n * 100).toFixed(decimals)}%`
}

function fmtMult(n: number | undefined, fallback = '—'): string {
  if (n == null || isNaN(n)) return fallback
  return `${n.toFixed(2)}×`
}

// ─── Default assumptions ──────────────────────────────────────────────────────

function defaultSaleConfig(): SaleConfig {
  return {
    valuationMethod: 'cap_rate',
    capRate:         0.055,
    closingCostsPct: 0.02,
  }
}

function defaultAssumptions(): ExitScenarioAssumptions {
  return {
    holdYears:      5,
    beginNoi:       0,
    noiGrowthPct:   0.03,
    reservesPerYear:0,
    eventType:      'SALE',
    eventYear:      5,
    sale: defaultSaleConfig(),
    refi: {
      sizingMethod:      'min_of',   // institutional default per ticket
      target:            0.65,
      newRate:           0.065,
      newAmortYears:     30,
      newTermYears:      10,
      cashOutDistribute: true,
      refiCostPct:       0.01,
      // Per-constraint targets for MIN_OF (all optional; blank = skip that constraint)
      ltvTarget:         0.65,
      dyTarget:          0.09,
      dscrTarget:        1.25,
    },
  }
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  dealId: string
  locked: boolean
}

// ─── Component ────────────────────────────────────────────────────────────────

export const SectionD: React.FC<Props> = ({ dealId, locked }) => {
  const addExitScenario    = useEconomicsStore(s => s.addExitScenario)
  const updateExitScenario = useEconomicsStore(s => s.updateExitScenario)
  const removeExitScenario = useEconomicsStore(s => s.removeExitScenario)
  const runProjection      = useEconomicsStore(s => s.runProjection)
  const deal               = useEconomicsStore(s => s.deals.find(d => d.dealId === dealId))

  const scenarios = deal?.exitScenarios ?? []

  // Local state for the active scenario's assumptions draft
  const [activeId, setActiveId]   = useState<string | null>(scenarios[0]?.id ?? null)
  const [draft, setDraft]         = useState<ExitScenarioAssumptions>(
    scenarios[0]?.assumptions ?? defaultAssumptions()
  )
  const [overrides, setOverrides] = useState<Partial<DistributionResult>>({})
  const [running, setRunning]     = useState(false)

  const activeScenario = scenarios.find(s => s.id === activeId)
  const result: ProjectionResult | undefined = activeScenario?.result

  // ── Handlers ────────────────────────────────────────────────────────────────

  function handleNewScenario() {
    const id = addExitScenario(dealId, defaultAssumptions(), `Scenario ${scenarios.length + 1}`)
    setActiveId(id)
    setDraft(defaultAssumptions())
    setOverrides({})
  }

  function handleSelectScenario(id: string) {
    const s = scenarios.find(sc => sc.id === id)
    if (!s) return
    setActiveId(id)
    setDraft(s.assumptions)
    setOverrides({})
  }

  function handleRun() {
    if (!activeId) return
    updateExitScenario(dealId, activeId, { assumptions: draft })
    setRunning(true)
    // Run is synchronous in the store, but wrap in rAF for UX feedback
    requestAnimationFrame(() => {
      runProjection(dealId, activeId)
      setRunning(false)
    })
  }

  function patchDraft(partial: Partial<ExitScenarioAssumptions>) {
    setDraft(d => ({ ...d, ...partial }))
  }

  function patchSale(partial: Partial<ExitScenarioAssumptions['sale']>) {
    setDraft(d => ({ ...d, sale: { ...(d.sale ?? defaultAssumptions().sale!), ...partial } }))
  }

  function patchRefi(partial: Partial<ExitScenarioAssumptions['refi']>) {
    setDraft(d => ({ ...d, refi: { ...(d.refi ?? defaultAssumptions().refi!), ...partial } }))
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="section-d-root">

      {/* Scenario tabs */}
      <div className="section-d-scenario-bar">
        {scenarios.map(sc => (
          <button
            key={sc.id}
            type="button"
            className={['scenario-tab', activeId === sc.id ? 'scenario-tab--active' : ''].filter(Boolean).join(' ')}
            onClick={() => handleSelectScenario(sc.id)}
          >
            {sc.name}
          </button>
        ))}
        <button
          type="button"
          className="scenario-tab scenario-tab--new"
          onClick={handleNewScenario}
          disabled={locked}
        >
          + New Scenario
        </button>
      </div>

      {scenarios.length === 0 && (
        <div className="section-d-empty">
          <p>No scenarios yet. Click <strong>+ New Scenario</strong> to model an exit or refinance.</p>
        </div>
      )}

      {activeId && (
        <div className="section-d-body">

          {/* ── Left: Inputs ── */}
          <div className="section-d-inputs">
            <h3>Projection Assumptions</h3>

            {/* Hold period */}
            <div className="field-group">
              <label className="field-label">Hold Period (years)</label>
              <input
                type="number"
                className="field-input"
                min={1} max={20}
                value={draft.holdYears}
                onChange={e => patchDraft({ holdYears: Math.min(20, Math.max(1, parseInt(e.target.value) || 1)) })}
                disabled={locked}
              />
            </div>

            {/* Year 1 NOI */}
            <div className="field-group">
              <label className="field-label">Year 1 NOI</label>
              <div className="field-adornment-wrap">
                <span className="field-adornment">$</span>
                <CurrencyInput
                  className="field-input"
                  value={draft.beginNoi}
                  onChange={v => patchDraft({ beginNoi: v })}
                  disabled={locked}
                />
              </div>
            </div>

            {/* NOI growth */}
            <div className="field-group">
              <label className="field-label">NOI Growth (annual %)</label>
              <div className="field-adornment-wrap">
                <input
                  type="number"
                  className="field-input"
                  step={0.1} min={-20} max={50}
                  value={(draft.noiGrowthPct * 100).toFixed(1)}
                  onChange={e => patchDraft({ noiGrowthPct: parseFloat(e.target.value) / 100 || 0 })}
                  disabled={locked}
                />
                <span className="field-adornment field-adornment--right">%</span>
              </div>
            </div>

            {/* Reserves */}
            <div className="field-group">
              <label className="field-label">Annual Reserves / CapEx</label>
              <div className="field-adornment-wrap">
                <span className="field-adornment">$</span>
                <CurrencyInput
                  className="field-input"
                  value={draft.reservesPerYear}
                  onChange={v => patchDraft({ reservesPerYear: v })}
                  disabled={locked}
                />
              </div>
            </div>

            {/* Event type */}
            <div className="field-group">
              <label className="field-label">Exit / Capital Event</label>
              <div className="btn-group">
                {(['none', 'SALE', 'REFI'] as ExitEventType[]).map(et => (
                  <button
                    key={et}
                    type="button"
                    className={['btn btn-sm', draft.eventType === et ? 'btn-primary' : 'btn-secondary'].join(' ')}
                    onClick={() => patchDraft({ eventType: et })}
                    disabled={locked}
                  >
                    {et === 'none' ? 'None' : et}
                  </button>
                ))}
              </div>
            </div>

            {draft.eventType !== 'none' && (
              <div className="field-group">
                <label className="field-label">Event Year</label>
                <input
                  type="number"
                  className="field-input"
                  min={1} max={draft.holdYears}
                  value={draft.eventYear}
                  onChange={e => patchDraft({ eventYear: Math.min(draft.holdYears, Math.max(1, parseInt(e.target.value) || 1)) })}
                  disabled={locked}
                />
              </div>
            )}

            {/* Sale config */}
            {draft.eventType === 'SALE' && draft.sale && (
              <div className="section-d-event-config">
                <h4>Sale Assumptions</h4>

                <div className="field-group">
                  <label className="field-label">Valuation Method</label>
                  <div className="btn-group btn-group--wrap">
                    {([
                      ['cap_rate', 'Cap Rate'],
                      ['per_unit', 'Per Unit'],
                      ['gross_multiple', 'Gross Multiple'],
                      ['direct', 'Direct Value'],
                    ] as [SaleValuationMethod, string][]).map(([val, label]) => (
                      <button
                        key={val}
                        type="button"
                        className={['btn btn-sm', draft.sale?.valuationMethod === val ? 'btn-primary' : 'btn-secondary'].join(' ')}
                        onClick={() => patchSale({ valuationMethod: val })}
                        disabled={locked}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {draft.sale.valuationMethod === 'cap_rate' && (
                  <div className="field-group">
                    <label className="field-label">Exit Cap Rate</label>
                    <div className="field-adornment-wrap">
                      <input
                        type="number"
                        className="field-input"
                        step={0.1} min={0.1} max={20}
                        value={((draft.sale.capRate ?? 0.055) * 100).toFixed(2)}
                        onChange={e => patchSale({ capRate: parseFloat(e.target.value) / 100 || 0 })}
                        disabled={locked}
                      />
                      <span className="field-adornment field-adornment--right">%</span>
                    </div>
                  </div>
                )}

                {draft.sale.valuationMethod === 'per_unit' && (
                  <div className="field-group">
                    <label className="field-label">Value Per Unit ($)</label>
                    <div className="field-adornment-wrap">
                      <span className="field-adornment">$</span>
                      <CurrencyInput
                        className="field-input"
                        value={draft.sale.perUnitValue ?? 0}
                        onChange={v => patchSale({ perUnitValue: v })}
                        disabled={locked}
                      />
                    </div>
                  </div>
                )}

                {draft.sale.valuationMethod === 'gross_multiple' && (
                  <div className="field-group">
                    <label className="field-label">Gross Multiple (× NOI)</label>
                    <input
                      type="number"
                      className="field-input"
                      step={0.1} min={0.1}
                      value={(draft.sale.grossMultiple ?? 1.8).toFixed(1)}
                      onChange={e => patchSale({ grossMultiple: parseFloat(e.target.value) || 1 })}
                      disabled={locked}
                    />
                  </div>
                )}

                {draft.sale.valuationMethod === 'direct' && (
                  <div className="field-group">
                    <label className="field-label">Direct Sale Price ($)</label>
                    <div className="field-adornment-wrap">
                      <span className="field-adornment">$</span>
                      <CurrencyInput
                        className="field-input"
                        value={draft.sale.directValue ?? 0}
                        onChange={v => patchSale({ directValue: v })}
                        disabled={locked}
                      />
                    </div>
                  </div>
                )}

                <div className="field-group">
                  <label className="field-label">Closing Costs</label>
                  <div className="field-adornment-wrap">
                    <input
                      type="number"
                      className="field-input"
                      step={0.1} min={0} max={10}
                      value={((draft.sale.closingCostsPct ?? 0.02) * 100).toFixed(1)}
                      onChange={e => patchSale({ closingCostsPct: parseFloat(e.target.value) / 100 || 0 })}
                      disabled={locked}
                    />
                    <span className="field-adornment field-adornment--right">%</span>
                  </div>
                </div>
              </div>
            )}

            {/* Refi config */}
            {draft.eventType === 'REFI' && draft.refi && (
              <div className="section-d-event-config">
                <h4>Refi Assumptions</h4>

                {/* Sizing method — MIN_OF is institutional default */}
                <div className="field-group">
                  <label className="field-label">Loan Sizing Method</label>
                  <div className="btn-group btn-group--wrap">
                    {([
                      ['min_of',     'MIN_OF (default)'],
                      ['ltv',        'LTV'],
                      ['dscr',       'DSCR'],
                      ['debt_yield', 'Debt Yield'],
                    ] as [RefiSizingMethod, string][]).map(([val, label]) => (
                      <button
                        key={val}
                        type="button"
                        className={['btn btn-sm', draft.refi?.sizingMethod === val ? 'btn-primary' : 'btn-secondary'].join(' ')}
                        onClick={() => patchRefi({ sizingMethod: val })}
                        disabled={locked}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {draft.refi.sizingMethod === 'min_of' && (
                    <p className="field-hint">MIN_OF: lender takes the smallest of each constraint you specify below.</p>
                  )}
                </div>

                {/* Single-target for non-min_of */}
                {draft.refi.sizingMethod !== 'min_of' && (
                  <div className="field-group">
                    <label className="field-label">
                      {draft.refi.sizingMethod === 'ltv' ? 'Target LTV' :
                       draft.refi.sizingMethod === 'dscr' ? 'Min DSCR' : 'Target Debt Yield'}
                    </label>
                    <div className="field-adornment-wrap">
                      <input
                        type="number"
                        className="field-input"
                        step={0.01} min={0.01}
                        value={draft.refi.sizingMethod === 'dscr'
                          ? (draft.refi.target ?? 1.25).toFixed(2)
                          : ((draft.refi.target ?? 0.65) * 100).toFixed(1)
                        }
                        onChange={e => patchRefi({
                          target: draft.refi?.sizingMethod === 'dscr'
                            ? parseFloat(e.target.value) || 1.25
                            : parseFloat(e.target.value) / 100 || 0.65
                        })}
                        disabled={locked}
                      />
                      {draft.refi.sizingMethod !== 'dscr' && (
                        <span className="field-adornment field-adornment--right">%</span>
                      )}
                    </div>
                  </div>
                )}

                {/* MIN_OF per-constraint targets */}
                {draft.refi.sizingMethod === 'min_of' && (
                  <div className="section-d-minof-grid">
                    <div className="field-group">
                      <label className="field-label">LTV Target (optional)</label>
                      <div className="field-adornment-wrap">
                        <input
                          type="number" className="field-input" step={0.5} min={0} max={100}
                          placeholder="e.g. 65"
                          value={draft.refi.ltvTarget != null ? (draft.refi.ltvTarget * 100).toFixed(1) : ''}
                          onChange={e => patchRefi({ ltvTarget: e.target.value ? parseFloat(e.target.value) / 100 : undefined })}
                          disabled={locked}
                        />
                        <span className="field-adornment field-adornment--right">%</span>
                      </div>
                    </div>
                    <div className="field-group">
                      <label className="field-label">Debt Yield Target (optional)</label>
                      <div className="field-adornment-wrap">
                        <input
                          type="number" className="field-input" step={0.5} min={0}
                          placeholder="e.g. 9"
                          value={draft.refi.dyTarget != null ? (draft.refi.dyTarget * 100).toFixed(1) : ''}
                          onChange={e => patchRefi({ dyTarget: e.target.value ? parseFloat(e.target.value) / 100 : undefined })}
                          disabled={locked}
                        />
                        <span className="field-adornment field-adornment--right">%</span>
                      </div>
                    </div>
                    <div className="field-group">
                      <label className="field-label">DSCR Target (optional)</label>
                      <input
                        type="number" className="field-input" step={0.05} min={0}
                        placeholder="e.g. 1.25"
                        value={draft.refi.dscrTarget != null ? draft.refi.dscrTarget.toFixed(2) : ''}
                        onChange={e => patchRefi({ dscrTarget: e.target.value ? parseFloat(e.target.value) : undefined })}
                        disabled={locked}
                      />
                    </div>
                  </div>
                )}

                {/* Property value (required for LTV constraint) */}
                {(draft.refi.sizingMethod === 'ltv' || draft.refi.sizingMethod === 'min_of') && (
                  <div className="field-group">
                    <label className="field-label">
                      Appraised Property Value at Refi
                      {draft.refi.sizingMethod === 'ltv' && <span className="field-required"> *</span>}
                    </label>
                    <div className="field-adornment-wrap">
                      <span className="field-adornment">$</span>
                      <CurrencyInput
                        className="field-input"
                        value={draft.refi.propertyValue ?? 0}
                        onChange={v => patchRefi({ propertyValue: v || undefined })}
                        disabled={locked}
                      />
                    </div>
                    <p className="field-hint">Appraised value used for LTV constraint. Leave blank to skip LTV in MIN_OF.</p>
                  </div>
                )}

                <div className="field-group">
                  <label className="field-label">New Loan Rate</label>
                  <div className="field-adornment-wrap">
                    <input
                      type="number"
                      className="field-input"
                      step={0.125} min={0}
                      value={((draft.refi.newRate ?? 0.065) * 100).toFixed(3)}
                      onChange={e => patchRefi({ newRate: parseFloat(e.target.value) / 100 || 0 })}
                      disabled={locked}
                    />
                    <span className="field-adornment field-adornment--right">%</span>
                  </div>
                </div>

                <div className="two-col-row">
                  <div className="field-group">
                    <label className="field-label">Amort (yrs)</label>
                    <input
                      type="number"
                      className="field-input"
                      min={1} max={40}
                      value={draft.refi.newAmortYears}
                      onChange={e => patchRefi({ newAmortYears: parseInt(e.target.value) || 30 })}
                      disabled={locked}
                    />
                  </div>
                  <div className="field-group">
                    <label className="field-label">Term (yrs)</label>
                    <input
                      type="number"
                      className="field-input"
                      min={1} max={30}
                      value={draft.refi.newTermYears}
                      onChange={e => patchRefi({ newTermYears: parseInt(e.target.value) || 10 })}
                      disabled={locked}
                    />
                  </div>
                </div>

                <div className="field-group">
                  <label className="field-label">Refi Cost</label>
                  <div className="field-adornment-wrap">
                    <input
                      type="number"
                      className="field-input"
                      step={0.1} min={0} max={5}
                      value={((draft.refi.refiCostPct ?? 0.01) * 100).toFixed(1)}
                      onChange={e => patchRefi({ refiCostPct: parseFloat(e.target.value) / 100 || 0.01 })}
                      disabled={locked}
                    />
                    <span className="field-adornment field-adornment--right">%</span>
                  </div>
                </div>

                <div className="field-group">
                  <label className="field-label toggle-row">
                    <span>Distribute cash-out through waterfall</span>
                    <input
                      type="checkbox"
                      checked={draft.refi.cashOutDistribute}
                      onChange={e => patchRefi({ cashOutDistribute: e.target.checked })}
                      disabled={locked}
                    />
                  </label>
                </div>

                {/* Sale-after-refi */}
                <div className="section-d-sale-after-refi">
                  <div className="field-group">
                    <label className="field-label toggle-row">
                      <span>Model a terminal sale after the refi?</span>
                      <input
                        type="checkbox"
                        checked={!!draft.saleAfterRefi}
                        onChange={e => {
                          if (e.target.checked) {
                            patchDraft({ saleAfterRefi: { saleYear: draft.holdYears, sale: defaultSaleConfig() } })
                          } else {
                            patchDraft({ saleAfterRefi: undefined })
                          }
                        }}
                        disabled={locked}
                      />
                    </label>
                  </div>

                  {draft.saleAfterRefi && (
                    <div className="section-d-event-config section-d-event-config--nested">
                      <h4>Terminal Sale (after refi)</h4>

                      <div className="field-group">
                        <label className="field-label">Sale Year</label>
                        <input
                          type="number"
                          className="field-input"
                          min={draft.eventYear + 1} max={draft.holdYears}
                          value={draft.saleAfterRefi.saleYear}
                          onChange={e => patchDraft({
                            saleAfterRefi: {
                              ...draft.saleAfterRefi!,
                              saleYear: Math.min(draft.holdYears, Math.max(draft.eventYear + 1, parseInt(e.target.value) || draft.holdYears)),
                            }
                          })}
                          disabled={locked}
                        />
                      </div>

                      <div className="field-group">
                        <label className="field-label">Valuation Method</label>
                        <div className="btn-group btn-group--wrap">
                          {([
                            ['cap_rate', 'Cap Rate'],
                            ['per_unit', 'Per Unit'],
                            ['gross_multiple', 'Gross Multiple'],
                            ['direct', 'Direct Value'],
                          ] as [SaleValuationMethod, string][]).map(([val, label]) => (
                            <button
                              key={val}
                              type="button"
                              className={['btn btn-sm', draft.saleAfterRefi?.sale.valuationMethod === val ? 'btn-primary' : 'btn-secondary'].join(' ')}
                              onClick={() => patchDraft({ saleAfterRefi: { ...draft.saleAfterRefi!, sale: { ...draft.saleAfterRefi!.sale, valuationMethod: val } } })}
                              disabled={locked}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {draft.saleAfterRefi.sale.valuationMethod === 'cap_rate' && (
                        <div className="field-group">
                          <label className="field-label">Exit Cap Rate</label>
                          <div className="field-adornment-wrap">
                            <input
                              type="number" className="field-input" step={0.1} min={0.1} max={20}
                              value={((draft.saleAfterRefi.sale.capRate ?? 0.055) * 100).toFixed(2)}
                              onChange={e => patchDraft({ saleAfterRefi: { ...draft.saleAfterRefi!, sale: { ...draft.saleAfterRefi!.sale, capRate: parseFloat(e.target.value) / 100 || 0 } } })}
                              disabled={locked}
                            />
                            <span className="field-adornment field-adornment--right">%</span>
                          </div>
                        </div>
                      )}
                      {draft.saleAfterRefi.sale.valuationMethod === 'direct' && (
                        <div className="field-group">
                          <label className="field-label">Direct Sale Price</label>
                          <div className="field-adornment-wrap">
                            <span className="field-adornment">$</span>
                            <CurrencyInput
                              className="field-input"
                              value={draft.saleAfterRefi.sale.directValue ?? 0}
                              onChange={v => patchDraft({ saleAfterRefi: { ...draft.saleAfterRefi!, sale: { ...draft.saleAfterRefi!.sale, directValue: v } } })}
                              disabled={locked}
                            />
                          </div>
                        </div>
                      )}
                      {draft.saleAfterRefi.sale.valuationMethod === 'per_unit' && (
                        <div className="field-group">
                          <label className="field-label">Value Per Unit</label>
                          <div className="field-adornment-wrap">
                            <span className="field-adornment">$</span>
                            <CurrencyInput
                              className="field-input"
                              value={draft.saleAfterRefi.sale.perUnitValue ?? 0}
                              onChange={v => patchDraft({ saleAfterRefi: { ...draft.saleAfterRefi!, sale: { ...draft.saleAfterRefi!.sale, perUnitValue: v } } })}
                              disabled={locked}
                            />
                          </div>
                        </div>
                      )}
                      {draft.saleAfterRefi.sale.valuationMethod === 'gross_multiple' && (
                        <div className="field-group">
                          <label className="field-label">Gross Multiple (× NOI)</label>
                          <input
                            type="number" className="field-input" step={0.1} min={0.1}
                            value={(draft.saleAfterRefi.sale.grossMultiple ?? 1.8).toFixed(1)}
                            onChange={e => patchDraft({ saleAfterRefi: { ...draft.saleAfterRefi!, sale: { ...draft.saleAfterRefi!.sale, grossMultiple: parseFloat(e.target.value) || 1 } } })}
                            disabled={locked}
                          />
                        </div>
                      )}

                      <div className="field-group">
                        <label className="field-label">Selling Costs</label>
                        <div className="field-adornment-wrap">
                          <input
                            type="number" className="field-input" step={0.1} min={0} max={10}
                            value={((draft.saleAfterRefi.sale.closingCostsPct ?? 0.02) * 100).toFixed(1)}
                            onChange={e => patchDraft({ saleAfterRefi: { ...draft.saleAfterRefi!, sale: { ...draft.saleAfterRefi!.sale, closingCostsPct: parseFloat(e.target.value) / 100 || 0 } } })}
                            disabled={locked}
                          />
                          <span className="field-adornment field-adornment--right">%</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            <button
              type="button"
              className="btn btn-primary"
              onClick={handleRun}
              disabled={locked || running || draft.beginNoi <= 0}
            >
              {running ? 'Running…' : 'Run Projection'}
            </button>
            {draft.beginNoi <= 0 && (
              <p className="field-hint">Enter a Year 1 NOI above to run the projection.</p>
            )}
          </div>

          {/* ── Right: Output ── */}
          <div className="section-d-output">

            {!result && (
              <div className="section-d-empty-output">
                <p>Fill in the assumptions and click <strong>Run Projection</strong> to see results.</p>
              </div>
            )}

            {result && (
              <>
                {/* Returns KPI grid */}
                <div className="returns-kpi-grid">
                  <KPI label="LP IRR"            value={fmtPct(result.lpIrr, 1)} />
                  <KPI label="LP Equity Multiple" value={fmtMult(result.lpEquityMultiple)} />
                  <KPI label="LP Cash-on-Cash"   value={fmtPct(result.lpCashOnCash, 1)} />
                  <KPI label="GP IRR"             value={fmtPct(result.gpIrr, 1)} />
                  <KPI
                    label="GP Promote $"
                    value={fmtUSD(
                      result.years.reduce((s, y) => {
                        const ev = y.event?.proposedDistribution
                        return s + (ev ? ev.gpPromote : 0)
                      }, 0)
                    )}
                  />
                </div>

                {/* Year-by-year table */}
                <div className="projection-table-wrap">
                  <table className="projection-table">
                    <thead>
                      <tr>
                        <th>Year</th>
                        <th>NOI</th>
                        <th>Debt Svc</th>
                        <th>NCF</th>
                        <th>Loan Bal</th>
                        <th>Event</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.years.map(y => (
                        <React.Fragment key={y.year}>
                          <tr className={y.event ? 'projection-event-row' : ''}>
                            <td>{y.year}</td>
                            <td>{fmtUSD(y.noi)}</td>
                            <td>{fmtUSD(y.debtService)}</td>
                            <td>{fmtUSD(y.cashToInvestors)}</td>
                            <td>{fmtUSD(y.loanBalance)}</td>
                            <td>
                              {y.event ? (
                                <>
                                  {y.event.type} · {fmtUSD(y.event.netProceeds)} net
                                  {y.event.type === 'REFI' && (
                                    <>
                                      <br />
                                      <span className="refi-new-loan-label">
                                        New loan: {fmtUSD(y.event.grossValue)}
                                        {y.event.refiBinding && (
                                          <> · bound by <strong>{y.event.refiBinding.replace('_', ' ').toUpperCase()}</strong></>
                                        )}
                                      </span>
                                    </>
                                  )}
                                </>
                              ) : '—'}
                            </td>
                          </tr>
                          {y.event?.proposedDistribution && (
                            <DistributionCard
                              event={y.event}
                              overrides={overrides}
                              onOverride={patch => setOverrides(o => ({ ...o, ...patch }))}
                            />
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KPI({ label, value }: { label: string; value: string }) {
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
    </div>
  )
}

function DistributionCard({
  event,
  overrides,
  onOverride,
}: {
  event: YearProjection['event'] & object
  overrides: Partial<DistributionResult>
  onOverride: (patch: Partial<DistributionResult>) => void
}) {
  const dist = event?.proposedDistribution
  if (!dist) return null

  const fmtVal = (key: keyof DistributionResult) => {
    const v = key in overrides
      ? (overrides as unknown as Record<string, number>)[key as string]
      : (dist as unknown as Record<string, number>)[key as string]
    return typeof v === 'number' ? v : 0
  }

  const rows: { key: keyof DistributionResult; label: string }[] = [
    { key: 'lpPref',    label: 'LP Preferred Return' },
    { key: 'lpRoC',     label: 'LP Return of Capital' },
    { key: 'lpPromote', label: 'LP Promote' },
    { key: 'gpRoC',     label: 'GP Return of Capital' },
    { key: 'gpPromote', label: 'GP Promote' },
  ]

  return (
    <tr>
      <td colSpan={6} style={{ padding: 0 }}>
        <div className="dist-propose-card">
          <div className="dist-propose-header">
            Proposed Distribution — Year {event?.year}
            <span className="dist-propose-badge">Proposed</span>
          </div>
          {rows.map(r => {
            const isOverridden = r.key in overrides
            return (
              <div key={r.key} className="dist-propose-row">
                <span className="dist-propose-label">{r.label}</span>
                <div className="dist-propose-input-wrap">
                  {isOverridden && (
                    <span className="dist-propose-badge dist-propose-badge--override">Override</span>
                  )}
                  <span className="field-adornment">$</span>
                  <input
                    type="number"
                    className="field-input field-input--sm"
                    value={fmtVal(r.key)}
                    onChange={e => onOverride({ [r.key]: parseFloat(e.target.value) || 0 } as Partial<DistributionResult>)}
                  />
                </div>
              </div>
            )
          })}
          <div className="dist-propose-actions">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                navigator.clipboard?.writeText(JSON.stringify({ ...dist, ...overrides }, null, 2))
              }}
            >
              Copy to Clipboard
            </button>
          </div>
        </div>
      </td>
    </tr>
  )
}
