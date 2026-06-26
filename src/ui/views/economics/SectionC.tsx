import React, { useState } from 'react'
import { useEconomicsStore } from '../../../state/economicsStore'
import { validateSectionC } from '../../../utils/economicsValidation'
import type { FeeEntry, FeeToggle, FeeBasisType } from '../../../state/economicsTypes'
import { CurrencyInput } from '../../components/CurrencyInput'
import { Tooltip } from '../../components/HelpCard'

// ─── Display helpers ──────────────────────────────────────────────────────────

const FEE_TYPE_HINTS: Record<string, string> = {
  acquisition:       'Charged at close on the purchase price',
  asset_management:  'Annual fee charged on equity or revenue',
  disposition:       'Charged on sale proceeds at exit',
  construction_mgmt: 'Charged on hard construction costs',
  financing:         'Charged on loan proceeds at close',
}

const BASIS_LABELS: Record<FeeBasisType, string> = {
  pct_purchase:      '% of Purchase Price',
  pct_raise:         '% of Equity Raise',
  pct_cost:          '% of Total Cost',
  flat:              'Flat Dollar Amount',
  pct_revenue:       '% of Annual Revenue',
  pct_sales_price:   '% of Sales Price',
  pct_loan_proceeds: '% of Loan Proceeds',
}

