import React, { useState } from 'react'
import Stepper, { Step } from '../components/Stepper'
import { FieldHelp, Tooltip, HelpCard } from '../components/HelpCard'
import CompletionBadge from '../components/CompletionBadge'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAppStore, OaStatus } from '../../state/store'

const schema = z.object({
  entityName:              z.string().min(1, 'Entity name is required'),
  ein:                     z.string().optional(),
  formationState:          z.string().optional(),
  effectiveDate:           z.string().optional(),
  principalAddress:        z.string().optional(),
  gpEntityName:            z.string().optional(),
  gpEntityState:           z.string().optional(),
  gpSignerName:            z.string().optional(),
  gpSignerTitle:           z.string().optional(),
  registeredAgentName:     z.string().optional(),
  registeredAgentAddress:  z.string().optional(),
  dealPurpose:             z.string().optional(),
  propertyAddress:         z.string().optional(),
  propertyCity:            z.string().optional(),
  propertyState:           z.string().optional(),
  propertyZip:             z.string().optional(),
  propertyLegalDescription:z.string().optional(),
})

type FormValues = z.infer<typeof schema>

export const DealSetup: React.FC = () => {
  const navigate      = useNavigate()
  const setDeal       = useAppStore((s) => s.setDeal)
  const formSPV       = useAppStore((s) => s.formSPV)
  const resetOaStatus = useAppStore((s) => s.resetOaStatus)
  const dealData      = useAppStore((s) => s.data.deal)
  const spvFormed     = useAppStore((s) => s.data.spv?.formed)
  const oaStatus: OaStatus = useAppStore((s) => s.data.operatingAgreement?.status ?? 'not_generated')

  const [notification, setNotification] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [pendingVals, setPendingVals] = useState<FormValues | null>(null)

  const notify = (msg: string, type: 'success' | 'error' = 'success') => {
    setNotification({ msg, type })
    window.setTimeout(() => setNotification(null), 4000)
  }

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: dealData,
    mode: 'onBlur',
  })

  const { formState: { errors } } = form

  const doSave = (vals: FormValues) => {
    // Attempt to parse city/state/zip from address if not already present
    if (!vals.propertyCity || !vals.propertyState || !vals.propertyZip) {
      const last = (vals.propertyAddress || '').split(',').map((p: string) => p.trim()).slice(-1)[0] || ''
      const m = last.match(/^(.*)\s+([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/)
      if (m) {
        vals.propertyCity  = vals.propertyCity  || m[1]
        vals.propertyState = vals.propertyState || m[2]
        vals.propertyZip   = vals.propertyZip   || m[3]
      }
    }
    setDeal(vals)
    notify('Deal saved. You\'re ready to continue.')
  }

  const saveProgress = () => {
    const vals = form.getValues()
    // If OA has been generated or signed, warn before overwriting
    if (oaStatus !== 'not_generated') {
      setPendingVals(vals)
      return
    }
    doSave(vals)
  }

  const confirmChangeAndRegenerate = () => {
    if (pendingVals) {
      doSave(pendingVals)
      resetOaStatus()
      notify('Deal saved. Operating Agreement has been reset — please regenerate and re-sign.')
    }
    setPendingVals(null)
  }

  const onFormSPV = () => {
    const vals = form.getValues()
    if (!vals.entityName) {
      notify('Please enter an entity name before forming the SPV.', 'error')
      return
    }
    setDeal(vals)
    formSPV({
      formationDate:        vals.effectiveDate || new Date().toISOString(),
      ein:                  vals.ein || undefined,
      registeredAgentName:  vals.registeredAgentName || undefined,
      registeredAgentAddress: vals.registeredAgentAddress || undefined,
    })
    notify('SPV formed (simulated). You\'re ready to configure economics.')
  }

  const onFinish = () => {
    navigate('/offering')
  }

  return (
    <div className="page-enter">
      {/* Page header */}
      <div className="page-header">
        <span className="page-header-eyebrow">Step 1 of 4</span>
        <h1>Let's set up your deal.</h1>
        <p className="page-header-subtitle">
          We'll walk through your entity, property, and managing partner details
          one question at a time — all at your pace.
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

      {/* SPV already formed badge */}
      {spvFormed && (
        <div className="state-banner state-banner--success" style={{ marginBottom: 16 }}>
          <span>✓</span> SPV has been formed. You can still edit deal details below.
        </div>
      )}

      <div className="card">
        <Stepper onFinish={onFinish} finishLabel="Continue to Economics →">

          {/* ── Step 1: Entity identity ── */}
          <Step>
            <div className="form-section">
              <div className="form-section-title">Name your entity.</div>
              <p className="form-section-desc">
                This is the legal name of the LLC that will hold the investment. It will appear on all
                operating documents, investor agreements, and tax filings.
              </p>

              <div className="field-group">
                <div className="field-label-row">
                  <label className="field-label" htmlFor="entityName">
                    Entity legal name <span className="field-required">*</span>
                  </label>
                  <Tooltip
                    title="Entity legal name"
                    content="The full registered name of your LLC — exactly as it appears with the Secretary of State. Example: Blue Oak Holdings LLC"
                  />
                </div>
                <FieldHelp text="Use the full legal name, including LLC or Ltd. This appears on all investor documents." />
                <input
                  id="entityName"
                  className={`field-input${errors.entityName ? ' field-input--error' : ''}`}
                  placeholder="e.g. Blue Oak Holdings LLC"
                  aria-describedby={errors.entityName ? 'entityName-error' : undefined}
                  aria-invalid={!!errors.entityName}
                  {...form.register('entityName')}
                />
                {errors.entityName && (
                  <div className="field-error-msg" id="entityName-error" role="alert">
                    ⚠ {errors.entityName.message}
                  </div>
                )}
              </div>

              <div className="field-group">
                <div className="field-label-row">
                  <label className="field-label" htmlFor="ein">
                    Entity EIN
                  </label>
                  <Tooltip
                    title="Employer Identification Number"
                    content="Your EIN is used on all tax documents. You can find it on your IRS confirmation letter. Format: XX-XXXXXXX. You can add this after formation."
                  />
                </div>
                <FieldHelp text="You can leave this blank and add it after the IRS issues your EIN — usually within a few days." />
                <input
                  id="ein"
                  className="field-input"
                  placeholder="e.g. 12-3456789"
                  {...form.register('ein')}
                />
              </div>

              <div className="field-group">
                <div className="field-label-row">
                  <label className="field-label" htmlFor="effectiveDate">Effective date</label>
                </div>
                <FieldHelp text="The date the LLC agreement becomes effective. Leave blank to use today's date." />
                <input
                  id="effectiveDate"
                  type="date"
                  className="field-input"
                  style={{ maxWidth: 220 }}
                  {...form.register('effectiveDate')}
                />
              </div>
            </div>
          </Step>

          {/* ── Step 2: Formation & registration ── */}
          <Step>
            <div className="form-section">
              <div className="form-section-title">Where is this entity registered?</div>
              <p className="form-section-desc">
                Most SPVs are formed in Delaware for its flexible management structure and
                well-developed case law. Consult your attorney if you're considering another state.
              </p>

              <div className="info-box">
                <div className="info-box-title">Why Delaware?</div>
                <p>
                  Delaware LLCs offer flexible governance, predictable courts, and are the industry
                  standard for investment vehicles. Many investors expect Delaware formation —
                  it reduces friction and legal uncertainty.
                </p>
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="formationState">Formation state</label>
                <FieldHelp text="The state where your LLC is legally formed. Delaware is the most common choice for investment SPVs." />
                <input
                  id="formationState"
                  className="field-input"
                  placeholder="e.g. Delaware"
                  {...form.register('formationState')}
                />
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="registeredAgentName">Registered agent name</label>
                <FieldHelp text="The registered agent receives legal and government notices on behalf of your LLC. Required in all states." />
                <input
                  id="registeredAgentName"
                  className="field-input"
                  placeholder="e.g. Corporation Service Company"
                  {...form.register('registeredAgentName')}
                />
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="registeredAgentAddress">Registered agent address</label>
                <FieldHelp text="The official address where the registered agent can receive service of process." />
                <input
                  id="registeredAgentAddress"
                  className="field-input"
                  placeholder="e.g. 251 Little Falls Dr, Wilmington, DE 19808"
                  {...form.register('registeredAgentAddress')}
                />
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="principalAddress">Principal office address</label>
                <FieldHelp text="The main business address of the LLC — typically where the GP manages the deal." />
                <input
                  id="principalAddress"
                  className="field-input"
                  placeholder="e.g. 123 Market St, Suite 400, San Francisco, CA 94105"
                  {...form.register('principalAddress')}
                />
              </div>
            </div>
          </Step>

          {/* ── Step 3: Property details ── */}
          <Step>
            <div className="form-section">
              <div className="form-section-title">Tell us about the property.</div>
              <p className="form-section-desc">
                The investment property details will appear in the Operating Agreement, subscription
                agreements, and cap table documents.
              </p>

              <div className="field-group">
                <label className="field-label" htmlFor="propertyAddress">Property street address</label>
                <FieldHelp text="The street address of the investment property as it appears in legal records." />
                <input
                  id="propertyAddress"
                  className="field-input"
                  placeholder="e.g. 450 Valencia St"
                  {...form.register('propertyAddress')}
                />
              </div>

              <div className="form-row-3">
                <div className="field-group">
                  <label className="field-label" htmlFor="propertyCity">City</label>
                  <input
                    id="propertyCity"
                    className="field-input"
                    placeholder="San Francisco"
                    {...form.register('propertyCity')}
                  />
                </div>
                <div className="field-group">
                  <label className="field-label" htmlFor="propertyState">State</label>
                  <input
                    id="propertyState"
                    className="field-input"
                    placeholder="CA"
                    maxLength={2}
                    {...form.register('propertyState')}
                  />
                </div>
                <div className="field-group">
                  <label className="field-label" htmlFor="propertyZip">ZIP</label>
                  <input
                    id="propertyZip"
                    className="field-input"
                    placeholder="94103"
                    {...form.register('propertyZip')}
                  />
                </div>
              </div>

              <div className="field-group">
                <div className="field-label-row">
                  <label className="field-label" htmlFor="propertyLegalDescription">Legal description</label>
                  <Tooltip
                    title="Property legal description"
                    content="The formal legal description from the county records or title report. You can find this on the deed or title commitment. It may be long — that's expected."
                  />
                </div>
                <FieldHelp text="Optional but recommended. Found on the property deed or title report. Used in the Operating Agreement exhibit." />
                <textarea
                  id="propertyLegalDescription"
                  className="field-input"
                  placeholder="LOT 14, BLOCK 7, MISSION DISTRICT SUBDIVISION…"
                  rows={3}
                  {...form.register('propertyLegalDescription')}
                />
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="dealPurpose">Deal purpose</label>
                <FieldHelp text="A short description of the investment strategy — e.g. 'Acquire and renovate a 12-unit multifamily property in San Francisco, CA for long-term hold.'" />
                <textarea
                  id="dealPurpose"
                  className="field-input"
                  placeholder="e.g. Acquire and renovate a multifamily property in San Francisco, CA"
                  rows={2}
                  {...form.register('dealPurpose')}
                />
              </div>
            </div>
          </Step>

          {/* ── Step 4: Managing partner / GP ── */}
          <Step>
            <div className="form-section">
              <div className="form-section-title">Who manages this deal?</div>
              <p className="form-section-desc">
                The General Partner (GP) is the managing entity responsible for the investment.
                Their details will appear throughout all legal documents.
              </p>

              <div className="form-row">
                <div className="field-group">
                  <label className="field-label" htmlFor="gpEntityName">GP entity legal name</label>
                  <FieldHelp text="The LLC or company that acts as managing member." />
                  <input
                    id="gpEntityName"
                    className="field-input"
                    placeholder="e.g. Blue Oak Capital LLC"
                    {...form.register('gpEntityName')}
                  />
                </div>
                <div className="field-group">
                  <label className="field-label" htmlFor="gpEntityState">GP entity state</label>
                  <input
                    id="gpEntityState"
                    className="field-input"
                    placeholder="e.g. California"
                    {...form.register('gpEntityState')}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="field-group">
                  <label className="field-label" htmlFor="gpSignerName">GP signer name</label>
                  <FieldHelp text="The individual authorised to sign on behalf of the GP entity." />
                  <input
                    id="gpSignerName"
                    className="field-input"
                    placeholder="e.g. Jane Smith"
                    {...form.register('gpSignerName')}
                  />
                </div>
                <div className="field-group">
                  <label className="field-label" htmlFor="gpSignerTitle">GP signer title</label>
                  <input
                    id="gpSignerTitle"
                    className="field-input"
                    placeholder="e.g. Managing Member"
                    {...form.register('gpSignerTitle')}
                  />
                </div>
              </div>
            </div>
          </Step>

          {/* ── Step 5: Save & form SPV ── */}
          <Step>
            <div className="form-section">
              <div className="form-section-title">Ready to form your SPV.</div>
              <p className="form-section-desc">
                Save your progress or simulate SPV formation. Once formed, you can configure
                the offering economics in the next step.
              </p>

              {spvFormed ? (
                <div className="state-banner state-banner--success" style={{ marginBottom: 20 }}>
                  <span>✓</span> SPV has already been formed on this deal. Proceed to Economics.
                </div>
              ) : (
                <div className="info-box">
                  <div className="info-box-title">What does "Form SPV" do?</div>
                  <p>
                    This records the formation date, EIN, and registered agent details — simulating
                    what happens after you file with the Secretary of State. In production this would
                    connect to your formation provider.
                  </p>
                </div>
              )}

              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <button type="button" onClick={saveProgress} className="btn btn-secondary">
                  Save progress
                </button>
                <button
                  type="button"
                  onClick={onFormSPV}
                  className="btn btn-primary"
                  disabled={!!spvFormed}
                >
                  {spvFormed ? 'SPV formed ✓' : 'Form SPV (simulate formation)'}
                </button>
              </div>
            </div>
          </Step>

        </Stepper>
      </div>

      <HelpCard text="Our team can help you verify entity details, registered agent options, and property legal descriptions. Don't hesitate to reach out." />

      {/* Change warning modal */}
      {pendingVals && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="change-warn-title">
          <div className="modal">
            <div className="modal-header">
              <h2 id="change-warn-title" className="modal-title">Operating Agreement Already Generated</h2>
            </div>
            <div className="modal-body">
              <p style={{ margin: 0, color: 'var(--color-slate-600)' }}>
                The Operating Agreement has already been {oaStatus === 'signed' ? 'signed' : 'generated'}.
                Saving these changes will <strong>reset the OA</strong> and require you to regenerate
                and re-collect the GP signature.
              </p>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-primary" onClick={confirmChangeAndRegenerate}>
                Save &amp; Regenerate OA
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setPendingVals(null)}>
                Cancel Change
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
