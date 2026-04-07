import React, { useState, useRef } from 'react'
import { useAppStore, canGenerateOA, isSpvFormed } from '../../state/store'
import { generatePlaceholders } from '../../utils/placeholders'
import { generateOperatingAgreementHtml, generateOperatingAgreementText } from '../../utils/pdfTemplate'
import html2pdf from 'html2pdf.js'
import { HelpCard } from '../components/HelpCard'
import ModuleProgress from '../components/ModuleProgress'

type SubStep = 1 | 2 | 3

const TOC_SECTIONS = [
  { id: 'formation',    label: 'Article I — Formation' },
  { id: 'members',      label: 'Article II — Members' },
  { id: 'management',   label: 'Article III — Management' },
  { id: 'economics',    label: 'Article IV — Economics' },
  { id: 'distributions',label: 'Article V — Distributions' },
  { id: 'transfers',    label: 'Article VI — Transfers' },
  { id: 'dissolution',  label: 'Article VII — Dissolution' },
  { id: 'exhibits',     label: 'Exhibit A — Cap Table' },
]

export const OperatingAgreement: React.FC = () => {
  const data              = useAppStore((s) => s.data)
  const oa                = data.operatingAgreement
  const generateOA        = useAppStore((s) => s.generateOA)
  const sendOaForDocuSign = useAppStore((s) => s.sendOaForDocuSign)
  const simulateOaSigned  = useAppStore((s) => s.simulateOaSigned)
  const { values }        = generatePlaceholders(data)
  const liveOaText        = generateOperatingAgreementText(values)

  const spvOk  = isSpvFormed(data)
  const canGen = canGenerateOA(data)

  // Derive current sub-step from OA status
  const deriveSubStep = (): SubStep => {
    if (!oa?.status || oa.status === 'not_generated') return 1
    if (oa.status === 'generated') return 2
    return 3  // sent_for_signature | signed
  }

  const [subStep, setSubStep] = useState<SubStep>(deriveSubStep)
  const [acks, setAcks]       = useState({ a: false, b: false, c: false })
  const [gpEmail, setGpEmail] = useState(oa?.gpEmail || data.deal.gpSignerName ? '' : '')
  const [notification, setNotification] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const docRef = useRef<HTMLDivElement>(null)

  const notify = (msg: string, type: 'success' | 'error' = 'success') => {
    setNotification({ msg, type })
    window.setTimeout(() => setNotification(null), 4000)
  }

  const entityName = data.deal.entityName || '—'
  const formationState = data.deal.formationState || '—'
  const effectiveDate = data.deal.effectiveDate || '—'
  const preferredReturnPct = data.offering.preferredReturnEnabled
    ? data.offering.preferredReturnRate != null
      ? `${data.offering.preferredReturnRate}%`
      : '—'
    : 'None'
  const gpPromotePct = data.offering.gpPromote != null ? `${data.offering.gpPromote}%` : '—'
  const lpGpSplit =
    data.offering.lpResidual != null && data.offering.gpPromote != null
      ? `LP ${data.offering.lpResidual}% / GP ${data.offering.gpPromote}%`
      : '—'

  const handleGenerate = () => {
    if (!canGen) {
      notify('Complete SPV Formation (Stage 2) before generating the Operating Agreement.', 'error')
      return
    }
    generateOA()
    setSubStep(2)
    notify('Operating Agreement generated. Please review and acknowledge below.')
  }

  const handleSendDocuSign = () => {
    if (!acks.a || !acks.b || !acks.c) {
      notify('Please confirm all three acknowledgments before sending.', 'error')
      return
    }
    const email = gpEmail.trim() || (data.deal.gpSignerName ? `${data.deal.gpSignerName.toLowerCase().replace(/\s+/g, '.')}@example.com` : 'gp@example.com')
    sendOaForDocuSign(email)
    setSubStep(3)
    notify('Operating Agreement sent for DocuSign signature.')
  }

  const handleSimulateSigned = () => {
    simulateOaSigned()
    notify('Simulated: DocuSign envelope completed. OA is now GP-signed.')
  }

  const downloadOAAsDoc = (html: string, filename = 'operating-agreement.doc') => {
    const blob = new Blob([html], { type: 'application/msword' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = filename
    document.body.appendChild(a); a.click()
    a.remove(); URL.revokeObjectURL(url)
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

  const scrollToSection = (id: string) => {
    if (!docRef.current) return
    const el = docRef.current.querySelector(`[data-section="${id}"]`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // Sub-step navigator
  const steps = [
    { n: 1, label: 'Generate' },
    { n: 2, label: 'Review' },
    { n: 3, label: 'Sign' },
  ]

  return (
    <div className="page-enter">
      <div className="page-header">
        <ModuleProgress
          moduleLabel="Legal"
          step={3}
          totalSteps={7}
          stepTitle="Operating Agreement"
          detail="Generate, review, and collect GP signature"
        />
        <h1>Operating Agreement</h1>
        <p className="page-header-subtitle">
          Generate the LLC Operating Agreement, review it carefully, and collect the GP's
          DocuSign signature before sending subscription agreements to investors.
        </p>
      </div>

      {notification && (
        <div className={`notification notification--${notification.type}`} role="alert">
          {notification.type === 'success' ? '✓ ' : '⚠ '}{notification.msg}
        </div>
      )}

      {/* OA 3-step navigator */}
      <nav className="oa-nav" aria-label="Operating Agreement steps">
        {steps.map((s) => (
          <div
            key={s.n}
            className={[
              'oa-nav-step',
              subStep === s.n ? 'oa-nav-step--active' : '',
              subStep > s.n ? 'oa-nav-step--done' : '',
            ].filter(Boolean).join(' ')}
            onClick={() => {
              // Allow back-navigation only
              if (s.n < subStep || (s.n === 2 && oa?.status === 'generated')) {
                setSubStep(s.n as SubStep)
              }
            }}
            role="button"
            tabIndex={0}
            aria-current={subStep === s.n ? 'step' : undefined}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && s.n <= subStep) {
                setSubStep(s.n as SubStep)
              }
            }}
          >
            <div className="oa-nav-step-indicator">
              {subStep > s.n ? '✓' : s.n}
            </div>
            <span className="oa-nav-step-label">{s.label}</span>
          </div>
        ))}
      </nav>

      {/* ── Sub-step 1: Generate ── */}
      {subStep === 1 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Generate Operating Agreement</h3>

          {!spvOk && (
            <div className="gate-message" style={{ marginBottom: 20 }}>
              <strong>Gate:</strong> SPV Formation (Stage 2) must be completed before generating
              the Operating Agreement. Complete all three formation tasks first.
            </div>
          )}

          {spvOk && (
            <div className="state-banner state-banner--success" style={{ marginBottom: 20 }}>
              <span>✓</span> SPV is fully formed. You're ready to generate the Operating Agreement.
            </div>
          )}

          {/* Deal summary card */}
          <div className="review-summary-grid" style={{ marginBottom: 24 }}>
            <div className="review-summary-item">
              <div className="review-summary-label">Entity</div>
              <div className="review-summary-value">{data.deal.entityName || '—'}</div>
            </div>
            <div className="review-summary-item">
              <div className="review-summary-label">Formation State</div>
              <div className="review-summary-value">{data.deal.formationState || '—'}</div>
            </div>
            <div className="review-summary-item">
              <div className="review-summary-label">GP Entity</div>
              <div className="review-summary-value">{data.deal.gpEntityName || '—'}</div>
            </div>
            <div className="review-summary-item">
              <div className="review-summary-label">GP Signer</div>
              <div className="review-summary-value">{data.deal.gpSignerName || '—'}</div>
            </div>
            <div className="review-summary-item">
              <div className="review-summary-label">Offering Type</div>
              <div className="review-summary-value">{data.offering.offeringExemption || '—'}</div>
            </div>
            <div className="review-summary-item">
              <div className="review-summary-label">Preferred Return %</div>
              <div className="review-summary-value">{preferredReturnPct}</div>
            </div>
            <div className="review-summary-item">
              <div className="review-summary-label">GP Promote %</div>
              <div className="review-summary-value">{gpPromotePct}</div>
            </div>
            <div className="review-summary-item">
              <div className="review-summary-label">LP/GP Split</div>
              <div className="review-summary-value">{lpGpSplit}</div>
            </div>
            <div className="review-summary-item">
              <div className="review-summary-label">Effective Date</div>
              <div className="review-summary-value">{data.deal.effectiveDate || '—'}</div>
            </div>
          </div>

          <div className="info-box" style={{ marginBottom: 20 }}>
            <div className="info-box-title">What gets generated?</div>
            <p style={{ margin: 0, fontSize: 14 }}>
              The system fills in all entity, offering, and GP details into a standard LLC Operating
              Agreement template. You'll review the full document and confirm accuracy before signing.
            </p>
          </div>

          <button
            type="button"
            className="btn btn-primary"
            disabled={!canGen}
            onClick={handleGenerate}
          >
            Generate Operating Agreement
          </button>

          {oa?.status === 'generated' && (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ marginLeft: 12 }}
              onClick={() => setSubStep(2)}
            >
              View Document →
            </button>
          )}
        </div>
      )}

      {/* ── Sub-step 2: Review ── */}
      {subStep === 2 && (
        <div>
          <div className="doc-viewer-layout">
            {/* ToC rail */}
            <nav className="doc-toc" aria-label="Document sections">
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12, color: 'var(--color-slate-700)' }}>
                Contents
              </div>
              {TOC_SECTIONS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="doc-toc-item"
                  onClick={() => scrollToSection(s.id)}
                >
                  {s.label}
                </button>
              ))}
            </nav>

            {/* Document viewer */}
            <div className="doc-viewer-content" ref={docRef}>
              {oa?.status !== 'not_generated' ? (
                <div className="doc-paper">
                  <div className="doc-paper-header">
                    <div className="doc-paper-title">Operating Agreement</div>
                    <div className="doc-paper-entity">{entityName}</div>
                    <div className="doc-paper-subtitle">A {formationState} Limited Liability Company</div>
                    <div className="doc-paper-meta"><strong>Effective Date:</strong> {effectiveDate}</div>
                  </div>
                  <div className="doc-paper-body">
                    <span data-section="formation" />
                    {liveOaText}
                  </div>
                </div>
              ) : (
                <div style={{ padding: 24, color: 'var(--color-slate-500)' }}>
                  No document text found. Go back and regenerate.
                </div>
              )}
            </div>
          </div>

          <div className="card" style={{ marginTop: 20 }}>
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>Download for Review</h3>
            <p style={{ margin: 0, color: 'var(--color-slate-600)', fontSize: 14 }}>
              Export the latest Operating Agreement to verify PDF and Word formatting.
            </p>
            <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-secondary" onClick={handleDownloadPdf}>
                Download PDF
              </button>
              <button type="button" className="btn btn-secondary" onClick={handleDownloadDoc}>
                Download .doc
              </button>
            </div>
          </div>

          {/* Acknowledgment checklist */}
          <div className="card" style={{ marginTop: 20 }}>
            <h3 style={{ marginTop: 0, marginBottom: 16 }}>Acknowledge Before Signing</h3>
            <div className="ack-checklist">
              <label className="ack-item">
                <input
                  type="checkbox"
                  checked={acks.a}
                  onChange={(e) => setAcks((prev) => ({ ...prev, a: e.target.checked }))}
                />
                <span>I have reviewed the full Operating Agreement and confirm the entity, GP, and property details are accurate.</span>
              </label>
              <label className="ack-item">
                <input
                  type="checkbox"
                  checked={acks.b}
                  onChange={(e) => setAcks((prev) => ({ ...prev, b: e.target.checked }))}
                />
                <span>I confirm the economic terms (preferred return, GP promote, voting thresholds) correctly reflect the agreed terms.</span>
              </label>
              <label className="ack-item">
                <input
                  type="checkbox"
                  checked={acks.c}
                  onChange={(e) => setAcks((prev) => ({ ...prev, c: e.target.checked }))}
                />
                <span>I understand this document will be sent to the GP for legally binding e-signature via DocuSign.</span>
              </label>
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 20, alignItems: 'center' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setSubStep(1)}
              >
                ← Back
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!acks.a || !acks.b || !acks.c}
                onClick={() => setSubStep(3)}
              >
                Continue to Sign →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Sub-step 3: Sign ── */}
      {subStep === 3 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Send for GP Signature</h3>

          {oa?.status === 'signed' ? (
            <div className="docusign-state docusign-state--signed">
              <div className="docusign-state-icon" aria-hidden="true">✓</div>
              <div>
                <div className="docusign-state-title">Operating Agreement Signed</div>
                <div className="docusign-state-meta">
                  Signed by {oa.gpSignerName || data.deal.gpSignerName || 'GP'} on{' '}
                  {oa.signedAt ? new Date(oa.signedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'}
                  {oa.docusignEnvelopeId && (
                    <span> · Envelope: <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{oa.docusignEnvelopeId}</code></span>
                  )}
                </div>
              </div>
            </div>
          ) : oa?.status === 'sent_for_signature' ? (
            <div className="docusign-state docusign-state--pending">
              <div className="docusign-state-icon docusign-state-icon--pending" aria-hidden="true">⏳</div>
              <div>
                <div className="docusign-state-title">Awaiting GP Signature</div>
                <div className="docusign-state-meta">
                  Sent to {oa.gpEmail || 'GP'} via DocuSign
                  {oa.sentForSignatureAt && (
                    <span> on {new Date(oa.sentForSignatureAt).toLocaleDateString()}</span>
                  )}
                  {oa.docusignEnvelopeId && (
                    <span> · Envelope: <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{oa.docusignEnvelopeId}</code></span>
                  )}
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ marginTop: 12 }}
                  onClick={handleSimulateSigned}
                >
                  Simulate DocuSign Completed (demo only)
                </button>
              </div>
            </div>
          ) : (
            <>
              <p style={{ color: 'var(--color-slate-600)', marginBottom: 20 }}>
                Send the Operating Agreement to the GP for legally binding e-signature via DocuSign.
                The GP will receive an email with a link to sign.
              </p>

              <div className="field-group" style={{ maxWidth: 360, marginBottom: 20 }}>
                <label className="field-label" htmlFor="gp-email">GP email address</label>
                <input
                  id="gp-email"
                  type="email"
                  className="field-input"
                  placeholder="gp@example.com"
                  value={gpEmail}
                  onChange={(e) => setGpEmail(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setSubStep(2)}
                >
                  ← Back to Review
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleSendDocuSign}
                >
                  Send via DocuSign
                </button>
              </div>
            </>
          )}

          {oa?.status === 'signed' && (
            <div style={{ marginTop: 20 }}>
              <div className="state-banner state-banner--success">
                <span>✓</span> GP has signed. You can now send subscription agreements to investors in Stage 4.
              </div>
            </div>
          )}
        </div>
      )}

      <HelpCard text="Questions about this step? Reach out anytime." />
    </div>
  )
}
