import React, { useState } from 'react'
import { useAppStore } from '../../state/store'
import { generatePlaceholders } from '../../utils/placeholders'
import { generateOperatingAgreementHtml, generateOperatingAgreementText } from '../../utils/pdfTemplate'
import html2pdf from 'html2pdf.js'
import PlaceholderCoverage from '../components/PlaceholderCoverage'
import CompletionBadge from '../components/CompletionBadge'

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function fmtCurrency(n: unknown): string {
  if (n === null || n === undefined || n === '') return '—'
  return '$' + Number(n).toLocaleString()
}

function fmtBool(v: unknown): string {
  if (v === true)  return 'Yes'
  if (v === false) return 'No'
  return '—'
}

function fmtVal(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  return String(v)
}

/* ─── Sub-components ─────────────────────────────────────────────────────── */
function SummaryCard({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header" style={{ fontSize: 17, marginBottom: 16 }}>{title}</div>
      <div className="kv-grid">
        {rows.filter(([, v]) => v !== '—').map(([k, v]) => (
          <React.Fragment key={k}>
            <div className="kv-key">{k}</div>
            <div className="kv-val">{v}</div>
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}

function InvestorsTable({ investors, subscriptions }: {
  investors: ReturnType<typeof useAppStore>['data']['investors']
  subscriptions: ReturnType<typeof useAppStore>['data']['subscriptions']
}) {
  const totalAmount = investors.reduce((sum, i) => sum + (i.subscriptionAmount ?? 0), 0)
  const totalUnits  = investors.reduce((sum, i) => sum + (i.classAUnits ?? 0), 0)

  const statusLabels: Record<string, string> = {
    pending: 'Generated',
    sent:    'Sent',
    signed:  'Signed',
    paid:    'Wire received',
  }
  const statusClass: Record<string, string> = {
    pending: 'status-badge--pending',
    sent:    'status-badge--sent',
    signed:  'status-badge--signed',
    paid:    'status-badge--paid',
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header" style={{ fontSize: 17, marginBottom: 16 }}>
        Cap Table — {investors.length} investor{investors.length !== 1 ? 's' : ''}
      </div>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th style={{ textAlign: 'right' }}>Subscription</th>
            <th style={{ textAlign: 'right' }}>Units</th>
            <th style={{ textAlign: 'right' }}>Ownership</th>
            <th>Sub Status</th>
          </tr>
        </thead>
        <tbody>
          {investors.map((inv) => {
            const sub = subscriptions.find((s) => s.investorId === inv.id)
            const ownershipPct = inv.ownershipPct
              ? (typeof inv.ownershipPct === 'number' ? inv.ownershipPct.toFixed(2) + '%' : String(inv.ownershipPct))
              : totalUnits > 0 && inv.classAUnits
              ? ((inv.classAUnits / totalUnits) * 100).toFixed(2) + '%'
              : '—'
            return (
              <tr key={inv.id}>
                <td style={{ fontWeight: 500 }}>{inv.fullLegalName}</td>
                <td>{inv.subscriberType === 'entity' ? 'Entity' : 'Individual'}</td>
                <td style={{ textAlign: 'right' }}>{fmtCurrency(inv.subscriptionAmount)}</td>
                <td style={{ textAlign: 'right' }}>{inv.classAUnits?.toLocaleString() ?? '—'}</td>
                <td style={{ textAlign: 'right' }}>{ownershipPct}</td>
                <td>
                  {sub ? (
                    <span className={`status-badge ${statusClass[sub.status] ?? 'status-badge--none'}`} style={{ fontSize: 11 }}>
                      {statusLabels[sub.status] ?? sub.status}
                    </span>
                  ) : (
                    <span style={{ fontSize: 12, color: 'var(--color-slate-400)' }}>Not generated</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
        {investors.length > 1 && (
          <tfoot>
            <tr>
              <td style={{ fontWeight: 700, paddingTop: 12, fontSize: 13 }} colSpan={2}>Total</td>
              <td style={{ textAlign: 'right', fontWeight: 700, paddingTop: 12, fontSize: 13 }}>{fmtCurrency(totalAmount)}</td>
              <td style={{ textAlign: 'right', fontWeight: 700, paddingTop: 12, fontSize: 13 }}>{totalUnits.toLocaleString()}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

/* ─── Main Review view ───────────────────────────────────────────────────── */
export const Review: React.FC = () => {
  const data            = useAppStore((s) => s.data)
  const generateOA      = useAppStore((s) => s.generateOA)
  const gpSignOA        = useAppStore((s) => s.gpSignOA)
  const lockCapTable    = useAppStore((s) => s.lockCapTable)

  const ph     = generatePlaceholders(data)
  const values = ph.values
  const entityName = data.deal.entityName || '—'
  const formationState = data.deal.formationState || '—'
  const effectiveDate = data.deal.effectiveDate || '—'

  const [notification, setNotification] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [showFullDoc, setShowFullDoc]   = useState(false)

  const notify = (msg: string, type: 'success' | 'error' = 'success') => {
    setNotification({ msg, type })
    window.setTimeout(() => setNotification(null), 5000)
  }

  const downloadOAAsDoc = (html: string, filename = 'operating-agreement.doc') => {
    const blob = new Blob([html], { type: 'application/msword' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = filename
    document.body.appendChild(a); a.click()
    a.remove(); URL.revokeObjectURL(url)
  }

  const handleGenerateOA = () => {
    generateOA()
    notify('Operating Agreement generated.')
  }

  const handleGpSign = () => {
    gpSignOA()
    notify('GP signature recorded on Operating Agreement.')
  }

  const handleLockCapTable = () => {
    try {
      lockCapTable()
      notify('Cap table locked.')
    } catch (e) {
      notify(String(e), 'error')
    }
  }

  const handleDownloadPdf = () => {
    const html      = generateOperatingAgreementHtml(values)
    const container = document.createElement('div')
    container.innerHTML = html
    document.body.appendChild(container)
    const filename = `${(String(values.ENTITY_NAME || 'operating-agreement')).replace(/\s+/g, '-').toLowerCase()}.pdf`
    html2pdf()
      .set({ margin: 0.5, filename, image: { type: 'jpeg' as const, quality: 0.98 }, html2canvas: { scale: 2 }, jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' as const } })
      .from(container)
      .save()
      .finally(() => container.remove())
  }

  const handleDownloadDoc = () => {
    const html = generateOperatingAgreementHtml(values)
    const name = `${(String(values.ENTITY_NAME || 'operating-agreement')).replace(/\s+/g, '-').toLowerCase()}.doc`
    downloadOAAsDoc(html, name)
  }

  const oaText = data.operatingAgreement?.generated
    ? generateOperatingAgreementText(values)
    : null

  // Workflow state banners
  const spvFormed = !!data.spv?.formed
  const oaGenerated = !!data.operatingAgreement?.generated
  const oaGpSigned  = !!data.operatingAgreement?.gpSigned
  const capLocked   = !!data.deal.capTableLockedAt

  return (
    <div className="page-enter">
      {/* Page header */}
      <div className="page-header">
        <span className="page-header-eyebrow">Step 4 of 4</span>
        <h1>Review &amp; close your deal.</h1>
        <p className="page-header-subtitle">
          Generate the Operating Agreement, collect signatures and wire payments,
          then lock the cap table to finalise.
        </p>
        <div style={{ marginTop: 12 }}>
          <CompletionBadge />
        </div>
      </div>

      {/* Notification */}
      {notification && (
        <div className={`notification notification--${notification.type}`} role="alert">
          {notification.type === 'success' ? '✓ ' : '⚠ '}{notification.msg}
        </div>
      )}

      {/* ── Primary action bar ── */}
      <div className="actions-bar--primary">
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-navy-900)', marginBottom: 4 }}>
            Document Actions
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--color-slate-600)' }}>
            Complete these steps in order: Generate → GP Sign → Download → Lock Cap Table
          </div>
        </div>
        <div className="actions-bar" style={{ paddingTop: 0, marginTop: 0, borderTop: 'none' }}>
          <button
            type="button"
            onClick={handleGenerateOA}
            className={`btn ${oaGenerated ? 'btn-secondary' : 'btn-primary'}`}
            title="Generate the Operating Agreement from your deal data"
          >
            {oaGenerated ? '✓ Regenerate OA' : 'Generate Operating Agreement'}
          </button>
          <button
            type="button"
            onClick={handleGpSign}
            className={`btn ${oaGpSigned ? 'btn-secondary' : 'btn-primary'}`}
            disabled={!oaGenerated}
            title="Record the GP signature on the Operating Agreement"
          >
            {oaGpSigned ? '✓ GP signed' : 'GP Sign Operating Agreement'}
          </button>
          <button
            type="button"
            onClick={handleDownloadPdf}
            className="btn btn-secondary"
            disabled={!oaGenerated}
          >
            Download OA as PDF
          </button>
          <button
            type="button"
            onClick={handleDownloadDoc}
            className="btn btn-secondary"
            disabled={!oaGenerated}
          >
            Download OA (.doc)
          </button>
          <button
            type="button"
            onClick={handleLockCapTable}
            className={`btn ${capLocked ? 'btn-secondary' : 'btn-primary'}`}
            title="Requires all signed subscriptions to also be paid"
          >
            {capLocked ? '✓ Cap table locked' : 'Lock cap table'}
          </button>
        </div>
      </div>

      {/* ── Workflow status banners ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
        {spvFormed && (
          <div className="state-banner state-banner--success">
            <span>✓</span> SPV formed on {data.spv?.formationDate ? new Date(data.spv.formationDate).toLocaleDateString() : ''}
            {data.spv?.ein ? ` · EIN: ${data.spv.ein}` : ''}
          </div>
        )}
        {oaGenerated && (
          <div className="state-banner state-banner--success">
            <span>✓</span> Operating Agreement generated
            {oaGpSigned ? ' · GP signature recorded' : ' — awaiting GP signature'}
          </div>
        )}
        {capLocked && (
          <div className="state-banner state-banner--success">
            <span>✓</span> Cap table locked on {new Date(data.deal.capTableLockedAt!).toLocaleDateString()}
          </div>
        )}
        {!spvFormed && (
          <div className="state-banner state-banner--warning">
            <span>⚠</span> SPV not yet formed — complete Deal Basics first.
          </div>
        )}
      </div>

      {/* ── Two-column layout: main + rail ── */}
      <div className="review-layout">

        {/* Left: summaries + doc preview */}
        <div className="review-main">

          {/* Deal summary */}
          <SummaryCard
            title="Deal Entity"
            rows={[
              ['Entity Name',        fmtVal(data.deal.entityName)],
              ['Formation State',    fmtVal(data.deal.formationState)],
              ['EIN',               fmtVal(data.deal.ein)],
              ['Principal Address', fmtVal(data.deal.principalAddress)],
              ['Effective Date',    fmtVal(data.deal.effectiveDate)],
              ['Registered agent',  fmtVal(data.deal.registeredAgentName)],
              ['GP entity',        fmtVal(data.deal.gpEntityName)],
              ['GP signer',        fmtVal(data.deal.gpSignerName) + (data.deal.gpSignerTitle ? `, ${data.deal.gpSignerTitle}` : '')],
            ]}
          />

          {/* Property summary */}
          <SummaryCard
            title="Investment Property"
            rows={[
              ['Address',  fmtVal(data.deal.propertyAddress)],
              ['City',     fmtVal(data.deal.propertyCity)],
              ['State',    fmtVal(data.deal.propertyState)],
              ['ZIP',      fmtVal(data.deal.propertyZip)],
              ['Purpose',  fmtVal(data.deal.dealPurpose)],
            ]}
          />

          {/* Offering summary */}
          <SummaryCard
            title="Offering Economics"
            rows={[
              ['Exemption',          fmtVal(data.offering.offeringExemption)],
              ['Minimum investment', fmtCurrency(data.offering.minimumInvestment)],
              ['Preferred return',   data.offering.preferredReturnEnabled ? `${data.offering.preferredReturnRate ?? '—'}% (${data.offering.preferredReturnType ?? '—'})` : 'None'],
              ['GP promote',        data.offering.gpPromote != null ? `${data.offering.gpPromote}%` : '—'],
              ['LP residual',       data.offering.lpResidual != null ? `${data.offering.lpResidual}%` : '—'],
              ['Solicitation',      fmtVal(data.offering.solicitationMethod)],
            ]}
          />

          {/* Investors table */}
          {data.investors.length > 0 && (
            <InvestorsTable investors={data.investors} subscriptions={data.subscriptions} />
          )}

          {/* Document preview */}
          {oaText && (
            <div className="doc-preview">
              <div className="doc-preview-header">
                <span className="doc-preview-label">
                  <span aria-hidden="true">👁</span> Live preview — Operating Agreement
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={() => setShowFullDoc((s) => !s)}
                >
                  {showFullDoc ? 'Collapse' : 'Expand full document'}
                </button>
              </div>
              <div
                className="doc-preview-body"
                style={{ maxHeight: showFullDoc ? 'none' : 480 }}
              >
                <div className="doc-paper doc-paper--preview">
                  <div className="doc-paper-header">
                    <div className="doc-paper-title">Operating Agreement</div>
                    <div className="doc-paper-entity">{entityName}</div>
                    <div className="doc-paper-subtitle">A {formationState} Limited Liability Company</div>
                    <div className="doc-paper-meta"><strong>Effective Date:</strong> {effectiveDate}</div>
                  </div>
                  <div className="doc-paper-body">
                    {oaText}
                  </div>
                </div>
              </div>
            </div>
          )}

          {!oaText && (
            <div className="card" style={{ textAlign: 'center', padding: '40px 32px' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📄</div>
              <div className="card-header" style={{ fontSize: 17, marginBottom: 8 }}>
                Operating Agreement not yet generated
              </div>
              <p style={{ color: 'var(--color-slate-600)', fontSize: 14, marginBottom: 20 }}>
                Click "Generate Operating Agreement" above to create the document from your deal data.
              </p>
              <button type="button" onClick={handleGenerateOA} className="btn btn-primary">
                Generate Operating Agreement
              </button>
            </div>
          )}

        </div>

        {/* Right rail: document health */}
        <div className="review-rail">
          <PlaceholderCoverage />
        </div>

      </div>
    </div>
  )
}
