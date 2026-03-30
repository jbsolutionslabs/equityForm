import React, { useState } from 'react'
import { useAppStore, canSendSubAgreements } from '../../state/store'
import { HelpCard } from '../components/HelpCard'

export const ESignature: React.FC = () => {
  const data          = useAppStore((s) => s.data)
  const investors     = data.investors
  const subscriptions = data.subscriptions
  const generateSubscriptionForInvestor = useAppStore((s) => s.generateSubscriptionForInvestor)
  const sendSubscriptionForSignature    = useAppStore((s) => s.sendSubscriptionForSignature)
  const markSubscriptionSigned          = useAppStore((s) => s.markSubscriptionSigned)

  const canSend = canSendSubAgreements(data)

  const [notification, setNotification] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  const notify = (msg: string, type: 'success' | 'error' = 'success') => {
    setNotification({ msg, type })
    window.setTimeout(() => setNotification(null), 4000)
  }

  const getSub = (investorId: string) =>
    subscriptions.find((s) => s.investorId === investorId)

  const signedCount = subscriptions.filter((s) => s.status === 'signed' || s.status === 'paid').length
  const sentCount   = subscriptions.filter((s) => s.status === 'sent').length
  const totalCount  = investors.length

  const handleSendAll = () => {
    if (!canSend) {
      notify('The Operating Agreement must be GP-signed before sending subscription agreements.', 'error')
      return
    }
    let sent = 0
    investors.forEach((inv) => {
      const sub = getSub(inv.id)
      if (!sub) {
        generateSubscriptionForInvestor(inv.id)
        sendSubscriptionForSignature(inv.id)
        sent++
      } else if (sub.status === 'pending' || sub.status === 'generated') {
        sendSubscriptionForSignature(inv.id)
        sent++
      }
    })
    if (sent > 0) notify(`Sent ${sent} subscription agreement${sent > 1 ? 's' : ''} for e-signature.`)
    else notify('All investors already have agreements sent or signed.', 'error')
  }

  const handleNudgeAll = () => {
    const pending = subscriptions.filter((s) => s.status === 'sent')
    if (pending.length === 0) {
      notify('No pending signers to nudge.', 'error')
      return
    }
    notify(`Reminder sent to ${pending.length} investor${pending.length > 1 ? 's' : ''}.`)
  }

  const statusLabel = (status?: string) => {
    switch (status) {
      case 'generated': return 'Generated'
      case 'sent':      return 'Awaiting signature'
      case 'signed':    return 'Signed'
      case 'paid':      return 'Wire received'
      default:          return 'Not started'
    }
  }

  const statusClass = (status?: string) => {
    switch (status) {
      case 'generated': return 'status-badge--pending'
      case 'sent':      return 'status-badge--sent'
      case 'signed':    return 'status-badge--signed'
      case 'paid':      return 'status-badge--paid'
      default:          return 'status-badge--none'
    }
  }

  return (
    <div className="page-enter">
      <div className="page-header">
        <span className="page-header-eyebrow">Stage 5 of 7</span>
        <h1>E-Signatures</h1>
        <p className="page-header-subtitle">
          Send subscription agreements to investors for e-signature. The Operating Agreement must be
          GP-signed before any sub agreements can be sent.
        </p>
      </div>

      {notification && (
        <div className={`notification notification--${notification.type}`} role="alert">
          {notification.type === 'success' ? '✓ ' : '⚠ '}{notification.msg}
        </div>
      )}

      {!canSend && (
        <div className="gate-message" style={{ marginBottom: 20 }}>
          <strong>Gate:</strong> The Operating Agreement must be GP-signed before you can send subscription agreements.
          Complete Stage 3 first.
        </div>
      )}

      {/* Progress summary */}
      <div className="capital-summary" style={{ marginBottom: 24 }}>
        <div className="capital-stat">
          <div className="capital-stat-value">{totalCount}</div>
          <div className="capital-stat-label">Total Investors</div>
        </div>
        <div className="capital-stat">
          <div className="capital-stat-value">{signedCount}</div>
          <div className="capital-stat-label">Signed</div>
        </div>
        <div className="capital-stat">
          <div className="capital-stat-value">{sentCount}</div>
          <div className="capital-stat-label">Awaiting Signature</div>
        </div>
        <div className="capital-stat">
          <div className="capital-stat-value">{totalCount - signedCount - sentCount}</div>
          <div className="capital-stat-label">Not Sent</div>
        </div>
      </div>

      {/* Bulk actions */}
      {investors.length > 0 && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canSend}
            title={!canSend ? 'Complete OA signing first' : undefined}
            onClick={handleSendAll}
          >
            Send All Unsigned
          </button>
          <button type="button" className="btn btn-secondary" onClick={handleNudgeAll}>
            Nudge All Pending
          </button>
        </div>
      )}

      {/* Investor table */}
      {investors.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-title">No investors added yet.</div>
            <p className="empty-state-body">Add investors in Stage 4 before managing signatures.</p>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table className="data-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Investor</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {investors.map((inv) => {
                const sub = getSub(inv.id)
                return (
                  <tr key={inv.id}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{inv.fullLegalName}</div>
                      <div style={{ fontSize: 12, color: 'var(--color-slate-500)' }}>{inv.email}</div>
                    </td>
                    <td style={{ textTransform: 'capitalize' }}>{inv.subscriberType}</td>
                    <td>{inv.subscriptionAmount ? `$${Number(inv.subscriptionAmount).toLocaleString()}` : '—'}</td>
                    <td>
                      <span className={`status-badge ${statusClass(sub?.status)}`}>
                        {statusLabel(sub?.status)}
                      </span>
                    </td>
                    <td>
                      <div className="sig-status">
                        {!sub && (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={!canSend}
                            title={!canSend ? 'Complete OA signing first' : undefined}
                            onClick={() => {
                              generateSubscriptionForInvestor(inv.id)
                              sendSubscriptionForSignature(inv.id)
                              notify(`Agreement sent to ${inv.fullLegalName}.`)
                            }}
                          >
                            Send Now
                          </button>
                        )}
                        {sub?.status === 'generated' && (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => {
                              sendSubscriptionForSignature(inv.id)
                              notify(`Agreement sent to ${inv.fullLegalName}.`)
                            }}
                          >
                            Send Now
                          </button>
                        )}
                        {sub?.status === 'sent' && (
                          <>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => notify(`Reminder sent to ${inv.fullLegalName}.`)}
                            >
                              Nudge
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => {
                                markSubscriptionSigned(inv.id)
                                notify(`Marked as signed for ${inv.fullLegalName}.`)
                              }}
                            >
                              Mark Signed
                            </button>
                          </>
                        )}
                        {(sub?.status === 'signed' || sub?.status === 'paid') && (
                          <span style={{ fontSize: 12, color: 'var(--color-slate-500)' }}>
                            Signed {sub.signedAt ? new Date(sub.signedAt).toLocaleDateString() : ''}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {signedCount === totalCount && totalCount > 0 && (
        <div className="state-banner state-banner--success" style={{ marginTop: 20 }}>
          <span>✓</span> All investors have signed. Proceed to Stage 6 to confirm wire transfers.
        </div>
      )}

      <HelpCard text="Need help with DocuSign setup or investor signature tracking? Reach out and we can walk you through the e-signature workflow." />
    </div>
  )
}
