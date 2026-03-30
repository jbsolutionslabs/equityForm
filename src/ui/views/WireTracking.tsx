import React, { useState } from 'react'
import { useAppStore } from '../../state/store'
import { HelpCard } from '../components/HelpCard'
import { CurrencyInput } from '../components/CurrencyInput'

export const WireTracking: React.FC = () => {
  const data         = useAppStore((s) => s.data)
  const investors    = data.investors
  const subscriptions = data.subscriptions
  const banking      = data.banking
  const recordWirePayment = useAppStore((s) => s.recordWirePayment)

  const [notification, setNotification] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [wireModal, setWireModal] = useState<{ investorId: string; name: string } | null>(null)
  const [wireConf, setWireConf]   = useState('')
  const [wireAmt, setWireAmt]     = useState(0)
  const [wireDate, setWireDate]   = useState('')
  const [copySuccess, setCopySuccess] = useState(false)

  const notify = (msg: string, type: 'success' | 'error' = 'success') => {
    setNotification({ msg, type })
    window.setTimeout(() => setNotification(null), 4000)
  }

  const getSub = (investorId: string) =>
    subscriptions.find((s) => s.investorId === investorId)

  const totalCommitted = investors.reduce((sum, inv) => sum + (inv.subscriptionAmount || 0), 0)
  const totalReceived  = investors.reduce((sum, inv) => {
    const sub = getSub(inv.id)
    return sub?.status === 'paid' ? sum + (inv.subscriptionAmount || 0) : sum
  }, 0)
  const totalAwaiting  = totalCommitted - totalReceived

  const wireInstructions = [
    { label: 'Bank name',       value: banking.bankName || '—' },
    { label: 'Account name',    value: banking.accountName || '—' },
    { label: 'Account number',  value: banking.accountNumber || '—' },
    { label: 'Routing number',  value: banking.routingNumber || '—' },
  ]

  const copyWireInstructions = () => {
    const text = wireInstructions.map((r) => `${r.label}: ${r.value}`).join('\n')
    navigator.clipboard.writeText(text).then(() => {
      setCopySuccess(true)
      window.setTimeout(() => setCopySuccess(false), 2000)
    })
  }

  const openWireModal = (investorId: string, name: string) => {
    setWireModal({ investorId, name })
    setWireConf('')
    setWireAmt('')
    setWireDate('')
  }

  const confirmWire = () => {
    if (!wireConf.trim()) {
      notify('Please enter a wire confirmation number.', 'error')
      return
    }
    if (wireModal) {
      recordWirePayment(wireModal.investorId, wireConf.trim(), wireAmt > 0 ? wireAmt : undefined, wireDate || undefined)
      notify(`Wire confirmed for ${wireModal.name}.`)
      setWireModal(null)
    }
  }

  const statusLabel = (status?: string) => {
    switch (status) {
      case 'signed':    return 'Awaiting wire'
      case 'paid':      return 'Received'
      case 'sent':      return 'Awaiting signature'
      case 'generated': return 'Sub generated'
      default:          return 'Not started'
    }
  }

  const statusClass = (status?: string) => {
    switch (status) {
      case 'paid':      return 'status-badge--paid'
      case 'signed':    return 'status-badge--signed'
      case 'sent':      return 'status-badge--sent'
      default:          return 'status-badge--pending'
    }
  }

  return (
    <div className="page-enter">
      <div className="page-header">
        <span className="page-header-eyebrow">Stage 6 of 7</span>
        <h1>Wire Tracking</h1>
        <p className="page-header-subtitle">
          Confirm capital received from each investor. Once all wires are confirmed, you can
          lock the cap table in Stage 7.
        </p>
      </div>

      {notification && (
        <div className={`notification notification--${notification.type}`} role="alert">
          {notification.type === 'success' ? '✓ ' : '⚠ '}{notification.msg}
        </div>
      )}

      {/* Capital summary */}
      <div className="capital-summary" style={{ marginBottom: 24 }}>
        <div className="capital-stat">
          <div className="capital-stat-value">${totalCommitted.toLocaleString()}</div>
          <div className="capital-stat-label">Target Amount</div>
        </div>
        <div className="capital-stat capital-stat--positive">
          <div className="capital-stat-value">${totalReceived.toLocaleString()}</div>
          <div className="capital-stat-label">Total Received</div>
        </div>
        <div className="capital-stat capital-stat--warning">
          <div className="capital-stat-value">${totalAwaiting.toLocaleString()}</div>
          <div className="capital-stat-label">Remaining Balance</div>
        </div>
        <div className="capital-stat">
          <div className="capital-stat-value">
            {totalCommitted > 0 ? Math.round((totalReceived / totalCommitted) * 100) : 0}%
          </div>
          <div className="capital-stat-label">Capital In</div>
        </div>
      </div>

      {/* Wire instructions card */}
      {(banking.bankName || banking.accountNumber) && (
        <div className="wire-card" style={{ marginBottom: 24 }}>
          <div className="wire-card-header">
            <div>
              <h3 style={{ margin: 0, fontSize: 15 }}>Wire Instructions</h3>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-slate-500)' }}>
                Share these with investors to send their capital contributions
              </p>
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={copyWireInstructions}>
              {copySuccess ? '✓ Copied!' : 'Copy'}
            </button>
          </div>
          <div className="wire-card-body">
            {wireInstructions.map((row) => (
              <div key={row.label} className="wire-row">
                <span className="wire-row-label">{row.label}</span>
                <span className="wire-row-value">{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Investor table */}
      {investors.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-title">No investors added yet.</div>
            <p className="empty-state-body">Add investors in Stage 4 and collect signatures in Stage 5 before tracking wires.</p>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table className="data-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Investor</th>
                <th>Committed</th>
                <th>Status</th>
                <th>Confirmation #</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {investors.map((inv) => {
                const sub = getSub(inv.id)
                const canConfirm = sub?.status === 'signed' || sub?.status === 'paid'

                return (
                  <tr key={inv.id}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{inv.fullLegalName}</div>
                      <div style={{ fontSize: 12, color: 'var(--color-slate-500)' }}>{inv.email}</div>
                    </td>
                    <td>{inv.subscriptionAmount ? `$${Number(inv.subscriptionAmount).toLocaleString()}` : '—'}</td>
                    <td>
                      <span className={`status-badge ${statusClass(sub?.status)}`}>
                        {statusLabel(sub?.status)}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                      {sub?.wireConfirmationNumber || '—'}
                    </td>
                    <td>
                      {sub?.status === 'paid' ? (
                        <span style={{ fontSize: 12, color: 'var(--color-slate-500)' }}>
                          Confirmed {sub.paidAt ? new Date(sub.paidAt).toLocaleDateString() : ''}
                        </span>
                      ) : canConfirm ? (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => openWireModal(inv.id, inv.fullLegalName)}
                        >
                          Confirm Receipt
                        </button>
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--color-slate-400)' }}>
                          Awaiting signature
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalReceived === totalCommitted && totalCommitted > 0 && (
        <div className="state-banner state-banner--success" style={{ marginTop: 20 }}>
          <span>✓</span> All capital received. Proceed to Stage 7 to lock the cap table.
        </div>
      )}

      {/* Wire confirmation modal */}
      {wireModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="wire-modal-title">
          <div className="modal">
            <div className="modal-header">
              <h2 id="wire-modal-title" className="modal-title">Confirm Wire — {wireModal.name}</h2>
            </div>
            <div className="modal-body">
              <div className="field-group">
                <label className="field-label" htmlFor="wire-conf-num">Wire Confirmation Number <span className="field-required">*</span></label>
                <input
                  id="wire-conf-num"
                  className="field-input"
                  placeholder="e.g. FED-20260401-001"
                  value={wireConf}
                  onChange={(e) => setWireConf(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="form-row">
                <div className="field-group">
                  <label className="field-label" htmlFor="wire-amount">Amount Received ($)</label>
                  <CurrencyInput
                    id="wire-amount"
                    className="field-input"
                    placeholder="Leave blank to use committed amount"
                    value={wireAmt}
                    onChange={(v) => setWireAmt(v)}
                  />
                </div>
                <div className="field-group">
                  <label className="field-label" htmlFor="wire-date">Date Received</label>
                  <input
                    id="wire-date"
                    type="date"
                    className="field-input"
                    value={wireDate}
                    onChange={(e) => setWireDate(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-primary" onClick={confirmWire}>
                Confirm Wire
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setWireModal(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <HelpCard text="Need help reconciling wires or setting up escrow banking? Our operations team is available to assist with capital coordination." />
    </div>
  )
}
