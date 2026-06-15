import React, { useMemo, useState } from 'react'
import { COMPLIANCE_RULES, DE_ENTITY_SEARCH_URL } from '../../compliance/config'
import type { ComplianceEntityInput, ComplianceEntityType } from '../../compliance/types'
import { daysUntilDue, formatLongDate } from '../../compliance/utils'
import { complianceStatus, useComplianceStore } from '../../state/complianceStore'
import { useAppStore } from '../../state/store'
import { BLUE_SKY_RULE_506_BY_STATE } from '../../utils/blueSkyRules'

const EMPTY_FORM: ComplianceEntityInput = {
  name: '',
  type: 'llc',
  email: '',
  phone: '',
  fileNumber: '',
}

function typeLabel(type: ComplianceEntityType): string {
  if (type === 'llc') return 'LLC / LP / GP'
  if (type === 'corp') return 'Domestic Corp'
  return 'Foreign Corp'
}

const blueSkyChecklistSteps = [
  {
    key: 'requirementsReviewed',
    label: 'Review state-specific blue sky requirements',
    hint: 'Confirm notice form type, deadlines, and exemptions for this jurisdiction.',
  },
  {
    key: 'stateNoticeFiled',
    label: 'File state notice (Form D notice filing)',
    hint: 'Submit the required state notice filing after SEC Form D filing, per state rules.',
  },
  {
    key: 'stateFeePaid',
    label: 'Pay state filing fee',
    hint: 'Record fee payment or waiver confirmation for this state filing.',
  },
  {
    key: 'evidenceSaved',
    label: 'Save evidence of filing and acceptance',
    hint: 'Keep copies of submission, receipt, and acceptance confirmation in your deal records.',
  },
] as const

function normalizeStateCode(input?: string): string | null {
  if (!input) return null
  const value = input.trim().toUpperCase()
  return value || null
}

function stateDisplayLabel(code: string): string {
  return BLUE_SKY_RULE_506_BY_STATE[code]?.stateName || code
}

function fmtRuleValue(value?: string): string {
  if (!value?.trim()) return 'Not listed'
  return value
}

