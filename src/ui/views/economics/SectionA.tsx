import React, { useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useEconomicsStore } from '../../../state/economicsStore'
import { validateSectionA } from '../../../utils/economicsValidation'
import { computeSourcesAndUses, positionLabel } from '../../../utils/sourcesAndUses'
import { buildAmortizationSchedule } from '../../../utils/amortization'
import type {
  DebtInstrument,
  LoanType,
  LoanPosition,
  RateIndex,
  CapitalStack,
  AmortizationRow,
  PrefCompounding,
  PrepaymentPenaltyType,
  ResetFrequency,
} from '../../../state/economicsTypes'
import { CurrencyInput } from '../../components/CurrencyInput'
import { fmtCurrency } from '../../../utils/financialComputations'

// ─── Display helpers ──────────────────────────────────────────────────────────

const POSITION_LABELS: Record<LoanPosition, string> = {
  senior:      'Senior',
  subordinate: 'Subordinate (Mezzanine)',
  pref_equity: 'Pref Equity',
}

const LOAN_TYPE_LABELS: Record<LoanType, string> = {
  fixed:        'Fixed Rate',
  floating:     'Floating Rate',
  io:           'Interest Only',
  hybrid:       'Hybrid (IO + Amort)',
  construction: 'Construction Loan',
}

/** Stored as decimal (0.065), displayed as string "6.5". */
function toDisplayRate(v?: number): string {
  if (v == null || v === 0) return ''
  return String(parseFloat((v * 100).toFixed(4)))
}

/** Input string "6.5" → stored decimal 0.065. */
function fromDisplayRate(s: string): number {
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n / 100
}

function emptyStack(): CapitalStack {
  return {
    purchasePrice:     0,
    closingCosts:      0,
    operatingReserves: 0,
    capexReserves:     0,
    otherUses:         0,
    instruments:       [],
  }
}

function blankInstrument(): Omit<DebtInstrument, 'id'> {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm   = String(now.getMonth() + 1).padStart(2, '0')
  return {
    position:          'senior',
    loanType:          'fixed',
    lender:            '',
    loanAmount:        0,
    startDate:         `${yyyy}-${mm}`,
    termYears:         5,
    amortizationYears: 30,
    fixedRate:         0,
    chathamEnabled:    true,
    isRecourse:        true,
  }
}

function instrumentSummaryMeta(inst: DebtInstrument): string {
  const amt  = inst.loanAmount ? fmtCurrency(inst.loanAmount) : '—'
  const type = LOAN_TYPE_LABELS[inst.loanType] ?? inst.loanType

  let rateStr = ''
  if (inst.loanType === 'floating') {
    const index  = inst.index ?? ''
    const spread = inst.spread != null ? `+${toDisplayRate(inst.spread)}%` : ''
    rateStr = [index, spread].filter(Boolean).join(' ')
  } else if (inst.fixedRate) {
    rateStr = `${toDisplayRate(inst.fixedRate)}%`
  }

  const term = inst.termYears ? `${inst.termYears}Y` : ''
  return [amt, type, rateStr, term].filter(Boolean).join('  ·  ')
}

// ─── Amortization preview ─────────────────────────────────────────────────────

