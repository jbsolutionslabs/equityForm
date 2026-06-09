import React, { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAppStore } from '../../state/store'
import { useSubscriptionActions } from '../../api/hooks/useDealMutations'
import { useEconomicsStore } from '../../state/economicsStore'
import { computeSourcesAndUses } from '../../utils/sourcesAndUses'
import { HelpCard } from '../components/HelpCard'
import { CurrencyInput } from '../components/CurrencyInput'
import ModuleProgress from '../components/ModuleProgress'

export const WireTracking: React.FC = () => {
  const { dealId }   = useParams<{ dealId: string }>()
  const navigate     = useNavigate()
  const data         = useAppStore((s) => s.deals[dealId!]?.data)
  const investors    = data?.investors ?? []
  const subscriptions = data?.subscriptions ?? []
  const banking      = data?.banking ?? {}
  const subscriptionActions = useSubscriptionActions(dealId!)
  const economicsDeal = useEconomicsStore((s) => s.deals.find((d) => d.dealId === dealId))

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

  const lpTargetFromEconomics = (() => {
    const stack = economicsDeal?.capitalStack
    if (!stack) return 0
    const sources = computeSourcesAndUses(stack)
    const equity = Math.max(0, sources.sources.equity)
    const lpPct = Math.min(1, Math.max(0, stack.lpEquityPct ?? 0.9))
    return equity * lpPct
  })()

  const totalCommittedFromSubs = investors.reduce((sum, inv) => sum + (inv.subscriptionAmount || 0), 0)
  const investorTargetAmount = (subscriptionAmount?: number | null) => {
    const amount = subscriptionAmount || 0
    if (lpTargetFromEconomics <= 0 || totalCommittedFromSubs <= 0) return amount
    return (amount / totalCommittedFromSubs) * lpTargetFromEconomics
  }

  const totalCommitted = investors.reduce((sum, inv) => sum + investorTargetAmount(inv.subscriptionAmount), 0)
  const totalReceived  = investors.reduce((sum, inv) => {
    const sub = getSub(inv.id)
    if (sub?.status !== 'paid') return sum
    return sum + (sub.paidAmount ?? investorTargetAmount(inv.subscriptionAmount))
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
    const investor = investors.find((i) => i.id === investorId)
    const prefill  = investorTargetAmount(investor?.subscriptionAmount)
    setWireModal({ investorId, name })
    setWireConf('')
    setWireAmt(prefill > 0 ? prefill : 0)
    setWireDate('')
  }

  const confirmWire = async () => {
    if (!wireConf.trim()) {
      notify('Please enter a wire confirmation number.', 'error')
      return
    }
    if (wireModal) {
      const investor = investors.find((i) => i.id === wireModal.investorId)
      const target = investorTargetAmount(investor?.subscriptionAmount)
      const enteredAmount = wireAmt > 0 ? wireAmt : target
      const gpPortion = Math.max(0, totalCommittedFromSubs - lpTargetFromEconomics)
      const overage = Math.max(0, enteredAmount - target)
      if (overage > gpPortion) {
        notify(`Amount exceeds LP target by $${Math.round(overage).toLocaleString()}, but GP portion is only $${Math.round(gpPortion).toLocaleString()}. Please use a lower override.`, 'error')
        return
      }
      try {
        await subscriptionActions.recordWire(
          wireModal.investorId,
          wireConf.trim(),
          wireAmt > 0 ? wireAmt : undefined,
          wireDate || undefined,
        )
        notify(`Wire confirmed for ${wireModal.name}.`)
        setWireModal(null)
      } catch {
        notify(`Failed to confirm wire for ${wireModal.name}. Please try again.`, 'error')
      }
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
        <ModuleProgress
          moduleLabel="Legal"
          step={6}
          totalSteps={7}
          stepTitle="Wire Tracking"
          detail="Confirm incoming capital from each investor"
        />
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

      {totalCommitted === 0 ? (
        <div className="state-banner state-banner--warning" style={{ marginBottom: 20 }}>
          <span>⚠</span> Wire Tracking is not ready yet. Add investors and complete signatures before confirming funds received.
        </div>
      ) : totalReceived === totalCommitted ? (
        <div className="state-banner state-banner--success" style={{ marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <span><span>✓</span> All capital has been received successfully.</span>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => navigate(`/deals/${dealId}/captable`)}
          >
            Continue to Cap Table Lock →
          </button>
        </div>
      ) : (
        <div className="state-banner state-banner--warning" style={{ marginBottom: 20 }}>
          <span>⚠</span> Wire Tracking is still in progress. Confirm all incoming wires to continue.
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
            {totalCommitted > 0
              ? totalAwaiting <= 0
                ? 100
                : Math.floor((totalReceived / totalCommitted) * 100)
              : 0}%
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
                const target = investorTargetAmount(inv.subscriptionAmount)
                const received = sub?.status === 'paid' ? (sub.paidAmount ?? target) : 0
                const overage = Math.max(0, received - target)

                return (
                  <tr key={inv.id}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{inv.fullLegalName}</div>
                      <div style={{ fontSize: 12, color: 'var(--color-slate-500)' }}>{inv.email}</div>
                    </td>
                    <td>${Math.round(target).toLocaleString()}</td>
                    <td>
                      <span className={`status-badge ${statusClass(sub?.status)}`}>
                        {statusLabel(sub?.status)}
                      </span>
                      {sub?.status === 'paid' && overage > 0 && (
                        <div style={{ fontSize: 11, color: 'var(--color-slate-500)', marginTop: 4 }}>
                          +${Math.round(overage).toLocaleString()} over target (from GP portion)
                        </div>
                      )}
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
        <div className="state-banner state-banner--success" style={{ marginTop: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <span><span>✓</span> All capital received. You can continue to Cap Table Lock.</span>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => navigate(`/deals/${dealId}/captable`)}
          >
            Continue to Cap Table Lock →
          </button>
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
                    value={wireAmt}
                    onChange={(v) => setWireAmt(v)}
                  />
                  <p className="field-hint">Pre-filled from Investor Intake — edit if the wire amount differs</p>
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
              {(() => {
                const investor = investors.find((i) => i.id === wireModal.investorId)
                const target = investorTargetAmount(investor?.subscriptionAmount)
                const enteredAmount = wireAmt > 0 ? wireAmt : target
                const gpPortion = Math.max(0, totalCommittedFromSubs - lpTargetFromEconomics)
                const overage = Math.max(0, enteredAmount - target)
                return (
                  <div className="info-box" style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 13, color: 'var(--color-slate-600)' }}>
                      LP pro-rated target: <strong>${Math.round(target).toLocaleString()}</strong>
                      {overage > 0 && (
                        <> · Override overage: <strong>${Math.round(overage).toLocaleString()}</strong> (reduces GP portion)</>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--color-slate-500)', marginTop: 4 }}>
                      Available GP portion for overages: ${Math.round(gpPortion).toLocaleString()}
                    </div>
                  </div>
                )
              })()}
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
