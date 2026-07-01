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

// ─── Live sale preview helper ─────────────────────────────────────────────────

function computeSalePreview(draft: ExitScenarioAssumptions) {
  let terminalNoi = draft.beginNoi
  for (let i = 0; i < draft.holdYears - 1; i++) {
    terminalNoi *= 1 + (draft.noiGrowthRates?.[i] ?? draft.noiGrowthPct)
  }
  const sale            = draft.sale ?? defaultSaleConfig()
  const closingCostsPct = sale.closingCostsPct ?? 0.02
  let   grossSale       = 0
  switch (sale.valuationMethod) {
    case 'cap_rate':       grossSale = (sale.capRate ?? 0) > 0 ? terminalNoi / (sale.capRate ?? 0.055) : 0; break
    case 'per_unit':       grossSale = sale.perUnitValue ?? 0; break
    case 'gross_multiple': grossSale = (sale.grossMultiple ?? 0) * terminalNoi; break
    case 'direct':         grossSale = sale.directValue ?? 0; break
  }
  const closingCostsDollar = grossSale * closingCostsPct
  const netSale            = grossSale - closingCostsDollar
  return { terminalNoi, grossSale, closingCostsDollar, netSale }
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
  const [activeId, setActiveId]       = useState<string | null>(scenarios[0]?.id ?? null)
  const [draft, setDraft]             = useState<ExitScenarioAssumptions>(
    scenarios[0]?.assumptions ?? defaultAssumptions()
  )
  const [overrides, setOverrides]     = useState<Partial<DistributionResult>>({})
  const [running, setRunning]         = useState(false)
  const [leftCollapsed, setLeftCollapsed] = useState(false)

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
      setLeftCollapsed(true)
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
        <div className={`section-d-body${leftCollapsed ? ' section-d-body--collapsed' : ''}`}>

          {/* ── Left: Inputs ── */}
          <div className={`section-d-inputs${leftCollapsed ? ' section-d-inputs--hidden' : ''}`}>
            <div className="section-d-inputs-header">
              <h3>Projection Assumptions</h3>
              <button
                type="button"
                className="section-d-collapse-btn"
                onClick={() => setLeftCollapsed(true)}
                title="Collapse inputs"
              >
                ‹
              </button>
            </div>

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

            {/* NOI Schedule — unified Year 0/1/N table */}
            <div className="field-group">
              <label className="field-label">NOI Growth Rate Assumptions</label>
              <table className="noi-schedule-table">
                <thead>
                  <tr>
                    <th>Year</th>
                    <th>NOI</th>
                    <th>YoY%</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Year 0 — partial year input (optional) */}
                  <tr>
                    <td>0</td>
                    <td>
                      <CurrencyInput
                        className="noi-schedule-noi-input"
                        value={draft.year0Noi ?? 0}
                        onChange={v => patchDraft({ year0Noi: v || undefined })}
                        disabled={locked}
                      />
                    </td>
                    <td className="noi-schedule-hint-cell">partial yr</td>
                  </tr>
                  {/* Year 1 — beginNoi input */}
                  <tr>
                    <td>1</td>
                    <td>
                      <CurrencyInput
                        className="noi-schedule-noi-input"
                        value={draft.beginNoi}
                        onChange={v => patchDraft({ beginNoi: v })}
                        disabled={locked}
                      />
                    </td>
                    <td>—</td>
                  </tr>
                  {/* Years 2 through holdYears — computed NOI, editable YoY% */}
                  {Array.from({ length: draft.holdYears - 1 }, (_, i) => {
                    // Compute NOI for year i+2
                    let noi = draft.beginNoi
                    for (let j = 0; j <= i; j++) {
                      noi *= 1 + (draft.noiGrowthRates?.[j] ?? draft.noiGrowthPct)
                    }
                    const rate = draft.noiGrowthRates?.[i] ?? draft.noiGrowthPct
                    return (
                      <tr key={i}>
                        <td>{i + 2}</td>
                        <td className="noi-schedule-computed">{fmtUSD(noi)}</td>
                        <td>
                          <div className="noi-rate-wrap">
                            <input
                              type="number"
                              className="noi-rate-input"
                              step={0.1} min={-20} max={50}
                              value={(rate * 100).toFixed(1)}
                              onChange={e => {
                                const rates = Array.from({ length: draft.holdYears - 1 }, (_, j) =>
                                  j === i
                                    ? parseFloat(e.target.value) / 100 || 0
                                    : (draft.noiGrowthRates?.[j] ?? draft.noiGrowthPct)
                                )
                                patchDraft({ noiGrowthRates: rates })
                              }}
                              disabled={locked}
                            />
                            <span className="noi-rate-pct">%</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div className="field-hint">Year 0 = partial year before hold start (reduces equity basis). Edit YoY% per year or leave uniform.</div>
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
            {draft.eventType === 'SALE' && draft.sale && (() => {
              const { terminalNoi, grossSale, closingCostsDollar, netSale } = computeSalePreview(draft)
              return (
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

                  {/* Terminal NOI — always computed from NOI schedule */}
                  <div className="sale-preview-row">
                    <span className="sale-preview-label">Terminal NOI</span>
                    <span className="sale-preview-value">{fmtUSD(terminalNoi)}</span>
                  </div>

                  {draft.sale.valuationMethod === 'cap_rate' && (
                    <div className="field-group">
                      <label className="field-label">Cap Rate</label>
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

                  {/* Gross Sales Proceeds */}
                  <div className="sale-preview-row">
                    <span className="sale-preview-label">Gross Sales Proceeds</span>
                    <span className="sale-preview-value">{fmtUSD(grossSale)}</span>
                  </div>

                  {/* Closing Costs — % input + live dollar amount */}
                  <div className="field-group">
                    <label className="field-label">Closing Costs</label>
                    <div className="sale-closing-costs-row">
                      <div className="field-adornment-wrap" style={{ flex: '0 0 90px' }}>
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
                      <span className="sale-closing-costs-dollar">{fmtUSD(closingCostsDollar)}</span>
                    </div>
                  </div>

                  {/* Net Sales Proceeds */}
                  <div className="sale-preview-row sale-preview-row--total">
                    <span className="sale-preview-label">Net Sales Proceeds</span>
                    <span className="sale-preview-value">{fmtUSD(netSale)}</span>
                  </div>
                </div>
              )
            })()}

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
            {leftCollapsed && (
              <button
                type="button"
                className="section-d-expand-btn"
                onClick={() => setLeftCollapsed(false)}
                title="Show inputs"
              >
                › Inputs
              </button>
            )}

            {!result && (
              <div className="section-d-empty-output">
                <p>Fill in the assumptions and click <strong>Run Projection</strong> to see results.</p>
              </div>
            )}

            {result && (
              <>
                {/* Returns KPI grid */}
                <div className="returns-kpi-grid">
                  <KPI label="LP IRR"            value={fmtPct(result.lpIrr, 2)} />
                  <KPI label="LP Equity Multiple" value={fmtMult(result.lpEquityMultiple)} />
                  <KPI label="LP Cash-on-Cash"   value={fmtPct(result.lpCashOnCash, 1)} />
                  <KPI label="GP IRR"             value={fmtPct(result.gpIrr, 2)} />
                  <KPI label="GP Equity Multiple" value={fmtMult(result.gpEquityMultiple)} />
                  <KPI label="Terminal NOI" value={fmtUSD(result.years[result.years.length - 1]?.noi)} />
                  {(() => {
                    const saleYr = result.years.find(yr => yr.event?.type === 'SALE')
                    if (!saleYr?.event) return null
                    return (
                      <>
                        <KPI label="Gross Sale Price"  value={fmtUSD(saleYr.event.grossValue)} />
                        <KPI label="Net Sale Proceeds" value={fmtUSD(saleYr.event.netProceeds)} />
                      </>
                    )
                  })()}
                </div>

                {/* Partnership Returns Summary — year-by-year LP/GP cash flow schedule */}
                <PartnershipReturnsTable result={result} />

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
                              onClear={() => setOverrides({})}
                              result={result}
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

// ─── Partnership Returns Summary — year-by-year cash flow schedule ────────────

function PartnershipReturnsTable({ result }: { result: ProjectionResult }) {
  const { years, lpIrr, gpIrr, lpEquityMultiple, gpEquityMultiple } = result

  // LP/GP contributions: from flows stored in state (we don't have direct access here,
  // so we derive from the first negative-value flow which is always at Year 0)
  // Approximate: sum all negative distributions (should just be Year 0 equity in)
  // We derive LP/GP equity from lpEquityMultiple and total LP distributions
  const totalLpDist = years.reduce((s, y) => s + (y.lpDistribution ?? 0), 0)
  const totalGpDist = years.reduce((s, y) => s + (y.gpDistribution ?? 0), 0)

  // Derive invested equity from multiple (totalOut / EM = totalIn)
  const lpEquity = lpEquityMultiple && lpEquityMultiple > 0 ? totalLpDist / lpEquityMultiple : undefined
  const gpEquity = gpEquityMultiple && gpEquityMultiple > 0 ? totalGpDist / gpEquityMultiple : undefined

  // Per-year distribution breakdowns
  const totalLpRoC     = years.reduce((s, y) => s + (y.distribution?.lpRoC ?? 0), 0)
  const totalLpPromote = years.reduce((s, y) => s + ((y.distribution?.lpCatchup ?? 0) + (y.distribution?.lpPromote ?? 0)), 0)
  const totalGpRoC     = years.reduce((s, y) => s + (y.distribution?.gpRoC ?? 0), 0)
  const totalGpPromote = years.reduce((s, y) => s + ((y.distribution?.gpCatchup ?? 0) + (y.distribution?.gpPromote ?? 0)), 0)

  function distCell(v: number) {
    return v > 0.5 ? fmtUSD(v) : '—'
  }

  return (
    <div className="prs-wrap">
      <div className="prs-title">Summary of Partnership-Level Returns — Annual</div>
      <div className="prs-scroll">
        <table className="prs-table">
          <thead>
            <tr>
              <th className="prs-label-col"></th>
              <th className="prs-yr0-col">Year 0</th>
              {years.map(y => (
                <th key={y.year} className={y.event ? 'prs-event-col' : ''}>Year {y.year}</th>
              ))}
              <th className="prs-total-col">Total</th>
            </tr>
          </thead>
          <tbody>
            {/* ── LP section ── */}
            <tr className="prs-section-header">
              <td colSpan={years.length + 3}>LP Partners</td>
            </tr>
            <tr>
              <td className="prs-row-label">Total Contributions</td>
              <td className="prs-negative">{lpEquity != null ? `(${fmtUSD(lpEquity)})` : '—'}</td>
              {years.map(y => <td key={y.year}>—</td>)}
              <td className="prs-negative prs-total">{lpEquity != null ? `(${fmtUSD(lpEquity)})` : '—'}</td>
            </tr>
            <tr className="prs-breakdown-row">
              <td className="prs-row-label prs-indent">Return of Capital</td>
              <td>—</td>
              {years.map(y => (
                <td key={y.year} className={(y.distribution?.lpRoC ?? 0) > 0.5 ? 'prs-positive' : ''}>
                  {distCell(y.distribution?.lpRoC ?? 0)}
                </td>
              ))}
              <td className="prs-total">{distCell(totalLpRoC)}</td>
            </tr>
            <tr className="prs-breakdown-row">
              <td className="prs-row-label prs-indent">Promote / Carry</td>
              <td>—</td>
              {years.map(y => {
                const v = (y.distribution?.lpCatchup ?? 0) + (y.distribution?.lpPromote ?? 0)
                return (
                  <td key={y.year} className={v > 0.5 ? 'prs-positive' : ''}>{distCell(v)}</td>
                )
              })}
              <td className="prs-total">{distCell(totalLpPromote)}</td>
            </tr>
            <tr className="prs-subtotal-row">
              <td className="prs-row-label">Total Distributions</td>
              <td>—</td>
              {years.map(y => (
                <td key={y.year} className={(y.lpDistribution ?? 0) > 0 ? 'prs-positive' : ''}>
                  {(y.lpDistribution ?? 0) > 0.5 ? fmtUSD(y.lpDistribution) : '—'}
                </td>
              ))}
              <td className="prs-positive prs-total">{totalLpDist > 0.5 ? fmtUSD(totalLpDist) : '—'}</td>
            </tr>
            <tr>
              <td className="prs-row-label">Net Cash Flow</td>
              <td className="prs-negative">{lpEquity != null ? `(${fmtUSD(lpEquity)})` : '—'}</td>
              {years.map(y => (
                <td key={y.year} className={(y.lpDistribution ?? 0) > 0 ? 'prs-positive' : ''}>
                  {(y.lpDistribution ?? 0) > 0.5 ? fmtUSD(y.lpDistribution) : '—'}
                </td>
              ))}
              <td className={`prs-total ${totalLpDist - (lpEquity ?? 0) >= 0 ? 'prs-positive' : 'prs-negative'}`}>
                {lpEquity != null ? fmtUSD(totalLpDist - lpEquity) : '—'}
              </td>
            </tr>

            {/* ── LP metrics ── */}
            <tr className="prs-metric-row">
              <td className="prs-row-label">IRR</td>
              <td colSpan={years.length + 1}></td>
              <td className="prs-total prs-metric-value">{fmtPct(lpIrr, 2)}</td>
            </tr>
            <tr className="prs-metric-row">
              <td className="prs-row-label">Equity Multiple</td>
              <td colSpan={years.length + 1}></td>
              <td className="prs-total prs-metric-value">{fmtMult(lpEquityMultiple)}</td>
            </tr>

            {/* ── GP section ── */}
            <tr className="prs-section-header">
              <td colSpan={years.length + 3}>GP / Sponsor</td>
            </tr>
            <tr>
              <td className="prs-row-label">Total Contributions</td>
              <td className="prs-negative">{gpEquity != null ? `(${fmtUSD(gpEquity)})` : '—'}</td>
              {years.map(y => <td key={y.year}>—</td>)}
              <td className="prs-negative prs-total">{gpEquity != null ? `(${fmtUSD(gpEquity)})` : '—'}</td>
            </tr>
            <tr className="prs-breakdown-row">
              <td className="prs-row-label prs-indent">Return of Capital</td>
              <td>—</td>
              {years.map(y => (
                <td key={y.year} className={(y.distribution?.gpRoC ?? 0) > 0.5 ? 'prs-positive' : ''}>
                  {distCell(y.distribution?.gpRoC ?? 0)}
                </td>
              ))}
              <td className="prs-total">{distCell(totalGpRoC)}</td>
            </tr>
            <tr className="prs-breakdown-row">
              <td className="prs-row-label prs-indent">Promote / Carry</td>
              <td>—</td>
              {years.map(y => {
                const v = (y.distribution?.gpCatchup ?? 0) + (y.distribution?.gpPromote ?? 0)
                return (
                  <td key={y.year} className={v > 0.5 ? 'prs-positive' : ''}>{distCell(v)}</td>
                )
              })}
              <td className="prs-total">{distCell(totalGpPromote)}</td>
            </tr>
            <tr className="prs-subtotal-row">
              <td className="prs-row-label">Total Distributions</td>
              <td>—</td>
              {years.map(y => (
                <td key={y.year} className={(y.gpDistribution ?? 0) > 0 ? 'prs-positive' : ''}>
                  {(y.gpDistribution ?? 0) > 0.5 ? fmtUSD(y.gpDistribution) : '—'}
                </td>
              ))}
              <td className="prs-positive prs-total">{totalGpDist > 0.5 ? fmtUSD(totalGpDist) : '—'}</td>
            </tr>
            <tr>
              <td className="prs-row-label">Net Cash Flow</td>
              <td className="prs-negative">{gpEquity != null ? `(${fmtUSD(gpEquity)})` : '—'}</td>
              {years.map(y => (
                <td key={y.year} className={(y.gpDistribution ?? 0) > 0 ? 'prs-positive' : ''}>
                  {(y.gpDistribution ?? 0) > 0.5 ? fmtUSD(y.gpDistribution) : '—'}
                </td>
              ))}
              <td className={`prs-total ${totalGpDist - (gpEquity ?? 0) >= 0 ? 'prs-positive' : 'prs-negative'}`}>
                {gpEquity != null ? fmtUSD(totalGpDist - gpEquity) : '—'}
              </td>
            </tr>

            {/* ── GP metrics ── */}
            <tr className="prs-metric-row">
              <td className="prs-row-label">IRR</td>
              <td colSpan={years.length + 1}></td>
              <td className="prs-total prs-metric-value">{fmtPct(gpIrr, 2)}</td>
            </tr>
            <tr className="prs-metric-row">
              <td className="prs-row-label">Equity Multiple</td>
              <td colSpan={years.length + 1}></td>
              <td className="prs-total prs-metric-value">{fmtMult(gpEquityMultiple)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Partnership Returns table (replaces old flat distribution list) ──────────

function DistributionCard({
  event,
  overrides,
  onOverride,
  onClear,
  result,
}: {
  event: NonNullable<YearProjection['event']>
  overrides: Partial<DistributionResult>
  onOverride: (patch: Partial<DistributionResult>) => void
  onClear?: () => void
  result?: ProjectionResult
}) {
  const dist = event.proposedDistribution
  if (!dist) return null

  function getVal(key: 'lpPref' | 'lpRoC' | 'lpPromote' | 'gpRoC' | 'gpPromote'): number {
    return key in overrides
      ? (overrides as Record<string, number>)[key] ?? 0
      : (dist as unknown as Record<string, number>)[key] ?? 0
  }

  const lpRoC     = getVal('lpRoC')
  const gpRoC     = getVal('gpRoC')
  const lpPref    = getVal('lpPref')
  const gpPref    = dist.gpPref ?? 0
  const lpCatchup = dist.lpCatchup ?? 0
  const gpCatchup = dist.gpCatchup ?? 0
  const lpPromote = getVal('lpPromote')
  const gpPromote = getVal('gpPromote')

  const lpTotal = lpRoC + lpPref + lpCatchup + lpPromote
  const gpTotal = gpRoC + gpPref + gpCatchup + gpPromote

  const showRoC      = lpRoC > 1 || gpRoC > 1
  const showPref     = lpPref > 1 || gpPref > 1
  const showCatchup  = lpCatchup > 0.005 || gpCatchup > 0.005
  const showClawback = !!(dist.gpClawback && dist.gpClawback > 0.005)
  const hasOverrides = Object.keys(overrides).length > 0
  // When RoC is $0 it means capital was fully returned in prior operating years
  const rocReturnedPrior = !showRoC && lpTotal > 1

  return (
    <tr>
      <td colSpan={6} style={{ padding: 0 }}>
        <div className="partnership-returns-card">

          <div className="partnership-returns-header">
            <span>Year {event.year} Distribution Detail</span>
            <span className="dist-propose-badge">Proposed</span>
          </div>

          {rocReturnedPrior && (
            <div className="prt-prior-note">
              Return of Capital and Preferred Return were paid in prior operating years — see the Summary table above.
            </div>
          )}

          {/* ── Distribution breakdown table ── */}
          <table className="partnership-returns-table">
            <thead>
              <tr>
                <th></th>
                <th>LP Partners</th>
                <th>GP / Sponsor</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {showRoC && (
                <tr>
                  <td>Return of Capital</td>
                  <td>
                    <PrtCell value={lpRoC} isOverridden={'lpRoC' in overrides}
                      onChange={v => onOverride({ lpRoC: v } as Partial<DistributionResult>)} />
                  </td>
                  <td>
                    <PrtCell value={gpRoC} isOverridden={'gpRoC' in overrides}
                      onChange={v => onOverride({ gpRoC: v } as Partial<DistributionResult>)} />
                  </td>
                  <td className="prt-subtotal">{fmtUSD(lpRoC + gpRoC)}</td>
                </tr>
              )}

              {showPref && (
                <tr>
                  <td>Preferred Return</td>
                  <td>
                    <PrtCell value={lpPref} isOverridden={'lpPref' in overrides}
                      onChange={v => onOverride({ lpPref: v } as Partial<DistributionResult>)} />
                  </td>
                  <td className="prt-readonly">{fmtUSD(gpPref)}</td>
                  <td className="prt-subtotal">{fmtUSD(lpPref + gpPref)}</td>
                </tr>
              )}

              {showCatchup && (
                <tr>
                  <td>Catch-Up</td>
                  <td className="prt-readonly">{fmtUSD(lpCatchup)}</td>
                  <td className="prt-readonly">{fmtUSD(gpCatchup)}</td>
                  <td className="prt-subtotal">{fmtUSD(lpCatchup + gpCatchup)}</td>
                </tr>
              )}

              <tr>
                <td>Promote / Carry</td>
                <td>
                  <PrtCell value={lpPromote} isOverridden={'lpPromote' in overrides}
                    onChange={v => onOverride({ lpPromote: v } as Partial<DistributionResult>)} />
                </td>
                <td>
                  <PrtCell value={gpPromote} isOverridden={'gpPromote' in overrides}
                    onChange={v => onOverride({ gpPromote: v } as Partial<DistributionResult>)} />
                </td>
                <td className="prt-subtotal">{fmtUSD(lpPromote + gpPromote)}</td>
              </tr>

              {showClawback && (
                <tr className="prt-clawback-row">
                  <td>GP Clawback</td>
                  <td className="prt-positive">+{fmtUSD(dist.gpClawback)}</td>
                  <td className="prt-negative">−{fmtUSD(dist.gpClawback)}</td>
                  <td>—</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <td>Total Distributions</td>
                <td>{fmtUSD(lpTotal)}</td>
                <td>{fmtUSD(gpTotal)}</td>
                <td>{fmtUSD(lpTotal + gpTotal)}</td>
              </tr>
            </tfoot>
          </table>

          {/* ── Return metrics (IRR / EM / CoC) — mirrors A.CRE summary rows ── */}
          {result && (
            <table className="partnership-returns-table partnership-returns-metrics">
              <tbody>
                <tr>
                  <td>IRR</td>
                  <td>{fmtPct(result.lpIrr, 2)}</td>
                  <td>{fmtPct(result.gpIrr, 2)}</td>
                  <td></td>
                </tr>
                <tr>
                  <td>Equity Multiple</td>
                  <td>{fmtMult(result.lpEquityMultiple)}</td>
                  <td>{result.gpEquityMultiple != null ? fmtMult(result.gpEquityMultiple) : '—'}</td>
                  <td></td>
                </tr>
                <tr>
                  <td>Cash-on-Cash (avg annual)</td>
                  <td>{fmtPct(result.lpCashOnCash, 1)}</td>
                  <td>—</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          )}

          <div className="partnership-returns-actions">
            <button type="button" className="btn btn-secondary btn-sm"
              onClick={() => navigator.clipboard?.writeText(JSON.stringify({ ...dist, ...overrides }, null, 2))}>
              Copy to Clipboard
            </button>
            {hasOverrides && onClear && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={onClear}>
                Reset to Proposed
              </button>
            )}
          </div>
        </div>
      </td>
    </tr>
  )
}

/** Editable inline dollar cell — transparent by default, shows border on hover/focus */
function PrtCell({
  value,
  isOverridden,
  onChange,
}: {
  value: number
  isOverridden: boolean
  onChange: (v: number) => void
}) {
  return (
    <div className={`prt-input-wrap${isOverridden ? ' prt-input-wrap--overridden' : ''}`}>
      {isOverridden && <span className="prt-override-dot" title="Overridden" />}
      <span className="prt-currency-symbol">$</span>
      <input
        type="number"
        className="prt-input"
        value={Math.round(value)}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
      />
    </div>
  )
}
