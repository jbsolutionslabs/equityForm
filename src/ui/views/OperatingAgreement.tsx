import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAppStore, canGenerateOA, isSpvFormed } from '../../state/store'
import { useEconomicsStore, isEconomicsLocked } from '../../state/economicsStore'
import { useOaActions, useOperatingAgreementDraftSave } from '../../api/hooks/useDealMutations'
import { generatePlaceholders, validateForGeneration } from '../../utils/placeholders'
import { generateOperatingAgreementHtml, generateOperatingAgreementText, generateOperatingAgreementWordHtml } from '../../utils/pdfTemplate'
import html2pdf from 'html2pdf.js'
import { HelpCard } from '../components/HelpCard'
import ModuleProgress from '../components/ModuleProgress'
import PlaceholderCoverage from '../components/PlaceholderCoverage'

type SubStep = 1 | 2 | 3

function toLegalStateName(state: string) {
  const raw = String(state || '').trim()
  const upper = raw.toUpperCase()
  const map: Record<string, string> = {
    AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado',
    CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho',
    IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
    ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
    MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
    NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina',
    ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
    RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas',
    UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia',
    WI: 'Wisconsin', WY: 'Wyoming', DC: 'District of Columbia', PR: 'Puerto Rico',
  }
  return map[upper] || raw
}

