import React, { useState, useEffect } from 'react'
import Stepper, { Step } from '../components/Stepper'
import { FieldHelp, Tooltip, HelpCard } from '../components/HelpCard'
import { CurrencyInput } from '../components/CurrencyInput'
import ModuleProgress from '../components/ModuleProgress'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAppStore, OaStatus } from '../../state/store'
import { AddressAutocompleteInput, ParsedAddress } from '../components/AddressAutocompleteInput'

// ── Combined schema (deal + offering) ─────────────────────────────────────

const schema = z.object({
  // ── Deal / Entity fields ──────────────────────────────────────────────
  entityName:               z.string().min(1, 'Entity name is required'),
  ein:                      z.string().optional(),
  formationState:           z.string().optional(),
  effectiveDate:            z.string().optional(),
  principalAddress:         z.string().optional(),
  gpEntityName:             z.string().optional(),
  gpEntityState:            z.string().optional(),
  gpSignerName:             z.string().optional(),
  gpSignerTitle:            z.string().optional(),
  registeredAgentName:      z.string().optional(),
  registeredAgentAddress:   z.string().optional(),
  dealPurpose:              z.string().optional(),
  propertyName:             z.string().optional(),
  assetClass:               z.enum(['multifamily', 'hotel']).optional(),
  propertyAddress:          z.string().optional(),
  propertyCity:             z.string().optional(),
  propertyState:            z.string().optional(),
  propertyZip:              z.string().optional(),
  propertyLegalDescription: z.string().optional(),
  // ── Offering fields ───────────────────────────────────────────────────
  offeringExemption:        z.enum(['506(b)', '506(c)', '']).optional(),
  minimumInvestment:        z.number().nullable().optional(),
  closingDate:              z.string().optional(),
  solicitationMethod:       z.string().optional(),
}).superRefine((vals, ctx) => {
  if (vals.offeringExemption === '506(b)' && !vals.solicitationMethod) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Solicitation method is required for 506(b) — general solicitation is not permitted.',
      path: ['solicitationMethod'],
    })
  }
})

type FormValues = z.infer<typeof schema>