function formatUSD(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

// ─── Single fee row ───────────────────────────────────────────────────────────

interface FeeRowProps {
  fee:    FeeEntry
  locked: boolean
  onToggle:  (enabled: FeeToggle) => void
  onChange:  (patch: Partial<FeeEntry>) => void
  onRemove?: () => void
  totalLoanProceeds?: number
}

const FeeRow: React.FC<FeeRowProps> = ({ fee, locked, onToggle, onChange, onRemove, totalLoanProceeds }) => {
  const isCustom = fee.type === 'custom'
  const isYes    = fee.enabled === 'yes'
  const isNo     = fee.enabled === 'no'
  const unanswered = fee.enabled === null

  return (
    <div className={`fee-row${unanswered ? ' fee-row--unanswered' : ''}`}>
      {/* Header row */}
      <div className="fee-row-header">
        <div className="fee-row-info">
          {isCustom ? (
            <input
              type="text"
              className="field-input fee-row-label-input"
              value={fee.label ?? ''}
              placeholder="Custom fee name"
              disabled={locked}
              onChange={e => onChange({ label: e.target.value })}
            />
          ) : (
            <div className="fee-row-label">{fee.label || fee.type}</div>
          )}
          {!isCustom && FEE_TYPE_HINTS[fee.type] && (
            <div className="fee-row-hint">{FEE_TYPE_HINTS[fee.type]}</div>
          )}
        </div>

        <div className="fee-toggle-group">
          <button
            type="button"
            className={`fee-toggle-btn${isYes ? ' fee-toggle-btn--yes' : ''}`}
            disabled={locked}
            onClick={() => onToggle('yes')}
          >
            Yes
          </button>
          <button
            type="button"
            className={`fee-toggle-btn${isNo ? ' fee-toggle-btn--no' : ''}`}
            disabled={locked}
            onClick={() => onToggle('no')}
          >
            No
          </button>
        </div>

        {isCustom && !locked && (
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            style={{ color: 'var(--color-error)', marginLeft: 8 }}
            onClick={onRemove}
            aria-label="Remove custom fee"
          >
            ✕
          </button>
        )}
      </div>

      {/* Detail fields — only when enabled */}
      {isYes && (
        <div className="fee-row-details">
          <div className="instrument-form-grid">
            <div className="field-group">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <label className="field-label" style={{ marginBottom: 0 }}>Basis</label>
                <Tooltip title="Fee Basis" content="Determines how the fee is calculated. % of Purchase Price and % of Equity Raise are standard for acquisition and financing fees. % of Revenue is typical for asset management fees. Flat Dollar is a fixed amount regardless of deal size. % of Total Cost includes purchase price plus capital expenditures." />
              </div>
              <select
                className="field-input"
                value={fee.basisType ?? ''}
                disabled={locked}
                onChange={e => onChange({ basisType: e.target.value as FeeBasisType })}
              >
                
                {fee.type === 'disposition' && (
                  <option value="pct_sales_price">% of Sales Price</option>
                )}
                {fee.type === 'financing' && (
                  <option value="pct_loan_proceeds">% of Loan Proceeds</option>
                )}
                <option value="pct_purchase">% of Purchase Price</option>
                <option value="pct_raise">% of Equity Raise</option>
                <option value="pct_cost">% of Total Cost</option>
                <option value="flat">Flat Dollar Amount</option>
                <option value="pct_revenue">% of Annual Revenue</option>
              </select>
            </div>

            {fee.basisType && fee.basisType !== 'flat' && (
              <div className="field-group">
                <label className="field-label">Rate (%)</label>
                <input
                  type="number"
                  className="field-input"
                  value={fee.rate != null ? parseFloat((fee.rate * 100).toFixed(4)) : ''}
                  min={0}
                  max={20}
                  step={1}
                  placeholder="e.g. 1.0"
                  disabled={locked}
                  onChange={e => {
                    const n = parseFloat(e.target.value)
                    onChange({ rate: isNaN(n) ? undefined : n / 100 })
                  }}
                />
                <p className="field-hint">Enter as percentage — e.g. 1.0 for 1.000%</p>
                {fee.basisType === 'pct_loan_proceeds' && (
                  <p className="field-hint" style={{ marginTop: 4 }}>
                    {totalLoanProceeds
                      ? <>Loan proceeds (senior + mezz + pref): <strong>{formatUSD(totalLoanProceeds)}</strong>{fee.rate != null ? <> — fee: <strong>{formatUSD(totalLoanProceeds * fee.rate)}</strong></> : null}</>
                      : 'Add debt instruments in Section A to compute loan proceeds.'}
                  </p>
                )}
              </div>
            )}

            {fee.basisType === 'flat' && (
              <div className="field-group">
                <label className="field-label">Flat Amount ($)</label>
                <CurrencyInput
                  className="field-input"
                  value={fee.flatAmount ?? 0}
                  disabled={locked}
                  onChange={v => onChange({ flatAmount: v })}
                />
              </div>
            )}

            <div className="field-group instrument-form-field--full">
              <label className="field-label">Notes (optional)</label>
              <input
                type="text"
                className="field-input"
                value={fee.notes ?? ''}
                placeholder="Additional detail for OA or investor materials"
                disabled={locked}
                onChange={e => onChange({ notes: e.target.value })}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Section C component ─────────────────────────────────────────────────

interface Props {
  dealId: string
  locked: boolean
}

export const SectionC: React.FC<Props> = ({ dealId, locked }) => {
  const deal = useEconomicsStore(s => s.deals.find(d => d.dealId === dealId))
  const { updateFee, addCustomFee, removeCustomFee, setSectionComplete } = useEconomicsStore()
  const [notification, setNotification] = useState<string | null>(null)

  if (!deal) return null

  const errors      = validateSectionC(deal)
  const canComplete = errors.length === 0

  const standardFees = deal.fees.filter(f => f.type !== 'custom')
  const customFees   = deal.fees.filter(f => f.type === 'custom')

  const totalLoanProceeds = (deal.capitalStack?.instruments ?? []).reduce(
    (sum, inst) => sum + (inst.loanAmount ?? 0), 0,
  )

  function handleToggle(feeId: string, enabled: FeeToggle) {
    updateFee(dealId, feeId, { enabled })
    if (deal!.sectionCComplete) setSectionComplete(dealId, 'C', false)
  }

  function handleChange(feeId: string, patch: Partial<FeeEntry>) {
    updateFee(dealId, feeId, patch)
    if (deal!.sectionCComplete) setSectionComplete(dealId, 'C', false)
  }

  function handleAddCustom() {
    addCustomFee(dealId)
    if (deal!.sectionCComplete) setSectionComplete(dealId, 'C', false)
  }

  function handleRemoveCustom(feeId: string) {
    removeCustomFee(dealId, feeId)
    if (deal!.sectionCComplete) setSectionComplete(dealId, 'C', false)
  }

  function handleComplete() {
    if (!canComplete) return
    setSectionComplete(dealId, 'C', true)
    setNotification('Section C complete.')
    setTimeout(() => setNotification(null), 3000)
  }

  const unansweredCount = standardFees.filter(f => f.enabled === null).length

  return (
    <div>
      <div className="form-section">
        <h2 className="form-section-title">Fee Schedule</h2>
        <p style={{ fontSize: 13, color: 'var(--color-slate-400)', marginBottom: 24, marginTop: -8 }}>
          Mark each fee Yes or No. All five standard fees require an explicit answer.
          {unansweredCount > 0 && (
            <strong style={{ color: 'var(--color-warning)', marginLeft: 6 }}>
              {unansweredCount} unanswered
            </strong>
          )}
        </p>

        {/* Standard fees */}
        <div className="fee-list">
          {standardFees.map(fee => (
            <FeeRow
              key={fee.id}
              fee={fee}
              locked={locked}
              onToggle={v => handleToggle(fee.id, v)}
              onChange={p => handleChange(fee.id, p)}
              totalLoanProceeds={fee.type === 'financing' ? totalLoanProceeds : undefined}
            />
          ))}
        </div>

        {/* Custom fees */}
        {customFees.length > 0 && (
          <>
            <div className="instrument-form-section-title" style={{ marginTop: 28, marginBottom: 12 }}>
              Custom Fees
            </div>
            <div className="fee-list">
              {customFees.map(fee => (
                <FeeRow
                  key={fee.id}
                  fee={fee}
                  locked={locked}
                  onToggle={v => handleToggle(fee.id, v)}
                  onChange={p => handleChange(fee.id, p)}
                  onRemove={() => handleRemoveCustom(fee.id)}
                />
              ))}
            </div>
          </>
        )}

        {/* Add custom fee */}
        {!locked && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ marginTop: 16 }}
            onClick={handleAddCustom}
          >
            + Add custom fee
          </button>
        )}
      </div>

      {/* Validation errors */}
      {errors.length > 0 && (
        <div className="econ-section-errors">
          <div className="econ-section-errors-title">Required to complete this section:</div>
          <ul>
            {errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}

      {/* Complete / reopen */}
      {deal.sectionCComplete ? (
        <div className="econ-section-complete">
          <span aria-hidden="true">✓</span>
          Section C complete
          {!locked && (
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              style={{ marginLeft: 'auto' }}
              onClick={() => setSectionComplete(dealId, 'C', false)}
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
            Complete Section C
          </button>
        </div>
      )}

      {notification && (
        <div className="notification notification--success" style={{ marginTop: 12 }}>
          {notification}
        </div>
      )}
    </div>
  )
}
