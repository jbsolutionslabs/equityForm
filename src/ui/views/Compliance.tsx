import React, { useMemo, useState } from 'react'
import { COMPLIANCE_RULES, DE_ENTITY_SEARCH_URL } from '../../compliance/config'
import type { ComplianceEntityInput, ComplianceEntityType } from '../../compliance/types'
import { daysUntilDue, formatLongDate } from '../../compliance/utils'
import { complianceStatus, useComplianceStore } from '../../state/complianceStore'

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

export const Compliance: React.FC = () => {
  const entities = useComplianceStore((s) => s.entities)
  const addEntity = useComplianceStore((s) => s.addEntity)
  const updateEntity = useComplianceStore((s) => s.updateEntity)
  const deleteEntity = useComplianceStore((s) => s.deleteEntity)
  const markPaid = useComplianceStore((s) => s.markPaid)
  const runDailyCron = useComplianceStore((s) => s.runDailyCron)

  const [form, setForm] = useState<ComplianceEntityInput>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)

  const sorted = useMemo(
    () => [...entities].sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate)),
    [entities],
  )

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
          Delaware annual tax reminders with email/SMS scheduling, payment tracking, and cycle rollover.
        </p>
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