const AmortPreview: React.FC<{ instrument: DebtInstrument }> = ({ instrument }) => {
  const [expanded, setExpanded] = useState(false)
  const schedule = buildAmortizationSchedule(instrument)
  const rows     = expanded ? schedule.rows : schedule.rows.slice(0, 12)

  const fmt = (n: number) => fmtCurrency(n)

  return (
    <div className="amort-preview">
      <div className="amort-preview-title">
        <span className="amort-preview-label">Amortization Schedule</span>
        <button
          type="button"
          className="btn btn-ghost btn-xs"
          onClick={() => setExpanded(e => !e)}
        >
          {expanded ? 'Show less' : `Show all ${schedule.rows.length} months`}
        </button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="amort-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Date</th>
              <th>Beg Balance</th>
              <th>Payment</th>
              <th>Interest</th>
              <th>Principal</th>
              <th>End Balance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.period}>
                <td>{r.period}</td>
                <td>{r.date}</td>
                <td>{fmt(r.beginBalance)}</td>
                <td>{fmt(r.payment)}</td>
                <td>{fmt(r.interest)}</td>
                <td>{fmt(r.principal)}</td>
                <td>{fmt(r.endBalance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {schedule.rows[0]?.note && (
        <p className="amort-table-note" style={{ marginTop: 6 }}>
          Note: {schedule.rows[0].note}
        </p>
      )}

      <div className="amort-totals">
        <div className="amort-total-box">
          <div className="amort-total-label">Total Interest</div>
          <div className="amort-total-value">{fmt(schedule.totalInterest)}</div>
        </div>
        <div className="amort-total-box">
          <div className="amort-total-label">Total Principal</div>
          <div className="amort-total-value">{fmt(schedule.totalPrincipal)}</div>
        </div>
        <div className="amort-total-box">
          <div className="amort-total-label">Total Payments</div>
          <div className="amort-total-value">{fmt(schedule.totalPayments)}</div>
        </div>
      </div>
    </div>
  )
}

// ─── Instrument form ──────────────────────────────────────────────────────────

interface InstrumentFormProps {
  instrument: DebtInstrument
  onChange:   (patch: Partial<DebtInstrument>) => void
  locked:     boolean
  showAmort:  boolean
  onToggleAmort: () => void
}

const InstrumentForm: React.FC<InstrumentFormProps> = ({
  instrument, onChange, locked, showAmort, onToggleAmort,
}) => {
  const p        = instrument
  const isPrefEq = p.position === 'pref_equity'
  // isFloating: true when instrument uses floating rate (either explicitly or via rateIsFloating toggle)
  const isFloating = p.loanType === 'floating' || (!isPrefEq && !!p.rateIsFloating)

  const field = (
    label:     string,
    children:  React.ReactNode,
    hint?:     string,
    fullWidth?: boolean,
  ) => (
    <div className={`field-group${fullWidth ? ' instrument-form-field--full' : ''}`}>
      <label className="field-label">{label}</label>
      {children}
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  )

  // Rate Type toggle for IO / Hybrid / Construction
  const rateTypeToggle = (
    <div className="field-group">
      <label className="field-label">Rate Type</label>
      <div className="toggle-row">
        <button
          type="button"
          className={`toggle-btn${!p.rateIsFloating ? ' toggle-btn--active' : ''}`}
          disabled={locked}
          onClick={() => onChange({ rateIsFloating: false })}
        >Fixed</button>
        <button
          type="button"
          className={`toggle-btn${p.rateIsFloating ? ' toggle-btn--active' : ''}`}
          disabled={locked}
          onClick={() => onChange({ rateIsFloating: true })}
        >Floating</button>
      </div>
    </div>
  )

  // Reusable floating sub-fields (shared by floating loanType + rateIsFloating for IO/hybrid/construction)
  const floatingSubFields = (
    <>
      {field('Rate Index',
        <select
          className="field-input"
          value={p.index ?? ''}
          disabled={locked}
          onChange={e => onChange({ index: e.target.value as RateIndex })}
        >
          <option value="">— Select index —</option>
          <option value="SOFR">SOFR</option>
          <option value="Prime">Prime Rate</option>
          <option value="Other">Other</option>
        </select>,
      )}
      {p.index === 'Other' && field('Index Name',
        <input
          type="text"
          className="field-input"
          value={p.otherIndexName ?? ''}
          placeholder="e.g. T-Bill, Fed Funds"
          disabled={locked}
          onChange={e => onChange({ otherIndexName: e.target.value || undefined })}
        />,
      )}
      {field('Spread (%)',
        <input
          type="number"
          className="field-input"
          value={toDisplayRate(p.spread)}
          min={0} max={20} step={0.001}
          placeholder="e.g. 2.5"
          disabled={locked}
          onChange={e => onChange({ spread: fromDisplayRate(e.target.value) })}
        />,
        'e.g. 2.5 = 250 bps over index',
      )}
      {field('Reset Frequency',
        <select
          className="field-input"
          value={p.resetFrequency ?? ''}
          disabled={locked}
          onChange={e => onChange({ resetFrequency: (e.target.value as ResetFrequency) || undefined })}
        >
          <option value="">— Select —</option>
          <option value="monthly">Monthly</option>
          <option value="quarterly">Quarterly</option>
          <option value="annual">Annual</option>
        </select>,
      )}
      <div className="field-group instrument-form-field--full">
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={p.chathamEnabled !== false}
            disabled={locked}
            onChange={e => onChange({ chathamEnabled: e.target.checked })}
          />
          Use Chatham forward curve
        </label>
        <p className="field-hint">Chatham integration pending (build step 15) — projections use manual rate when off</p>
      </div>
      {p.chathamEnabled === false && field('Manual Rate (%)',
        <input
          type="number"
          className="field-input"
          value={toDisplayRate(p.manualRate)}
          min={0} max={30} step={0.001}
          placeholder="e.g. 8.0"
          disabled={locked}
          onChange={e => onChange({ manualRate: fromDisplayRate(e.target.value) })}
        />,
        'Flat rate for projections',
      )}
    </>
  )

  return (
    <div className="instrument-card-body">

      {/* ── Basic identification (always shown) ── */}
      <div className="instrument-form-grid">
        {field('Lender / Name',
          <input
            type="text"
            className="field-input"
            value={p.lender ?? ''}
            placeholder="e.g. Wells Fargo, Bridge Lender"
            disabled={locked}
            onChange={e => onChange({ lender: e.target.value })}
          />,
          undefined, true,
        )}
        {field('Position',
          <select
            className="field-input"
            value={p.position}
            disabled={locked}
            onChange={e => onChange({ position: e.target.value as LoanPosition })}
          >
            <option value="senior">Senior Debt</option>
            <option value="subordinate">Subordinate (Mezzanine)</option>
            <option value="pref_equity">Preferred Equity</option>
          </select>,
        )}
        {field('Loan Amount',
          <CurrencyInput
            className="field-input"
            value={p.loanAmount}
            disabled={locked}
            onChange={v => onChange({ loanAmount: v })}
          />,
        )}
        {field('Origination Date',
          <input
            type="month"
            className="field-input"
            value={p.startDate}
            disabled={locked}
            onChange={e => onChange({ startDate: e.target.value })}
          />,
        )}
        {field('First Payment Month',
          <input
            type="month"
            className="field-input"
            value={p.firstPaymentMonth ?? ''}
            disabled={locked}
            onChange={e => onChange({ firstPaymentMonth: e.target.value || undefined })}
          />,
          'Month of first scheduled payment',
        )}
        {field('Term (years)',
          <input
            type="number"
            className="field-input"
            value={p.termYears || ''}
            min={1} max={40} step={1}
            disabled={locked}
            onChange={e => onChange({ termYears: parseInt(e.target.value) || 0 })}
          />,
        )}
      </div>

      {/* ── Preferred Equity configuration ── */}
      {isPrefEq && (
        <div className="instrument-form-section">
          <div className="instrument-form-section-title">Preferred Equity Terms</div>
          <div className="instrument-form-grid">
            {field('Pref Rate (%)',
              <input
                type="number"
                className="field-input"
                value={toDisplayRate(p.prefEquityRate)}
                min={0} max={50} step={0.001}
                placeholder="e.g. 8.0"
                disabled={locked}
                onChange={e => onChange({ prefEquityRate: fromDisplayRate(e.target.value) })}
              />,
              'Annual preferred return rate',
            )}
            {field('Compounding',
              <select
                className="field-input"
                value={p.prefEquityCompounding ?? 'quarterly'}
                disabled={locked}
                onChange={e => onChange({ prefEquityCompounding: e.target.value as PrefCompounding })}
              >
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annual">Annual</option>
              </select>,
            )}
            {field('Closing Fee ($)',
              <CurrencyInput
                className="field-input"
                value={p.prefEquityClosingFee ?? 0}
                disabled={locked}
                onChange={v => onChange({ prefEquityClosingFee: v })}
              />,
              'One-time fee at close (enter 0 if none)',
            )}
          </div>
          <div className="info-box" style={{ marginTop: 12 }}>
            <strong>Redemption priority:</strong> Pref equity is redeemed ahead of LP/GP common equity at exit,
            after all senior and subordinate debt has been repaid.
          </div>
          <div className="pref-equity-banner" style={{ marginTop: 12 }}>
            <span className="pref-equity-banner-icon" aria-hidden="true">ℹ</span>
            <p>
              <strong>Dual nature:</strong> This instrument books as <strong>equity</strong> on
              the balance sheet (not debt), but receives <strong>Tier 0 priority</strong> in the
              waterfall distribution above LP common equity.
            </p>
          </div>
        </div>
      )}

      {/* ── Debt structure (non-pref-equity only) ── */}
      {!isPrefEq && (
        <>
          {/* Loan Type */}
          <div className="instrument-form-section">
            <div className="instrument-form-section-title">Loan Structure</div>
            <div className="instrument-form-grid">
              {field('Loan Type',
                <select
                  className="field-input"
                  value={p.loanType}
                  disabled={locked}
                  onChange={e => onChange({ loanType: e.target.value as LoanType })}
                >
                  <option value="fixed">Fixed Rate</option>
                  <option value="floating">Floating Rate</option>
                  <option value="io">Interest Only</option>
                  <option value="hybrid">Hybrid (IO + Amort)</option>
                  <option value="construction">Construction Loan</option>
                </select>,
              )}
            </div>
          </div>

          {/* ── Fixed rate ── */}
          {p.loanType === 'fixed' && (
            <div className="instrument-form-section">
              <div className="instrument-form-section-title">Rate &amp; Amortization</div>
              <div className="instrument-form-grid">
                {field('Fixed Rate (%)',
                  <input
                    type="number"
                    className="field-input"
                    value={toDisplayRate(p.fixedRate)}
                    min={0} max={30} step={0.001}
                    placeholder="e.g. 6.5"
                    disabled={locked}
                    onChange={e => onChange({ fixedRate: fromDisplayRate(e.target.value) })}
                  />,
                  'Enter as percentage — e.g. 6.5 for 6.500%',
                )}
                {field('Amortization (years)',
                  <input
                    type="number"
                    className="field-input"
                    value={p.amortizationYears || ''}
                    min={1} max={40} step={1}
                    placeholder="e.g. 30"
                    disabled={locked}
                    onChange={e => onChange({ amortizationYears: parseInt(e.target.value) || undefined })}
                  />,
                  'Leave blank for IO throughout',
                )}
              </div>
            </div>
          )}

          {/* ── Floating rate ── */}
          {p.loanType === 'floating' && (
            <div className="instrument-form-section">
              <div className="instrument-form-section-title">Floating Rate</div>
              <div className="instrument-form-grid">
                {floatingSubFields}
                {field('Amortization (years)',
                  <input
                    type="number"
                    className="field-input"
                    value={p.amortizationYears || ''}
                    min={1} max={40} step={1}
                    placeholder="e.g. 30"
                    disabled={locked}
                    onChange={e => onChange({ amortizationYears: parseInt(e.target.value) || undefined })}
                  />,
                  'Required — use IO loan type for interest-only floating',
                )}
              </div>
            </div>
          )}

          {/* ── IO (interest-only) ── */}
          {p.loanType === 'io' && (
            <div className="instrument-form-section">
              <div className="instrument-form-section-title">Rate</div>
              <div className="instrument-form-grid">
                {rateTypeToggle}
                {!p.rateIsFloating
                  ? field('Fixed Rate (%)',
                      <input
                        type="number"
                        className="field-input"
                        value={toDisplayRate(p.fixedRate)}
                        min={0} max={30} step={0.001}
                        placeholder="e.g. 7.0"
                        disabled={locked}
                        onChange={e => onChange({ fixedRate: fromDisplayRate(e.target.value) })}
                      />,
                      'Enter as percentage',
                    )
                  : floatingSubFields
                }
              </div>
              <div className="info-box" style={{ marginTop: 12 }}>
                Interest only for full term. Balloon payment at maturity — no principal reduction.
              </div>
            </div>
          )}

          {/* ── Hybrid (IO + amortizing) ── */}
          {p.loanType === 'hybrid' && (
            <div className="instrument-form-section">
              <div className="instrument-form-section-title">Hybrid Structure &amp; Rate</div>
              <div className="instrument-form-grid">
                {field('IO Period (months)',
                  <input
                    type="number"
                    className="field-input"
                    value={p.ioMonths || ''}
                    min={1} max={360} step={1}
                    placeholder="e.g. 24"
                    disabled={locked}
                    onChange={e => onChange({ ioMonths: parseInt(e.target.value) || 0 })}
                  />,
                  'Must be less than amortization schedule length (amort years × 12)',
                )}
                {field('Amortization (years)',
                  <input
                    type="number"
                    className="field-input"
                    value={p.amortizationYears || ''}
                    min={1} max={40} step={1}
                    placeholder="e.g. 30"
                    disabled={locked}
                    onChange={e => onChange({ amortizationYears: parseInt(e.target.value) || undefined })}
                  />,
                  'Total amortization schedule length',
                )}
                {rateTypeToggle}
                {!p.rateIsFloating
                  ? field('Fixed Rate (%)',
                      <input
                        type="number"
                        className="field-input"
                        value={toDisplayRate(p.fixedRate)}
                        min={0} max={30} step={0.001}
                        placeholder="e.g. 6.5"
                        disabled={locked}
                        onChange={e => onChange({ fixedRate: fromDisplayRate(e.target.value) })}
                      />,
                    )
                  : floatingSubFields
                }
              </div>
            </div>
          )}

          {/* ── Construction loan ── */}
          {p.loanType === 'construction' && (
            <div className="instrument-form-section">
              <div className="instrument-form-section-title">Construction Structure</div>
              <div className="instrument-form-grid">
                {field('Initial Draw at Close ($)',
                  <CurrencyInput
                    className="field-input"
                    value={p.initialDrawAtClose ?? 0}
                    disabled={locked}
                    onChange={v => onChange({ initialDrawAtClose: v })}
                  />,
                  'Amount drawn at closing',
                )}
                {field('Construction Period (months)',
                  <input
                    type="number"
                    className="field-input"
                    value={p.drawMonths || ''}
                    min={1} max={60} step={1}
                    placeholder="e.g. 18"
                    disabled={locked}
                    onChange={e => onChange({ drawMonths: parseInt(e.target.value) || undefined })}
                  />,
                  'v1: straight-line draws assumed',
                )}
                {field('Funded Interest Reserve ($)',
                  <CurrencyInput
                    className="field-input"
                    value={p.fundedInterestReserveAmount ?? 0}
                    disabled={locked}
                    onChange={v => onChange({
                      fundedInterestReserveAmount: v,
                      hasFundedInterestReserve: v > 0,
                    })}
                  />,
                  'Funded at close; interest capitalized during construction (enter 0 if none)',
                )}
                {rateTypeToggle}
                {!p.rateIsFloating
                  ? field('Fixed Rate (%)',
                      <input
                        type="number"
                        className="field-input"
                        value={toDisplayRate(p.fixedRate)}
                        min={0} max={30} step={0.001}
                        placeholder="e.g. 7.5"
                        disabled={locked}
                        onChange={e => onChange({ fixedRate: fromDisplayRate(e.target.value) })}
                      />,
                    )
                  : floatingSubFields
                }
              </div>

              {/* Convert to Perm */}
              <div style={{ marginTop: 16 }}>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={!!p.hasPermanentConversion}
                    disabled={locked}
                    onChange={e => onChange({ hasPermanentConversion: e.target.checked })}
                  />
                  Convert to permanent loan
                </label>
              </div>
              {p.hasPermanentConversion && (
                <div className="perm-conversion-card">
                  <div className="instrument-form-section-title" style={{ marginBottom: 12 }}>
                    Permanent Loan Terms
                  </div>
                  <div className="instrument-form-grid">
                    {field('Perm Loan Type',
                      <select
                        className="field-input"
                        value={p.permLoanType ?? 'fixed'}
                        disabled={locked}
                        onChange={e => onChange({ permLoanType: e.target.value as 'fixed' | 'floating' })}
                      >
                        <option value="fixed">Fixed Rate</option>
                        <option value="floating">Floating Rate</option>
                      </select>,
                    )}
                    {field('Perm Amount ($)',
                      <CurrencyInput
                        className="field-input"
                        value={p.permLoanAmount ?? 0}
                        disabled={locked}
                        onChange={v => onChange({ permLoanAmount: v })}
                      />,
                    )}
                    {field('Perm Rate (%)',
                      <input
                        type="number"
                        className="field-input"
                        value={toDisplayRate(p.permRate)}
                        min={0} max={30} step={0.001}
                        placeholder="e.g. 6.0"
                        disabled={locked}
                        onChange={e => onChange({ permRate: fromDisplayRate(e.target.value) })}
                      />,
                    )}
                    {field('Perm Term (years)',
                      <input
                        type="number"
                        className="field-input"
                        value={p.permTermYears || ''}
                        min={1} max={40} step={1}
                        disabled={locked}
                        onChange={e => onChange({ permTermYears: parseInt(e.target.value) || undefined })}
                      />,
                    )}
                    {field('Perm Amortization (years)',
                      <input
                        type="number"
                        className="field-input"
                        value={p.permAmortYears || ''}
                        min={1} max={40} step={1}
                        disabled={locked}
                        onChange={e => onChange({ permAmortYears: parseInt(e.target.value) || undefined })}
                      />,
                    )}
                    {field('Conversion Date',
                      <input
                        type="month"
                        className="field-input"
                        value={p.permConversionDate ?? ''}
                        disabled={locked}
                        onChange={e => onChange({ permConversionDate: e.target.value || undefined })}
                      />,
                      'Month of perm conversion',
                    )}
                  </div>
                </div>
              )}
              <div className="info-box" style={{ marginTop: 12 }}>
                v1: straight-line draws assumed. Custom draw schedules deferred to v2.
              </div>
            </div>
          )}

          {/* ── Rate Cap (floating only) ── */}
          {isFloating && (
            <div className="instrument-form-section">
              <div className="instrument-form-section-title">Rate Cap</div>
              <div className="field-group" style={{ marginBottom: 12 }}>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={!!p.hasCap}
                    disabled={locked}
                    onChange={e => onChange({ hasCap: e.target.checked })}
                  />
                  This instrument has a rate cap
                </label>
              </div>
              {p.hasCap && (
                <div className="instrument-form-grid">
                  {field('Strike Rate (%)',
                    <input
                      type="number"
                      className="field-input"
                      value={toDisplayRate(p.capStrikeRate)}
                      min={0} max={30} step={0.001}
                      placeholder="e.g. 5.0"
                      disabled={locked}
                      onChange={e => onChange({ capStrikeRate: fromDisplayRate(e.target.value) })}
                    />,
                  )}
                  {field('Cap Premium ($)',
                    <CurrencyInput
                      className="field-input"
                      value={p.capPremium ?? 0}
                      disabled={locked}
                      onChange={v => onChange({ capPremium: v })}
                    />,
                    'Capitalized at cost, straight-line amortized (ASC 815 MTM deferred to v2)',
                  )}
                  {field('Cap Term (months)',
                    <input
                      type="number"
                      className="field-input"
                      value={p.capTermMonths || ''}
                      min={1} step={1}
                      placeholder="e.g. 60"
                      disabled={locked}
                      onChange={e => onChange({ capTermMonths: parseInt(e.target.value) || undefined })}
                    />,
                  )}
                  {field('Cap Counterparty',
                    <input
                      type="text"
                      className="field-input"
                      value={p.capCounterparty ?? ''}
                      placeholder="e.g. Chatham Financial"
                      disabled={locked}
                      onChange={e => onChange({ capCounterparty: e.target.value || undefined })}
                    />,
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Additional Terms ── */}
          <div className="instrument-form-section">
            <div className="instrument-form-section-title">Additional Terms</div>
            <div className="instrument-form-grid">
              {field('Origination Fees (%)',
                <input
                  type="number"
                  className="field-input"
                  value={toDisplayRate(p.originationFees)}
                  min={0} max={10} step={0.001}
                  placeholder="e.g. 1.0"
                  disabled={locked}
                  onChange={e => onChange({ originationFees: fromDisplayRate(e.target.value) || undefined })}
                />,
                'e.g. 1.0 = 1 point (informational)',
              )}
              <div className="field-group">
                <label className="field-label">Recourse</label>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={!!p.isRecourse}
                    disabled={locked}
                    onChange={e => onChange({ isRecourse: e.target.checked })}
                  />
                  Recourse loan
                </label>
              </div>
              <div className="field-group">
                <label className="field-label">Prepayment Penalty</label>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={!!p.hasPrepaymentPenalty}
                    disabled={locked}
                    onChange={e => onChange({ hasPrepaymentPenalty: e.target.checked })}
                  />
                  Has prepayment penalty
                </label>
              </div>
            </div>
            {p.hasPrepaymentPenalty && (
              <div className="instrument-form-grid" style={{ marginTop: 12 }}>
                {field('Penalty Type',
                  <select
                    className="field-input"
                    value={p.prepaymentPenaltyType ?? ''}
                    disabled={locked}
                    onChange={e => onChange({ prepaymentPenaltyType: (e.target.value as PrepaymentPenaltyType) || undefined })}
                  >
                    <option value="">— Select —</option>
                    <option value="step_down">Step-Down</option>
                    <option value="yield_maintenance">Yield Maintenance</option>
                    <option value="flat">Flat</option>
                  </select>,
                )}
                {field('Penalty Term (months)',
                  <input
                    type="number"
                    className="field-input"
                    value={p.prepaymentPenaltyTerm || ''}
                    min={1} step={1}
                    placeholder="e.g. 60"
                    disabled={locked}
                    onChange={e => onChange({ prepaymentPenaltyTerm: parseInt(e.target.value) || undefined })}
                  />,
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Amortization schedule preview (debt only) ── */}
      {!isPrefEq && instrument.loanAmount > 0 && instrument.termYears > 0 && (
        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onToggleAmort}
          >
            {showAmort ? '▲ Hide amortization schedule' : '▼ View amortization schedule'}
          </button>
          {showAmort && <AmortPreview instrument={instrument} />}
        </div>
      )}
    </div>
  )
}

// ─── Sources & Uses panel ─────────────────────────────────────────────────────

const SUPanel: React.FC<{ stack: CapitalStack }> = ({ stack }) => {
  const sau = computeSourcesAndUses(stack)
  const fmt = (n: number) => fmtCurrency(n)
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`

  const hasData = stack.purchasePrice > 0

  return (
    <div className="su-panel">
      <div className="su-panel-title">Sources &amp; Uses</div>

      {!hasData ? (
        <p style={{ fontSize: 12.5, color: 'var(--color-slate-400)', margin: 0 }}>
          Enter a purchase price to see the capital stack breakdown.
        </p>
      ) : (
        <>
          {/* Uses */}
          <div className="su-section-label">Uses</div>
          <div className="su-row su-row--indent">
            <span>Purchase Price</span>
            <span>{fmt(sau.uses.purchasePrice)}</span>
          </div>
          {sau.uses.closingCosts > 0 && (
            <div className="su-row su-row--indent">
              <span>Closing Costs</span>
              <span>{fmt(sau.uses.closingCosts)}</span>
            </div>
          )}
          {sau.uses.operatingReserves > 0 && (
            <div className="su-row su-row--indent">
              <span>Operating Reserves</span>
              <span>{fmt(sau.uses.operatingReserves)}</span>
            </div>
          )}
          {sau.uses.capexReserves > 0 && (
            <div className="su-row su-row--indent">
              <span>CapEx Reserves</span>
              <span>{fmt(sau.uses.capexReserves)}</span>
            </div>
          )}
          {sau.uses.otherUses > 0 && (
            <div className="su-row su-row--indent">
              <span>{stack.otherUsesLabel?.trim() || 'Other Costs'}</span>
              <span>{fmt(sau.uses.otherUses)}</span>
            </div>
          )}
          <div className="su-row su-row--total">
            <span>Total Uses</span>
            <span>{fmt(sau.uses.total)}</span>
          </div>

          {/* Sources */}
          <div className="su-section-label">Sources</div>
          {Object.entries(sau.sources.byPosition).map(([pos, amt]) => (
            <div key={pos} className="su-row su-row--indent">
              <span>{positionLabel(pos as any)}</span>
              <span>{fmt(amt ?? 0)}</span>
            </div>
          ))}
          <div className="su-row su-row--indent">
            <span>Equity Raise</span>
            <span>{fmt(sau.sources.equity)}</span>
          </div>
          <div className="su-row su-row--total">
            <span>Total Sources</span>
            <span>{fmt(sau.sources.total)}</span>
          </div>

          {/* Gap/surplus warning */}
          {Math.abs(sau.gapOrSurplus) > 1 && (
            <div className={`su-row ${sau.gapOrSurplus > 0 ? 'su-row--surplus' : 'su-row--gap'}`}
              style={{ marginTop: 8 }}>
              <span>{sau.gapOrSurplus > 0 ? 'Surplus' : 'Gap'}</span>
              <span>{fmt(Math.abs(sau.gapOrSurplus))}</span>
            </div>
          )}

          {/* LTV / LTC */}
          {sau.sources.totalDebt > 0 && (
            <div className="su-metrics">
              <div className="su-metric">
                <div className="su-metric-label">LTV</div>
                <div className="su-metric-value">{pct(sau.ltv)}</div>
              </div>
              <div className="su-metric">
                <div className="su-metric-label">LTC</div>
                <div className="su-metric-value">{pct(sau.ltc)}</div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Main Section A component ─────────────────────────────────────────────────

interface Props {
  dealId: string
  locked: boolean
  setTab: (tab: 'A' | 'B' | 'C') => void
}

export const SectionA: React.FC<Props> = ({ dealId, locked, setTab }) => {
  const deal = useEconomicsStore(s => s.deals.find(d => d.dealId === dealId))
  const {
    updateCapitalStack,
    addInstrument,
    updateInstrument,
    removeInstrument,
    setSectionComplete,
    markPrefEquityWarningSeen,
  } = useEconomicsStore()

  const [expandedId,  setExpandedId]  = useState<string | null>(null)
  const [amortId,     setAmortId]     = useState<string | null>(null)
  const [showNewForm, setShowNewForm] = useState(false)
  const [draft, setDraft] = useState<Omit<DebtInstrument, 'id'>>(blankInstrument)
  const [notification, setNotification] = useState<string | null>(null)

  if (!deal) return null

  const stack       = deal.capitalStack ?? emptyStack()
  const instruments = stack.instruments
  const errors      = validateSectionA(deal)
  const canComplete = errors.length === 0 && stack.purchasePrice > 0

  function patchStack(patch: Partial<CapitalStack>) {
    updateCapitalStack(dealId, { ...stack, ...patch })
    if (deal!.sectionAComplete) setSectionComplete(dealId, 'A', false)
  }

  function handleRemove(id: string) {
    if (expandedId === id) setExpandedId(null)
    if (amortId === id)    setAmortId(null)
    removeInstrument(dealId, id)
    if (deal!.sectionAComplete) setSectionComplete(dealId, 'A', false)
  }

  function handleInstrumentChange(id: string, patch: Partial<DebtInstrument>) {
    // Show pref equity warning once when first switching to pref_equity position
    if (patch.position === 'pref_equity' && !deal!.hasSeenPrefEquityWarning) {
      markPrefEquityWarningSeen(dealId)
    }
    updateInstrument(dealId, id, patch)
    if (deal!.sectionAComplete) setSectionComplete(dealId, 'A', false)
  }

  function handleAddInstrument() {
    if (!draft.loanAmount || !draft.termYears) {
      setNotification('Loan amount and term are required.')
      setTimeout(() => setNotification(null), 3000)
      return
    }
    const newId = addInstrument(dealId, draft)
    setDraft(blankInstrument())
    setShowNewForm(false)
    setExpandedId(newId)
    if (deal!.sectionAComplete) setSectionComplete(dealId, 'A', false)
  }

  function handleComplete() {
    if (!canComplete) return
    setSectionComplete(dealId, 'A', true)
    setNotification('Section A complete.')
    setTab('B')
    setTimeout(() => setNotification(null), 3000)
  }

  return (
    <div>
      {/* ── Capital Stack basics ── */}
      <div className="econ-a-layout">
        <div className="econ-main">

          <div className="form-section">
            <h2 className="form-section-title">Capital Stack</h2>

            <div className="instrument-form-grid">
              <div className="field-group">
                <label className="field-label">Purchase Price</label>
                <CurrencyInput
                  className="field-input"
                  value={stack.purchasePrice}
                  disabled={locked}
                  onChange={v => patchStack({ purchasePrice: v })}
                />
              </div>
              <div className="field-group">
                <label className="field-label">Closing Date</label>
                <input
                  type="date"
                  className="field-input"
                  value={stack.closingDate ?? ''}
                  disabled={locked}
                  onChange={e => patchStack({ closingDate: e.target.value || undefined })}
                />
                <p className="field-hint">Target or actual closing date</p>
              </div>
            </div>

            <div className="instrument-form-section-title" style={{ marginTop: 20, marginBottom: 12 }}>
              Acquisition Costs &amp; Reserves
            </div>

            <div className="instrument-form-grid">
              <div className="field-group">
                <label className="field-label">Closing Costs</label>
                <CurrencyInput
                  className="field-input"
                  value={stack.closingCosts}
                  disabled={locked}
                  onChange={v => patchStack({ closingCosts: v })}
                />
                <p className="field-hint">Title, legal, transfer tax, lender fees</p>
              </div>
              <div className="field-group">
                <label className="field-label">Initial Operating Reserves</label>
                <CurrencyInput
                  className="field-input"
                  value={stack.operatingReserves ?? 0}
                  disabled={locked}
                  onChange={v => patchStack({ operatingReserves: v })}
                />
                <p className="field-hint">Funded operating reserve at close</p>
              </div>
              <div className="field-group">
                <label className="field-label">Initial CapEx Reserves</label>
                <CurrencyInput
                  className="field-input"
                  value={stack.capexReserves ?? 0}
                  disabled={locked}
                  onChange={v => patchStack({ capexReserves: v })}
                />
                <p className="field-hint">Improvement / renovation reserve at close</p>
              </div>
              <div className="field-group">
                <label className="field-label">
                  {stack.otherUsesLabel?.trim() || 'Other Acquisition Costs'}
                </label>
                <CurrencyInput
                  className="field-input"
                  value={stack.otherUses}
                  disabled={locked}
                  onChange={v => patchStack({ otherUses: v })}
                />
              </div>
              <div className="field-group">
                <label className="field-label">Other Costs Label (optional)</label>
                <input
                  type="text"
                  className="field-input"
                  value={stack.otherUsesLabel ?? ''}
                  placeholder="e.g. Earnest Money, Escrow Holdback"
                  disabled={locked}
                  onChange={e => patchStack({ otherUsesLabel: e.target.value || undefined })}
                />
              </div>
            </div>
          </div>

          {/* ── Debt instruments ── */}
          <div className="form-section">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 className="form-section-title" style={{ margin: 0 }}>Debt Instruments</h2>
              {!locked && instruments.length < 5 && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => { setShowNewForm(true); setExpandedId(null) }}
                  disabled={showNewForm}
                >
                  + Add Instrument
                </button>
              )}
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--color-slate-400)', marginBottom: 16 }}>
              Senior required if any debt. Max 5 instruments.
              {instruments.length > 0 && ` ${instruments.length}/5 added.`}
            </p>

            {/* Instrument cards */}
            <div className="instrument-list">
              {instruments.map(inst => {
                const isExpanded = expandedId === inst.id
                return (
                  <div key={inst.id} className="instrument-card">
                    {/* Card header (always visible) */}
                    <div
                      className="instrument-card-header"
                      onClick={() => setExpandedId(isExpanded ? null : inst.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={e => e.key === 'Enter' && setExpandedId(isExpanded ? null : inst.id)}
                      aria-expanded={isExpanded}
                    >
                      <span className={`instrument-position-badge instrument-position-badge--${inst.position}`}>
                        {POSITION_LABELS[inst.position]}
                      </span>
                      <div className="instrument-card-summary">
                        <div className="instrument-card-name">
                          {inst.lender || POSITION_LABELS[inst.position]}
                        </div>
                        <div className="instrument-card-meta">
                          {instrumentSummaryMeta(inst)}
                        </div>
                      </div>
                      <div className="instrument-card-actions">
                        <span className="instrument-card-chevron" aria-hidden="true">
                          {isExpanded ? '▲' : '▼'}
                        </span>
                        {!locked && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs"
                            style={{ color: 'var(--color-error)' }}
                            onClick={e => { e.stopPropagation(); handleRemove(inst.id) }}
                            aria-label={`Remove ${inst.lender || 'instrument'}`}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Expanded form */}
                    {isExpanded && (
                      <InstrumentForm
                        instrument={inst}
                        onChange={p => handleInstrumentChange(inst.id, p)}
                        locked={locked}
                        showAmort={amortId === inst.id}
                        onToggleAmort={() => setAmortId(amortId === inst.id ? null : inst.id)}
                      />
                    )}
                  </div>
                )
              })}

              {instruments.length === 0 && !showNewForm && (
                <div className="empty-state" style={{ minHeight: 100, border: '1px dashed var(--color-slate-200)', borderRadius: 8 }}>
                  <p className="empty-state-title" style={{ fontSize: 13 }}>No debt instruments added</p>
                  <p style={{ fontSize: 12, color: 'var(--color-slate-400)' }}>
                    All-equity deal — equity raise equals total uses.
                  </p>
                </div>
              )}

              {/* New instrument form */}
              {showNewForm && (
                <div className="new-instrument-form">
                  <div className="new-instrument-form-title">New Debt Instrument</div>
                  <InstrumentForm
                    instrument={{ ...draft, id: '__new__' }}
                    onChange={p => setDraft(prev => ({ ...prev, ...p }))}
                    locked={false}
                    showAmort={false}
                    onToggleAmort={() => {}}
                  />
                  <div className="econ-section-actions">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => { setShowNewForm(false); setDraft(blankInstrument()) }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={handleAddInstrument}
                    >
                      Add Instrument
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Validation errors ── */}
          {errors.length > 0 && (
            <div className="econ-section-errors">
              <div className="econ-section-errors-title">Required to complete this section:</div>
              <ul>
                {errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}

          {/* ── Complete badge or action ── */}
          {deal.sectionAComplete ? (
            <div className="econ-section-complete">
              <span aria-hidden="true">✓</span>
              Section A complete
              {!locked && (
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  style={{ marginLeft: 'auto' }}
                  onClick={() => setSectionComplete(dealId, 'A', false)}
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
                Complete Section A
              </button>
            </div>
          )}

          {notification && (
            <div className="notification notification--success" style={{ marginTop: 12 }}>
              {notification}
            </div>
          )}
        </div>

        {/* ── S&U right rail ── */}
        <div className="econ-rail">
          <SUPanel stack={stack} />
        </div>
      </div>
    </div>
  )
}