export const DealSetup: React.FC = () => {
  const { dealId }    = useParams<{ dealId: string }>()
  const navigate      = useNavigate()
  const setDeal       = useAppStore((s) => s.setDeal)
  const setOffering   = useAppStore((s) => s.setOffering)
  const resetOaStatus = useAppStore((s) => s.resetOaStatus)
  const dealData      = useAppStore((s) => s.deals[dealId!]?.data.deal      ?? {})
  const offeringData  = useAppStore((s) => s.deals[dealId!]?.data.offering  ?? {})
  const oaStatus: OaStatus = useAppStore((s) => s.deals[dealId!]?.data.operatingAgreement?.status ?? 'not_generated')

  const [notification, setNotification] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [pendingVals, setPendingVals]   = useState<FormValues | null>(null)

  const notify = (msg: string, type: 'success' | 'error' = 'success') => {
    setNotification({ msg, type })
    window.setTimeout(() => setNotification(null), 4000)
  }

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      ...(dealData     as Partial<FormValues>),
      ...(offeringData as Partial<FormValues>),
      assetClass: (dealData as Partial<FormValues>).assetClass ?? 'multifamily',
    },
    mode: 'onBlur',
  })

  const { formState: { errors }, watch } = form

  // ── Offering field watchers ───────────────────────────────────────────────
  const exemption = watch('offeringExemption')

  // ── Save helpers ─────────────────────────────────────────────────────────

  const doSave = (vals: FormValues) => {
    // Parse city / state / zip from full address string if individual fields are missing
    if (!vals.propertyCity || !vals.propertyState || !vals.propertyZip) {
      const last = (vals.propertyAddress || '').split(',').map((p: string) => p.trim()).slice(-1)[0] || ''
      const m = last.match(/^(.*)\s+([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/)
      if (m) {
        vals.propertyCity  = vals.propertyCity  || m[1]
        vals.propertyState = vals.propertyState || m[2]
        vals.propertyZip   = vals.propertyZip   || m[3]
      }
    }

    setDeal(dealId!, {
      entityName:               vals.entityName,
      ein:                      vals.ein,
      formationState:           vals.formationState,
      effectiveDate:            vals.effectiveDate,
      principalAddress:         vals.principalAddress,
      gpEntityName:             vals.gpEntityName,
      gpEntityState:            vals.gpEntityState,
      gpSignerName:             vals.gpSignerName,
      gpSignerTitle:            vals.gpSignerTitle,
      registeredAgentName:      vals.registeredAgentName,
      registeredAgentAddress:   vals.registeredAgentAddress,
      dealPurpose:              vals.dealPurpose,
      propertyName:             vals.propertyName,
      assetClass:               vals.assetClass,
      propertyAddress:          vals.propertyAddress,
      propertyCity:             vals.propertyCity,
      propertyState:            vals.propertyState,
      propertyZip:              vals.propertyZip,
      propertyLegalDescription: vals.propertyLegalDescription,
    })

    setOffering(dealId!, {
      offeringExemption:  vals.offeringExemption,
      minimumInvestment:  vals.minimumInvestment,
      closingDate:        vals.closingDate,
      solicitationMethod: vals.solicitationMethod,
    })
  }

  const saveProgress = () => {
    const vals = form.getValues()
    if (oaStatus !== 'not_generated') {
      setPendingVals(vals)
      return
    }
    doSave(vals)
    notify('Progress saved.')
  }

  const confirmChangeAndRegenerate = () => {
    if (pendingVals) {
      doSave(pendingVals)
      resetOaStatus(dealId!)
      notify('Saved. Operating Agreement has been reset — complete Economics and SPV Formation before regenerating.')
    }
    setPendingVals(null)
  }

  const onFinish = () => {
    form.handleSubmit((vals) => {
      doSave(vals)
      if (oaStatus !== 'not_generated') {
        resetOaStatus(dealId!)
        notify('Deal details updated. The Operating Agreement has been reset and will need to be regenerated after Economics is locked.')
      }
      navigate(`/deals/${dealId}/economics`)
    })()
  }

  return (
    <div className="page-enter">
      {/* Page header */}
      <div className="page-header">
        <ModuleProgress
          moduleLabel="Legal"
          step={1}
          totalSteps={8}
          stepTitle="Questionnaire"
          detail="Entity, property & offering"
        />
        <h1>Let's set up your deal.</h1>
        <p className="page-header-subtitle">
          We'll walk through your entity, property, managing partner, and offering
          structure — one section at a time, all at your pace.
        </p>
      </div>

      {/* Notification */}
      {notification && (
        <div className={`notification notification--${notification.type}`} role="alert">
          {notification.type === 'success' ? '✓ ' : '⚠ '}{notification.msg}
        </div>
      )}

      <div className="card">
        <Stepper
          onFinish={onFinish}
          finishLabel="Save & Continue to Deal Economics →"
          scopeLabel="Questionnaire section"
        >

          {/* ── Step 1: Entity identity ── */}
          <Step>
            <div className="form-section">
              <div className="form-section-title">Name Your Entity.</div>
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
                  <label className="field-label" htmlFor="ein">Entity EIN</label>
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
                  <label className="field-label" htmlFor="effectiveDate">Effective Date</label>
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
              <div className="form-section-title">Where Is This Entity Registered?</div>
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
                <label className="field-label" htmlFor="formationState">Formation State</label>
                <FieldHelp text="The state where your LLC is legally formed. Delaware is the most common choice for investment SPVs." />
                <input
                  id="formationState"
                  className="field-input"
                  placeholder="e.g. Delaware"
                  {...form.register('formationState')}
                />
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="registeredAgentName">Registered Agent Name</label>
                <FieldHelp text="The registered agent receives legal and government notices on behalf of your LLC. Required in all states." />
                <input
                  id="registeredAgentName"
                  className="field-input"
                  placeholder="e.g. Corporation Service Company"
                  {...form.register('registeredAgentName')}
                />
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="registeredAgentAddress">Registered Agent Address</label>
                <FieldHelp text="The official address where the registered agent can receive service of process." />
                <AddressAutocompleteInput
                  id="registeredAgentAddress"
                  className="field-input"
                  placeholder="e.g. 251 Little Falls Dr, Wilmington, DE 19808"
                  value={form.watch('registeredAgentAddress') || ''}
                  onChange={(v) => form.setValue('registeredAgentAddress', v)}
                />
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="principalAddress">Principal Office Address</label>
                <FieldHelp text="The main business address of the LLC — typically where the GP manages the deal." />
                <AddressAutocompleteInput
                  id="principalAddress"
                  className="field-input"
                  placeholder="e.g. 123 Market St, Suite 400, San Francisco, CA 94105"
                  value={form.watch('principalAddress') || ''}
                  onChange={(v) => form.setValue('principalAddress', v)}
                />
              </div>
            </div>
          </Step>

          {/* ── Step 3: Property details ── */}
          <Step>
            <div className="form-section">
              <div className="form-section-title">Tell Us About The Property.</div>
              <p className="form-section-desc">
                The investment property details will appear in the Operating Agreement, subscription
                agreements, and cap table documents.
              </p>

              <div className="field-group">
                <label className="field-label" htmlFor="propertyName">Property Name</label>
                <FieldHelp text="A short property name used across legal and accounting workflows (e.g. Sunset Ridge Apartments)." />
                <input
                  id="propertyName"
                  className="field-input"
                  placeholder="e.g. Sunset Ridge Apartments"
                  {...form.register('propertyName')}
                />
              </div>

              <div className="field-group">
                <label className="field-label">Asset Class</label>
                <FieldHelp text="Select the property asset class. Additional options may be added later." />
                <div className="toggle-group">
                  <button
                    type="button"
                    className={`toggle-btn ${form.watch('assetClass') === 'multifamily' ? 'toggle-btn--active' : ''}`}
                    onClick={() => form.setValue('assetClass', 'multifamily')}
                  >
                    Multifamily
                  </button>
                  <button
                    type="button"
                    className={`toggle-btn ${form.watch('assetClass') === 'hotel' ? 'toggle-btn--active' : ''}`}
                    onClick={() => form.setValue('assetClass', 'hotel')}
                  >
                    Hotel
                  </button>
                </div>
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="propertyAddress">Property Street Address</label>
                <FieldHelp text="The street address of the investment property as it appears in legal records." />
                <AddressAutocompleteInput
                  id="propertyAddress"
                  className="field-input"
                  placeholder="e.g. 450 Valencia St"
                  value={form.watch('propertyAddress') || ''}
                  onChange={(v) => form.setValue('propertyAddress', v)}
                  onSelectAddress={(addr: ParsedAddress) => {
                    if (addr.streetAddress) form.setValue('propertyAddress', addr.streetAddress)
                    if (addr.city)          form.setValue('propertyCity', addr.city)
                    if (addr.state)         form.setValue('propertyState', addr.state)
                    if (addr.zip)           form.setValue('propertyZip', addr.zip)
                  }}
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
                  <label className="field-label" htmlFor="propertyLegalDescription">Legal Description</label>
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
                <label className="field-label" htmlFor="dealPurpose">Deal Purpose</label>
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
              <div className="form-section-title">Who Manages This Deal?</div>
              <p className="form-section-desc">
                The General Partner (GP) is the managing entity responsible for the investment.
                Their details will appear throughout all legal documents.
              </p>

              <div className="form-row">
                <div className="field-group">
                  <label className="field-label" htmlFor="gpEntityName">GP Entity Legal Name</label>
                  <FieldHelp text="The LLC or company that acts as managing member." />
                  <input
                    id="gpEntityName"
                    className="field-input"
                    placeholder="e.g. Blue Oak Capital LLC"
                    {...form.register('gpEntityName')}
                  />
                </div>
                <div className="field-group">
                  <label className="field-label" htmlFor="gpEntityState">GP Entity State</label>
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
                  <label className="field-label" htmlFor="gpSignerName">GP Signer Name</label>
                  <FieldHelp text="The individual authorised to sign on behalf of the GP entity." />
                  <input
                    id="gpSignerName"
                    className="field-input"
                    placeholder="e.g. Jane Smith"
                    {...form.register('gpSignerName')}
                  />
                </div>
                <div className="field-group">
                  <label className="field-label" htmlFor="gpSignerTitle">GP Signer Title</label>
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

          {/* ── Step 5: Bridge to offering ── */}
          <Step>
            <div className="form-section">
              <div className="form-section-title">Entity Setup Complete.</div>
              <p className="form-section-desc">
                Your entity and property details are ready. Now let's configure the offering
                structure — exemption type, minimum investment, and closing timeline.
              </p>

              <div className="info-box">
                <div className="info-box-title">What comes next</div>
                <p>
                  The next 2 sections configure how you're raising capital. This data flows
                  directly into your Operating Agreement and subscription documents.
                  Deal economics (capital stack, preferred return, GP promote, and fees)
                  will be set up in the Deal Economics step.
                  You can also save your progress at any time using the button below.
                </p>
              </div>

              <div style={{ marginTop: 16 }}>
                <button type="button" onClick={saveProgress} className="btn btn-secondary">
                  Save progress
                </button>
              </div>
            </div>
          </Step>

          {/* ── Step 6: Offering exemption & solicitation ── */}
          <Step>
            <div className="form-section">
              <div className="form-section-title">How Are You Raising Capital?</div>
              <p className="form-section-desc">
                The Regulation D exemption determines whether you can advertise the offering publicly
                and what investor verification is required.
              </p>

              <div className="info-box">
                <div className="info-box-title">506(b) vs. 506(c) — what's the difference?</div>
                <p>
                  <strong>506(b)</strong> — No general solicitation. Up to 35 non-accredited investors
                  allowed. Typically used when you already know your investors.
                  {' '}<strong>506(c)</strong> — Public advertising allowed, but every investor must be
                  independently verified as accredited. Better for broader outreach.
                </p>
              </div>

              <div className="field-group">
                <div className="field-label-row">
                  <label className="field-label" htmlFor="offeringExemption">Offering exemption</label>
                  <Tooltip
                    title="Reg D Offering Exemption"
                    content="This determines your compliance obligations. Most private real estate SPVs use 506(b). If you plan to advertise, use 506(c)."
                  />
                </div>
                <FieldHelp text="Select the Regulation D exemption you'll rely on for this offering. Consult your securities attorney if unsure." />
                <select
                  id="offeringExemption"
                  className="field-input"
                  style={{ maxWidth: 260 }}
                  {...form.register('offeringExemption')}
                >
                  <option value="">Select exemption</option>
                  <option value="506(b)">506(b) — Private placement</option>
                  <option value="506(c)">506(c) — General solicitation (verified investors)</option>
                </select>
              </div>

              {(exemption === '506(b)' || exemption === '506(c)') && (
                <div className="field-group">
                  <div className="field-label-row">
                    <label className="field-label" htmlFor="solicitationMethod">
                      Solicitation Method
                      {exemption === '506(b)' && <span className="field-required"> *</span>}
                    </label>
                    <Tooltip
                      title="Solicitation method"
                      content="How you are finding and communicating with prospective investors. Under 506(b), you cannot use general advertising or mass marketing."
                    />
                  </div>
                  <FieldHelp text={
                    exemption === '506(b)'
                      ? "Required for 506(b). Describe how you're finding investors — e.g. \"existing network and referrals.\" General solicitation is not permitted."
                      : "How you're marketing the offering — e.g. \"social media advertising\" or \"broker-dealer network.\""
                  } />
                  <input
                    id="solicitationMethod"
                    className={`field-input${errors.solicitationMethod ? ' field-input--error' : ''}`}
                    placeholder="e.g. Existing investor network and broker referrals"
                    aria-invalid={!!errors.solicitationMethod}
                    {...form.register('solicitationMethod')}
                  />
                  {errors.solicitationMethod && (
                    <div className="field-error-msg" role="alert">
                      ⚠ {errors.solicitationMethod.message}
                    </div>
                  )}
                </div>
              )}
            </div>
          </Step>

          {/* ── Step 7: Investment parameters ── */}
          <Step>
            <div className="form-section">
              <div className="form-section-title">Set Your Investment Parameters.</div>
              <p className="form-section-desc">
                Define the minimum check size and closing timeline for this offering.
              </p>

              <div className="form-row">
                <div className="field-group">
                  <div className="field-label-row">
                    <label className="field-label" htmlFor="minimumInvestment">Minimum Investment ($)</label>
                    <Tooltip
                      title="Minimum investment"
                      content="The smallest amount an LP can commit to this offering. Common minimums are $25,000, $50,000, or $100,000 depending on the investor base."
                    />
                  </div>
                  <FieldHelp text="Enter the minimum dollar amount per investor. This appears in the subscription agreement." />
                  <Controller
                    control={form.control}
                    name="minimumInvestment"
                    render={({ field }) => (
                      <CurrencyInput
                        id="minimumInvestment"
                        className="field-input"
                        placeholder="e.g. 50000"
                        value={field.value ?? 0}
                        onChange={(v) => field.onChange(v || null)}
                      />
                    )}
                  />
                </div>

                <div className="field-group">
                  <label className="field-label" htmlFor="closingDate">Target Closing Date</label>
                  <FieldHelp text="When you expect to close the round and stop accepting new subscriptions." />
                  <input
                    id="closingDate"
                    type="date"
                    className="field-input"
                    {...form.register('closingDate')}
                  />
                </div>

              </div>
            </div>
          </Step>

        </Stepper>
      </div>

      <HelpCard text="Our team can help you verify entity details, choose an offering exemption, or review your legal formation documents. Don't hesitate to reach out." />

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
                Saving these changes will <strong>reset the OA</strong>. You will need to complete
                Deal Economics and SPV Formation before regenerating and re-signing.
              </p>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-primary" onClick={confirmChangeAndRegenerate}>
                Save &amp; Reset OA
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
