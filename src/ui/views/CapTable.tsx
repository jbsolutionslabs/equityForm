import React, { useState } from 'react'
import { useAppStore, canLockCapTable } from '../../state/store'
import { HelpCard } from '../components/HelpCard'
import { generatePlaceholders } from '../../utils/placeholders'
import { generateOperatingAgreementHtml } from '../../utils/pdfTemplate'
import html2pdf from 'html2pdf.js'

export const CapTable: React.FC = () => {
  const data        = useAppStore((s) => s.data)
  const investors   = data.investors
  const deal        = data.deal
  const lockCapTable = useAppStore((s) => s.lockCapTable)

  const [showConfirm, setShowConfirm] = useState(false)
  const [notification, setNotification] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  const notify = (msg: string, type: 'success' | 'error' = 'success') => {
    setNotification({ msg, type })
    window.setTimeout(() => setNotification(null), 4000)
  }

  const isLocked  = !!deal.capTableLockedAt
  const canLock   = canLockCapTable(data)

  // Only include investors who have actually sent funds (subscription status === 'paid')
  const paidInvestorIds = new Set(
    data.subscriptions.filter((s) => s.status === 'paid').map((s) => s.investorId),
  )
  const paidInvestors = investors.filter((inv) => paidInvestorIds.has(inv.id))

  const totalUnits   = paidInvestors.reduce((sum, inv) => sum + (inv.classAUnits || 0), 0)
  const totalAmount  = paidInvestors.reduce((sum, inv) => sum + (inv.subscriptionAmount || 0), 0)

  // For display, add a GP row representing 0-unit management interest
  const gpName = deal.gpEntityName || deal.gpSignerName || 'GP / Managing Member'

  const handleLock = () => {
    lockCapTable()
    setShowConfirm(false)
    notify('Cap table locked. The deal is now closed.')
  }

  const downloadOAAsDoc = (html: string, filename = 'operating-agreement-updated.doc') => {
    const blob = new Blob([html], { type: 'application/msword' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const getUpdatedOaHtml = () => {
    const { values } = generatePlaceholders(data)
    return generateOperatingAgreementHtml(values)
  }

  const handleDownloadUpdatedOaPdf = () => {
    if (!isLocked) {
      notify('Lock the cap table first to generate the final OA with updated Exhibit A.', 'error')
      return
    }
    const html = getUpdatedOaHtml()
    const container = document.createElement('div')
    container.innerHTML = html
    document.body.appendChild(container)

    const filename = `${(deal.entityName || 'operating-agreement').replace(/\s+/g, '-').toLowerCase()}-updated.pdf`

    html2pdf()
      .set({
        margin: 0.5,
        filename,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' as const },
      })
      .from(container)
      .save()
      .finally(() => container.remove())
  }

  const handleDownloadUpdatedOaDoc = () => {
    if (!isLocked) {
      notify('Lock the cap table first to generate the final OA with updated Exhibit A.', 'error')
      return
    }
    const html = getUpdatedOaHtml()
    const filename = `${(deal.entityName || 'operating-agreement').replace(/\s+/g, '-').toLowerCase()}-updated.doc`
    downloadOAAsDoc(html, filename)
  }

  const downloadCSV = () => {
    const rows = [
      ['Name', 'Type', 'Class A Units', 'Ownership %', 'Subscription Amount'],
      [gpName, 'GP', '0', 'Management interest', '$0'],
      // only include investors who have paid
      ...paidInvestors.map((inv) => [
        inv.fullLegalName,
        inv.subscriberType === 'entity' ? 'LP (Entity)' : 'LP (Individual)',
        String(inv.classAUnits || 0),
        totalUnits > 0 ? (((inv.classAUnits || 0) / totalUnits) * 100).toFixed(2) + '%' : '—',
        `$${(inv.subscriptionAmount || 0).toLocaleString()}`,
      ]),
    ]
    if (paidInvestors.length > 0) {
      rows.push(['TOTAL', '', String(totalUnits), '100%', `$${totalAmount.toLocaleString()}`])
    }
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `${deal.entityName?.replace(/\s+/g, '_') || 'CapTable'}_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="page-enter">
      <div className="page-header">
        <span className="page-header-eyebrow">Stage 7 of 7</span>
        <h1>Cap Table Lock</h1>
        <p className="page-header-subtitle">
          Review the final ownership table. Once all wires are confirmed, lock the cap table to
          finalize the deal and generate download-ready documents.
        </p>
      </div>

      {notification && (
        <div className={`notification notification--${notification.type}`} role="alert">
          {notification.type === 'success' ? '✓ ' : '⚠ '}{notification.msg}
        </div>
      )}

      {isLocked && (
        <div className="captable-locked-badge" role="status" aria-label="Cap table locked">
          <span aria-hidden="true">🔒</span>
          Cap Table Locked — {new Date(deal.capTableLockedAt!).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
      )}

      {/* Cap table */}
      <div className="card" style={{ marginBottom: 24, padding: 0 }}>
        <div style={{ padding: '20px 24px 12px', borderBottom: '1px solid var(--color-slate-200)' }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>
            {deal.entityName || 'Entity'} — Membership Interests
          </h3>
        </div>
        {/* keep table content aligned with header padding */}
        <div style={{ padding: '0 24px 24px' }}>
          <table className="data-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Member</th>
                <th>Type</th>
                <th style={{ textAlign: 'right' }}>Class A Units</th>
                <th style={{ textAlign: 'right' }}>Ownership %</th>
                <th style={{ textAlign: 'right' }}>Subscription Amount</th>
              </tr>
            </thead>
            <tbody>
              {/* GP row */}
              <tr style={{ background: 'var(--color-slate-50)' }}>
                <td>
                  <div style={{ fontWeight: 500 }}>{gpName}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-slate-500)' }}>Managing Member</div>
                </td>
                <td><span className="status-badge" style={{ background: 'var(--color-navy-900)', color: '#fff', fontSize: 11 }}>GP</span></td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13 }}>0</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13 }}>Management</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13 }}>—</td>
              </tr>

              {/* LP rows — only show investors who have paid */}
              {paidInvestors.map((inv) => {
                const pct = totalUnits > 0 ? (((inv.classAUnits || 0) / totalUnits) * 100).toFixed(2) : '0.00'
                return (
                  <tr key={inv.id}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{inv.fullLegalName}</div>
                      <div style={{ fontSize: 12, color: 'var(--color-slate-500)' }}>{inv.email}</div>
                    </td>
                    <td>
                      <span className="status-badge status-badge--none" style={{ fontSize: 11 }}>
                        {inv.subscriberType === 'entity' ? 'LP (Entity)' : 'LP (Ind.)'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                      {(inv.classAUnits || 0).toLocaleString()}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                      {pct}%
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                      ${(inv.subscriptionAmount || 0).toLocaleString()}
                    </td>
                  </tr>
                )
              })}
            </tbody>

            {paidInvestors.length > 0 && (
              <tfoot>
                <tr style={{ fontWeight: 700, background: 'var(--color-slate-50)' }}>
                  <td>TOTAL</td>
                  <td></td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {totalUnits.toLocaleString()}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>100%</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    ${totalAmount.toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        {!isLocked && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canLock}
            title={!canLock ? 'All signed subscriptions must be marked as paid before locking' : undefined}
            onClick={() => setShowConfirm(true)}
          >
            Lock Cap Table
          </button>
        )}
        {!canLock && !isLocked && (
          <span className="gate-message">
            All signed investors must have wires confirmed before locking
          </span>
        )}
        <button type="button" className="btn btn-secondary" onClick={downloadCSV}>
          Download CSV
        </button>
        {isLocked && (
          <>
            <button type="button" className="btn btn-secondary" onClick={handleDownloadUpdatedOaPdf}>
              Download Updated OA (PDF)
            </button>
            <button type="button" className="btn btn-secondary" onClick={handleDownloadUpdatedOaDoc}>
              Download Updated OA (.doc)
            </button>
          </>
        )}
      </div>

      {/* Lock confirmation modal */}
      {showConfirm && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="lock-modal-title">
          <div className="modal">
            <div className="modal-header">
              <h2 id="lock-modal-title" className="modal-title">Lock Cap Table?</h2>
            </div>
            <div className="modal-body">
              <p style={{ margin: 0, color: 'var(--color-slate-600)' }}>
                Locking the cap table finalizes the ownership record for <strong>{deal.entityName || 'this entity'}</strong>.
                This action is permanent and indicates the deal has closed.
              </p>
              <div className="info-box" style={{ marginTop: 16 }}>
                <div className="info-box-title">Before you lock</div>
                <ul style={{ margin: '4px 0 0', paddingLeft: 20, fontSize: 14, color: 'var(--color-slate-600)' }}>
                  <li>All {investors.length} investor{investors.length !== 1 ? 's' : ''} have signed subscription agreements</li>
                  <li>All wire transfers have been confirmed and recorded</li>
                  <li>Unit counts and ownership percentages are correct</li>
                </ul>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-primary" onClick={handleLock}>
                Yes, Lock Cap Table
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setShowConfirm(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <HelpCard text="Need help structuring your cap table or preparing K-1 exhibits? Our legal and tax teams can help finalize closing documents." />
    </div>
  )
}