function toLongDate(dateLike: string) {
  const raw = String(dateLike || '').trim()
  if (!raw) return raw
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return raw
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

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
  const { dealId }        = useParams<{ dealId: string }>()
  const navigate          = useNavigate()
  const data              = useAppStore((s) => s.deals[dealId!]?.data)
  const safeDeal          = data?.deal ?? {}
  const safeOffering      = data?.offering ?? {}
  const oa                = data?.operatingAgreement
  const oaActions         = useOaActions(dealId!)
  const economicsDeal   = useEconomicsStore((s) => s.deals.find((d) => d.dealId === dealId))
  const econLocked      = isEconomicsLocked(economicsDeal)

  const { values }         = data ? generatePlaceholders(data, economicsDeal ?? undefined) : { values: {} as any }
  const liveOaText         = data ? generateOperatingAgreementText(values) : ''
  const oaValidationErrors = (data && econLocked) ? validateForGeneration(values) : []

  const spvOk  = data ? isSpvFormed(data) : false
  const canGen = data ? canGenerateOA(data) && econLocked && oaValidationErrors.length === 0 : false

  // Derive current sub-step from OA status.
  // When outdated, always land on step 1 so the user sees the banner + Regenerate CTA.
  const deriveSubStep = (): SubStep => {
    if (!oa?.status || oa.status === 'not_generated' || oa.isOutdated) return 1
    if (oa.status === 'generated') return 2
    return 3  // sent_for_signature | signed
  }

  const [subStep, setSubStep] = useState<SubStep>(deriveSubStep)
  const { update: updateOaDraft, flush: flushOaDraft } = useOperatingAgreementDraftSave(dealId!)
  const [acks, setAcks]       = useState(oa?.reviewAcks ?? { a: false, b: false, c: false })
  const [gpEmail, setGpEmail] = useState(oa?.gpEmail || '')
  const [notification, setNotification] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const docRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setAcks(oa?.reviewAcks ?? { a: false, b: false, c: false })
  }, [oa?.reviewAcks])

  useEffect(() => {
    setGpEmail(oa?.gpEmail || '')
  }, [oa?.gpEmail])

  // If the OA is reset (status → not_generated) or marked outdated while the
  // component is mounted, snap back to step 1 so the user sees the Generate CTA.
  useEffect(() => {
    if (!oa?.status || oa.status === 'not_generated' || oa?.isOutdated) setSubStep(1)
  }, [oa?.status, oa?.isOutdated])

  const notify = (msg: string, type: 'success' | 'error' = 'success') => {
    setNotification({ msg, type })
    window.setTimeout(() => setNotification(null), 4000)
  }

  const entityName = safeDeal.entityName || '—'
  const formationState = toLegalStateName(safeDeal.formationState || '—')
  const effectiveDate = toLongDate(safeDeal.effectiveDate || '—')

  // ── Pull economics fields from locked Deal Economics (not from offering) ──
  const ps        = economicsDeal?.profitSplit
  const pref      = ps?.pref
  const waterfall = ps?.waterfall

  const preferredReturnPct = pref
    ? pref.type === 'none'
      ? 'None'
      : pref.rate != null
        ? `${(pref.rate * 100).toFixed(2)}% (${pref.type})`
        : '—'
    : '—'

  const lpGpSplit = waterfall
    ? waterfall.mode === 'simple'
      ? waterfall.simpleLpSplit != null
        ? `LP ${waterfall.simpleLpSplit}% / GP ${100 - waterfall.simpleLpSplit}%`
        : '—'
      : `Advanced — ${waterfall.tiers?.length ?? 0} tier${waterfall.tiers?.length === 1 ? '' : 's'}`
    : '—'

  const gpPromotePct = waterfall
    ? waterfall.mode === 'simple' && waterfall.simpleLpSplit != null
      ? `${100 - waterfall.simpleLpSplit}%`
      : waterfall.mode === 'advanced'
        ? 'See waterfall'
        : '—'
    : '—'

  const purchasePriceDisplay = economicsDeal?.capitalStack?.purchasePrice
    ? economicsDeal.capitalStack.purchasePrice.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
    : '—'

  const handleGenerate = async () => {
    if (!canGen) {
      notify('Complete SPV Formation (Stage 3) and lock Deal Economics (Stage 2) before generating the Operating Agreement.', 'error')
      return
    }
    const errs = validateForGeneration(values)
    if (errs.length > 0) {
      notify(errs[0], 'error')
      return
    }
    await oaActions.generate()
    setSubStep(2)
    setAcks({ a: false, b: false, c: false })
    notify('Operating Agreement generated. Please review and acknowledge below.')
  }

  const handleRegenerate = useCallback(async () => {
    if (!canGen) {
      notify('SPV Formation and locked Deal Economics are still required to regenerate.', 'error')
      return
    }
    const errs = validateForGeneration(values)
    if (errs.length > 0) {
      notify(errs[0], 'error')
      return
    }
    await oaActions.generate()
    setSubStep(2)
    setAcks({ a: false, b: false, c: false })
    notify('Operating Agreement regenerated with updated deal information. Please re-review and re-sign.')
  }, [canGen, oaActions, values]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSendDocuSign = async () => {
    if (!acks.a || !acks.b || !acks.c) {
      notify('Please confirm all three acknowledgments before sending.', 'error')
      return
    }
    const email = gpEmail.trim() || (safeDeal.gpSignerName ? `${safeDeal.gpSignerName.toLowerCase().replace(/\s+/g, '.')}@example.com` : 'gp@example.com')
    await oaActions.send(email)
    setSubStep(3)
    notify('Operating Agreement sent for DocuSign signature.')
  }

  const handleAckChange = async (key: 'a' | 'b' | 'c', checked: boolean) => {
    const next = { ...acks, [key]: checked }
    setAcks(next)
    updateOaDraft({ reviewAcks: next })
    await flushOaDraft()
  }

  const handleGpEmailBlur = async () => {
    const nextEmail = gpEmail.trim()
    updateOaDraft({ gpEmail: nextEmail })
    await flushOaDraft()
  }

  const handleSimulateSigned = async () => {
    await oaActions.markSigned()
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
    const html = generateOperatingAgreementWordHtml(values)
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

      {/* Legal disclaimer */}
      <div className="disclaimer-banner">
        <span className="disclaimer-banner-icon">⚠</span>
        <div className="disclaimer-banner-body">
          <strong>Legal Document Disclaimer</strong>
          <p>
            The operating agreement generated by EquityForm is a template for informational purposes
            only. It does not constitute legal advice and is not a substitute for review by a licensed
            attorney in your state. State LLC laws vary. Do not execute this document without
            professional legal review.
          </p>
        </div>
      </div>

      {/* Outdated banner — shown when core deal data changed after generation */}
      {oa?.isOutdated && (
        <div className="state-banner state-banner--warning" style={{ marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <span>
            <strong>Operating Agreement is outdated.</strong> Deal information has changed since this document was generated.
            Regenerate to reflect the latest entity, property, and offering details.
          </span>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleRegenerate}
            disabled={!canGen}
          >
            Regenerate OA
          </button>
        </div>
      )}

      {!spvOk || !econLocked ? (
        <div className="state-banner state-banner--warning" style={{ marginBottom: 20 }}>
          <span>⚠</span> Operating Agreement is blocked until SPV Formation is complete and Deal Economics are locked.
        </div>
      ) : oa?.status === 'signed' ? (
        <div className="state-banner state-banner--success" style={{ marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <span><span>✓</span> Operating Agreement successfully completed and GP-signed.</span>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => navigate(`/deals/${dealId}/investors`)}
          >
            Continue to Investor Intake →
          </button>
        </div>
      ) : (
        <div className="state-banner state-banner--warning" style={{ marginBottom: 20 }}>
          <span>⚠</span> Operating Agreement is not complete yet. Generate, review, and collect the GP signature to continue.
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

          {(!spvOk || !econLocked) && (
            <div className="gate-message" style={{ marginBottom: 20 }}>
              <strong>Gate:</strong> Both prerequisites must be met before generating the Operating Agreement:
              <ul style={{ margin: '8px 0 0', paddingLeft: 20, fontSize: 14 }}>
                <li style={{ color: spvOk ? 'var(--color-success)' : undefined }}>
                  {spvOk ? '✓' : '○'} SPV Formation (Stage 3) — all 5 formation tasks complete
                </li>
                <li style={{ color: econLocked ? 'var(--color-success)' : undefined }}>
                  {econLocked ? '✓' : '○'} Deal Economics (Stage 2) — capital stack, profit split &amp; fees locked
                </li>
              </ul>
            </div>
          )}

          {spvOk && econLocked && oaValidationErrors.length === 0 && (
            <div className="state-banner state-banner--success" style={{ marginBottom: 20 }}>
              <span>✓</span> SPV formed and Economics locked. You're ready to generate the Operating Agreement.
            </div>
          )}

          {spvOk && econLocked && oaValidationErrors.length > 0 && (
            <div className="gate-message" style={{ marginBottom: 20 }}>
              <strong>Missing data — fix before generating:</strong>
              <ul style={{ margin: '8px 0 0', paddingLeft: 20, fontSize: 14 }}>
                {oaValidationErrors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}

          {/* Deal summary card */}
          <div className="review-summary-grid" style={{ marginBottom: 24 }}>
            <div className="review-summary-item">
              <div className="review-summary-label">Entity</div>
              <div className="review-summary-value">{safeDeal.entityName || '—'}</div>
            </div>
            <div className="review-summary-item">
              <div className="review-summary-label">Formation State</div>
              <div className="review-summary-value">{safeDeal.formationState || '—'}</div>
            </div>
            <div className="review-summary-item">
              <div className="review-summary-label">Effective Date</div>
              <div className="review-summary-value">{safeDeal.effectiveDate || '—'}</div>
            </div>
            <div className="review-summary-item">
              <div className="review-summary-label">GP Entity</div>
              <div className="review-summary-value">{safeDeal.gpEntityName || '—'}</div>
            </div>
            <div className="review-summary-item">
              <div className="review-summary-label">GP Signer</div>
              <div className="review-summary-value">{safeDeal.gpSignerName || '—'}</div>
            </div>
            <div className="review-summary-item">
              <div className="review-summary-label">Offering Type</div>
              <div className="review-summary-value">{safeOffering.offeringExemption || '—'}</div>
            </div>
            <div className="review-summary-item">
              <div className="review-summary-label">Purchase Price</div>
              <div className="review-summary-value">{purchasePriceDisplay}</div>
            </div>
            <div className="review-summary-item">
              <div className="review-summary-label">Preferred Return</div>
              <div className="review-summary-value">{preferredReturnPct}</div>
            </div>
            <div className="review-summary-item">
              <div className="review-summary-label">LP / GP Split</div>
              <div className="review-summary-value">{lpGpSplit}</div>
            </div>
            <div className="review-summary-item">
              <div className="review-summary-label">GP Promote</div>
              <div className="review-summary-value">{gpPromotePct}</div>
            </div>
          </div>

          <PlaceholderCoverage />

          <div className="info-box" style={{ marginBottom: 20 }}>
            <div className="info-box-title">What gets generated?</div>
            <p style={{ margin: 0, fontSize: 14 }}>
              The system fills in entity, offering, GP details, and locked economics terms (capital stack,
              preferred return, waterfall, and fees) into a standard LLC Operating Agreement template.
              You'll review the full document and confirm accuracy before signing.
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
                  onChange={(e) => { void handleAckChange('a', e.target.checked) }}
                />
                <span>I have reviewed the full Operating Agreement and confirm the entity, GP, and property details are accurate.</span>
              </label>
              <label className="ack-item">
                <input
                  type="checkbox"
                  checked={acks.b}
                  onChange={(e) => { void handleAckChange('b', e.target.checked) }}
                />
                <span>I confirm the economic terms (preferred return, GP promote, voting thresholds) correctly reflect the agreed terms.</span>
              </label>
              <label className="ack-item">
                <input
                  type="checkbox"
                  checked={acks.c}
                  onChange={(e) => { void handleAckChange('c', e.target.checked) }}
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
                  Signed by {oa.gpSignerName || safeDeal.gpSignerName || 'GP'} on{' '}
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
                  onBlur={() => { void handleGpEmailBlur() }}
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
              <div className="state-banner state-banner--success" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                <span><span>✓</span> GP has signed. This step is complete and you can continue to Investor Intake.</span>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => navigate(`/deals/${dealId}/investors`)}
                >
                  Continue to Investor Intake →
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <HelpCard text="Questions about this step? Reach out anytime." />
    </div>
  )
}