export const Compliance: React.FC = () => {
  const entities = useComplianceStore((s) => s.entities)
  const addEntity = useComplianceStore((s) => s.addEntity)
  const updateEntity = useComplianceStore((s) => s.updateEntity)
  const deleteEntity = useComplianceStore((s) => s.deleteEntity)
  const markPaid = useComplianceStore((s) => s.markPaid)
  const runDailyCron = useComplianceStore((s) => s.runDailyCron)
  const deals = useAppStore((s) => s.deals)
  const setBlueSkyFilingStep = useAppStore((s) => s.setBlueSkyFilingStep)

  const [form, setForm] = useState<ComplianceEntityInput>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)

  const sorted = useMemo(
    () => [...entities].sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate)),
    [entities],
  )

  const blueSkyDeals = useMemo(() => {
    return Object.values(deals)
      .map((entry) => {
        const investorsByState = new Map<string, number>()
        entry.data.investors.forEach((investor) => {
          const code = normalizeStateCode(investor.state)
          if (!code) return
          investorsByState.set(code, (investorsByState.get(code) || 0) + 1)
        })

        const states = Array.from(investorsByState.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([code, count]) => {
            const rule = BLUE_SKY_RULE_506_BY_STATE[code]
            const filing = entry.data.blueSkyFilings[code] || {
              requirementsReviewed: false,
              stateNoticeFiled: false,
              stateFeePaid: false,
              evidenceSaved: false,
            }
            const requiresNotice = rule?.requiresFormDNoticeFiling !== false
            const completedCount = blueSkyChecklistSteps.reduce(
              (sum, step) => sum + (filing[step.key] ? 1 : 0),
              0,
            )
            const isComplete = requiresNotice
              ? completedCount === blueSkyChecklistSteps.length
              : true

            return {
              code,
              count,
              rule,
              filing,
              requiresNotice,
              completedCount,
              isComplete,
            }
          })

        return {
          dealId: entry.id,
          dealName: entry.data.deal.entityName || 'Untitled Deal',
          states,
        }
      })
      .filter((deal) => deal.states.length > 0)
  }, [deals])

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim() || !form.email.trim()) return
    if (editingId) {
      updateEntity(editingId, form)
    } else {
      addEntity(form)
    }
    setForm(EMPTY_FORM)
    setEditingId(null)
  }

  return (
    <div className="page-enter">
      <div className="page-header">
        <h1>Compliance</h1>
        <p className="page-header-subtitle">
          Delaware annual tax reminders plus blue sky filing checklists generated from your investor states.
        </p>
      </div>

      <div className="card">
        <h2 className="card-header">Blue sky filings</h2>
        <p className="card-subheader">
          Investor states are detected automatically from Investor Intake. Track filing work here instead of on the investor page.
        </p>
        {blueSkyDeals.length === 0 ? (
          <p className="card-subheader">No investor state checklists yet. Add investors with state information to generate blue sky tasks.</p>
        ) : (
          <div style={{ display: 'grid', gap: 16 }}>
            {blueSkyDeals.map((deal) => (
              <div key={deal.dealId} style={{ border: '1px solid var(--color-slate-200)', borderRadius: 12, padding: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>{deal.dealName}</div>
                <div style={{ display: 'grid', gap: 14 }}>
                  {deal.states.map((row) => (
                    <div
                      key={`${deal.dealId}-${row.code}`}
                      style={{
                        border: '1px solid var(--color-slate-200)',
                        borderRadius: 10,
                        padding: 12,
                        background: row.isComplete ? 'rgba(24, 124, 70, 0.06)' : 'var(--color-slate-50)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8, alignItems: 'center' }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>
                          {stateDisplayLabel(row.code)} ({row.code}){row.count > 1 ? ` · ${row.count} LPs` : ''}
                        </div>
                        <span className={`status-badge ${row.isComplete ? 'status-badge--paid' : 'status-badge--pending'}`} style={{ fontSize: 11 }}>
                          {row.requiresNotice ? `${row.completedCount}/${blueSkyChecklistSteps.length} complete` : 'No notice filing required'}
                        </span>
                      </div>

                      <div style={{ fontSize: 12.5, color: 'var(--color-slate-600)', marginBottom: 10, display: 'grid', gap: 4 }}>
                        <div><strong>New notice fee:</strong> {fmtRuleValue(row.rule?.newNoticeFee)}</div>
                        <div><strong>Fee type:</strong> {fmtRuleValue(row.rule?.feeType)}</div>
                        {!!row.rule?.variableCalculation && (
                          <div><strong>Variable calculation:</strong> {fmtRuleValue(row.rule?.variableCalculation)}</div>
                        )}
                        {!!row.rule?.lateFee && row.rule.lateFee !== 'No' && (
                          <div><strong>Late filing fee:</strong> {row.rule.lateFee}</div>
                        )}
                      </div>

                      {row.requiresNotice ? (
                        <div style={{ display: 'grid', gap: 8 }}>
                          {blueSkyChecklistSteps.map((step) => (
                            <label key={step.key} className="checkbox-row" style={{ alignItems: 'flex-start', marginTop: 0 }}>
                              <input
                                type="checkbox"
                                checked={Boolean(row.filing[step.key])}
                                onChange={(e) => setBlueSkyFilingStep(deal.dealId, row.code, step.key, e.target.checked)}
                              />
                              <span className="checkbox-label" style={{ display: 'grid', gap: 2 }}>
                                <span>{step.label}</span>
                                <span style={{ fontSize: 12, color: 'var(--color-slate-500)', fontWeight: 400 }}>{step.hint}</span>
                              </span>
                            </label>
                          ))}
                        </div>
                      ) : (
                        <div className="state-banner state-banner--success" style={{ marginBottom: 0 }}>
                          <span aria-hidden="true">✓</span>
                          <span style={{ fontSize: 12.5 }}>
                            This state is marked as not requiring a Rule 506 Form D notice filing in the provided dataset.
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="card-header">Add entity</h2>
        <p className="card-subheader">Track Delaware filing deadlines and send reminders at 30 / 7 / 0 days.</p>
        <form onSubmit={onSubmit}>
          <div className="form-row">
            <div className="field-group">
              <label className="field-label">Name *</label>
              <input className="field-input" value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} required />
            </div>
            <div className="field-group">
              <label className="field-label">Type *</label>
              <select className="field-input" value={form.type} onChange={(e) => setForm((s) => ({ ...s, type: e.target.value as ComplianceEntityType }))}>
                <option value="llc">LLC / LP / GP</option>
                <option value="corp">Domestic Corp</option>
                <option value="foreign_corp">Foreign Corp</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="field-group">
              <label className="field-label">Email *</label>
              <input className="field-input" type="email" value={form.email} onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))} required />
            </div>
            <div className="field-group">
              <label className="field-label">Phone (optional)</label>
              <input className="field-input" value={form.phone || ''} onChange={(e) => setForm((s) => ({ ...s, phone: e.target.value }))} placeholder="Add for SMS reminders" />
            </div>
          </div>
          <div className="field-group">
            <label className="field-label">File number (optional)</label>
            <input className="field-input" value={form.fileNumber || ''} onChange={(e) => setForm((s) => ({ ...s, fileNumber: e.target.value }))} placeholder="Speeds up DE portal lookup" />
            <div style={{ marginTop: 6 }}>
              <a href={DE_ENTITY_SEARCH_URL} target="_blank" rel="noreferrer">Find your file number ↗</a>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primary" type="submit">{editingId ? 'Save changes' : 'Save'}</button>
            {editingId && (
              <button className="btn btn-secondary" type="button" onClick={() => { setEditingId(null); setForm(EMPTY_FORM) }}>
                Cancel edit
              </button>
            )}
            <button className="btn btn-secondary" type="button" onClick={() => runDailyCron()}>
              Run daily cron (demo)
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <h2 className="card-header">Entities</h2>
        {sorted.length === 0 ? (
          <p className="card-subheader">No entities added yet.</p>
        ) : (
          <div className="compliance-table-wrap">
            <table className="compliance-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>File #</th>
                  <th>Next deadline</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((entity) => {
                  const status = complianceStatus(entity)
                  const days = daysUntilDue(entity.nextDueDate)
                  const rule = COMPLIANCE_RULES[entity.type]
                  return (
                    <tr key={entity.id}>
                      <td>{entity.name}<div className="compliance-sub">{entity.email}</div></td>
                      <td>{typeLabel(entity.type)}</td>
                      <td>{entity.fileNumber || '—'}</td>
                      <td>
                        {formatLongDate(entity.nextDueDate)}
                        <div className="compliance-sub">{days >= 0 ? `${days} days remaining` : `${Math.abs(days)} days overdue`}</div>
                      </td>
                      <td>
                        <span className={`status-badge ${status === 'paid' ? 'status-badge--green' : status === 'due_soon' ? 'status-badge--yellow' : 'status-badge--grey'}`}>
                          {status === 'paid' ? 'Paid for cycle' : status === 'due_soon' ? 'Due Soon' : 'Upcoming'}
                        </span>
                      </td>
                      <td>
                        <div className="compliance-actions">
                          <button
                            className="btn btn-secondary btn-xs"
                            type="button"
                            onClick={() => {
                              const ok = window.confirm(`Confirm you've paid the ${rule.amountLabel} DE franchise tax for ${entity.name}?`)
                              if (ok) markPaid(entity.id)
                            }}
                          >
                            Mark as paid
                          </button>
                          <button className="btn btn-secondary btn-xs" type="button" onClick={() => {
                            setEditingId(entity.id)
                            setForm({
                              name: entity.name,
                              type: entity.type,
                              email: entity.email,
                              phone: entity.phone || '',
                              fileNumber: entity.fileNumber || '',
                            })
                          }}>Edit</button>
                          <button className="btn btn-danger btn-xs" type="button" onClick={() => deleteEntity(entity.id)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
