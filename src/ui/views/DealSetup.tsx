import React, { useState, useEffect } from 'react'
import Stepper, { Step } from '../components/Stepper'
import { FieldHelp, Tooltip, HelpCard } from '../components/HelpCard'
import { CurrencyInput } from '../components/CurrencyInput'
import ModuleProgress from '../components/ModuleProgress'
import { useNavigate } from 'react-router-dom'
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
  propertyAddress:          z.string().optional(),
  propertyCity:             z.string().optional(),
  propertyState:            z.string().optional(),
  propertyZip:              z.string().optional(),
  propertyLegalDescription: z.string().optional(),
  // ── Offering / Economics fields ───────────────────────────────────────
  offeringExemption:        z.enum(['506(b)', '506(c)', '']).optional(),
  minimumInvestment:        z.number().nullable().optional(),
  closingDate:              z.string().optional(),
  solicitationMethod:       z.string().optional(),
  preferredReturnEnabled:   z.boolean().optional(),
  preferredReturnRate:      z.number().nullable().optional(),
  preferredReturnType:      z.enum(['cumulative', 'non-cumulative', 'IRR-based', '']).optional(),
  irrRate:                  z.number().nullable().optional(),
  gpPromote:                z.number().nullable().optional(),
  assetManagementFeeDescription: z.string().optional(),
}).superRefine((vals, ctx) => {
  if (vals.offeringExemption === '506(b)' && !vals.solicitationMethod) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Solicitation method is required for 506(b) — general solicitation is not permitted.',
      path: ['solicitationMethod'],
    })
  }
  if (vals.preferredReturnEnabled && vals.preferredReturnType === 'IRR-based') {
    if (vals.irrRate === null || vals.irrRate === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'IRR hurdle rate is required when using IRR-based preferred return.',
        path: ['irrRate'],
      })
    }
  }
  if (vals.preferredReturnEnabled) {
    if (vals.preferredReturnRate === null || vals.preferredReturnRate === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Preferred return rate is required when preferred return is enabled.',
        path: ['preferredReturnRate'],
      })
    }
  }
})

type FormValues = z.infer<typeof schema>

export const DealSetup: React.FC = () => {
  const navigate      = useNavigate()
  const setDeal       = useAppStore((s) => s.setDeal)
  const setOffering   = useAppStore((s) => s.setOffering)
  const resetOaStatus = useAppStore((s) => s.resetOaStatus)
  const dealData      = useAppStore((s) => s.data.deal)
  const offeringData  = useAppStore((s) => s.data.offering)
  const oaStatus: OaStatus = useAppStore((s) => s.data.operatingAgreement?.status ?? 'not_generated')

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
    },
    mode: 'onBlur',
  })

  const { formState: { errors }, watch, setValue, getValues } = form

  // ── Offering field watchers ───────────────────────────────────────────────
  const exemption         = watch('offeringExemption')
  const prefEnabled       = watch('preferredReturnEnabled')
  const prefType          = watch('preferredReturnType')
  const prefReturnRateRaw = watch('preferredReturnRate') as number | string | null | undefined
  const irrFieldVisible   = prefEnabled && prefType === 'IRR-based'
  const gpPromoteVal      = watch('gpPromote')
  const lpResidual        = gpPromoteVal != null && !isNaN(Number(gpPromoteVal)) ? 100 - Number(gpPromoteVal) : null
  const prefRateRequired  = Boolean(
    prefEnabled && (
      prefReturnRateRaw === null    ||
      prefReturnRateRaw === undefined ||
      prefReturnRateRaw === ''      ||
      Number.isNaN(prefReturnRateRaw as number)
    )
  )

  useEffect(() => {
    if (prefEnabled && !prefType) setValue('preferredReturnType', 'cumulative')
    if (!prefEnabled && prefType)  setValue('preferredReturnType', '')
  }, [prefEnabled, prefType, setValue])

  useEffect(() => {
    if (!irrFieldVisible) {
      const current = getValues('irrRate')
      if (current !== null && current !== undefined) setValue('irrRate', null)
    }
  }, [irrFieldVisible, getValues, setValue])

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

    setDeal({
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
      propertyAddress:          vals.propertyAddress,
      propertyCity:             vals.propertyCity,
      propertyState:            vals.propertyState,
      propertyZip:              vals.propertyZip,
      propertyLegalDescription: vals.propertyLegalDescription,
    })

    const gp = vals.gpPromote ?? null
    setOffering({
      offeringExemption:             vals.offeringExemption,
      minimumInvestment:             vals.minimumInvestment,
      closingDate:                   vals.closingDate,
      solicitationMethod:            vals.solicitationMethod,
      preferredReturnEnabled:        vals.preferredReturnEnabled,
      preferredReturnRate:           vals.preferredReturnRate,
      preferredReturnType:           vals.preferredReturnType,
      irrRate:                       vals.preferredReturnType === 'IRR-based' ? vals.irrRate ?? null : null,
      gpPromote:                     vals.gpPromote,
      assetManagementFeeDescription: vals.assetManagementFeeDescription,
      lpResidual:                    gp !== null ? 100 - gp : null,
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
      resetOaStatus()
      notify('Saved. Operating Agreement has been reset — please regenerate and re-sign.')
    }
    setPendingVals(null)
  }

  const onFinish = () => {
    form.handleSubmit((vals) => {
      if (oaStatus !== 'not_generated') {
        setPendingVals(vals)
        return
      }
      doSave(vals)
      navigate('/spv')
    })()
  }

  return (
    <div className="page-enter">
      {/* Page header */}
      <div className="page-header">
        <ModuleProgress
          moduleLabel="Legal"
          step={1}
          totalSteps={7}
          stepTitle="Questionnaire"
          detail="Entity, property & economics"
        />
        <h1>Let's set up your deal.</h1>
        <p className="page-header-subtitle">
          We'll walk through your entity, property, managing partner, and offering
          economics — one section at a time, all at your pace.
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
          finishLabel="Save & Continue to SPV Formation →"
          nextDisabled={(index) => index === 7 ? prefRateRequired : false}
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

          {/* ── Step 5: Bridge to economics ── */}
          <Step>
            <div className="form-section">
              <div className="form-section-title">Entity Setup Complete.</div>
              <p className="form-section-desc">
                Your entity and property details are ready. Now let's configure the offering
                structure — exemption type, LP returns, and the GP promote.
              </p>

              <div className="info-box">
                <div className="info-box-title">What comes next</div>
                <p>
                  The next 5 sections configure how you're raising capital and how
                  returns are distributed between LPs and the GP. This data flows
                  directly into your Operating Agreement and subscription documents.
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

          {/* ── Step 8: Preferred return ── */}
          <Step>
            <div className="form-section">
              <div className="form-section-title">Structure The LP Preferred Return.</div>
              <p className="form-section-desc">
                A preferred return gives LPs priority on distributions before the GP earns a promote.
                It aligns incentives and is standard in most real estate deals.
              </p>

              <div className="info-box">
                <div className="info-box-title">Preferred return explained</div>
                <p>
                  LPs receive distributions equal to their preferred return percentage before the GP
                  takes any promote. A <em>cumulative</em> preferred return accrues unpaid amounts;
                  a <em>non-cumulative</em> return does not. IRR-based structures use a hurdle rate.
                </p>
              </div>

              <div className="checkbox-row">
                <input
                  type="checkbox"
                  id="preferredReturnEnabled"
                  {...form.register('preferredReturnEnabled')}
                />
                <label className="checkbox-label" htmlFor="preferredReturnEnabled">
                  Enable LP preferred return
                </label>
              </div>

              {prefEnabled && (
                <>
                  <div className="form-row" style={{ marginTop: 16 }}>
                    <div className="field-group">
                      <div className="field-label-row">
                        <label className="field-label" htmlFor="preferredReturnRate">
                          Preferred Return Rate (%)
                        </label>
                      </div>
                      <FieldHelp text="Annual percentage LPs earn before GP promote kicks in. 6–8% is common." />
                      <input
                        id="preferredReturnRate"
                        type="number"
                        className={`field-input${prefRateRequired ? ' field-input--error' : ''}`}
                        placeholder="e.g. 8"
                        min={0}
                        max={100}
                        step={0.5}
                        aria-invalid={prefRateRequired}
                        {...form.register('preferredReturnRate', { valueAsNumber: true })}
                      />
                    </div>

                    <div className="field-group">
                      <label className="field-label" htmlFor="preferredReturnType">Preferred Return Type</label>
                      <FieldHelp text="How unpaid preferred return is treated over time." />
                      <select
                        id="preferredReturnType"
                        className="field-input"
                        {...form.register('preferredReturnType')}
                      >
                        <option value="">Select type</option>
                        <option value="cumulative">Cumulative</option>
                        <option value="non-cumulative">Non-cumulative</option>
                        <option value="IRR-based">IRR-based</option>
                      </select>
                    </div>
                  </div>

                  {prefType === 'IRR-based' && (
                    <div className="field-group">
                      <div className="field-label-row">
                        <label className="field-label" htmlFor="irrRate">
                          IRR Hurdle Rate (%) <span className="field-required">*</span>
                        </label>
                      </div>
                      <FieldHelp text="The minimum IRR investors must receive before the GP earns any promote." />
                      <input
                        id="irrRate"
                        type="number"
                        className={`field-input${errors.irrRate ? ' field-input--error' : ''}`}
                        placeholder="e.g. 10"
                        min={0}
                        step={0.5}
                        style={{ maxWidth: 160 }}
                        aria-invalid={!!errors.irrRate}
                        {...form.register('irrRate', { valueAsNumber: true })}
                      />
                      {errors.irrRate && (
                        <div className="field-error-msg" role="alert">
                          ⚠ {errors.irrRate.message}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </Step>

          {/* ── Step 9: GP promote & LP split ── */}
          <Step>
            <div className="form-section">
              <div className="form-section-title">What's The GP Promote?</div>
              <p className="form-section-desc">
                The promote is the GP's share of profits above the preferred return.
                The LP residual is calculated automatically.
              </p>

              <div className="field-group" style={{ maxWidth: 280 }}>
                <div className="field-label-row">
                  <label className="field-label" htmlFor="gpPromote">GP Promote (%)</label>
                  <Tooltip
                    title="GP Promote / Carried Interest"
                    content="The percentage of profits above the preferred return that the GP keeps. 20% is the industry standard — sometimes called '2 and 20' with a 2% management fee."
                  />
                </div>
                <FieldHelp text="Enter the GP's share of profits after the preferred return. 20% is standard." />
                <input
                  id="gpPromote"
                  type="number"
                  className="field-input"
                  placeholder="e.g. 20"
                  min={0}
                  max={100}
                  step={1}
                  {...form.register('gpPromote', { valueAsNumber: true })}
                />
              </div>

              {lpResidual !== null && (
                <div className="info-box" style={{ marginTop: 16, maxWidth: 320 }}>
                  <div className="info-box-title">LP residual: {lpResidual}%</div>
                  <p>LPs will receive {lpResidual}% of profits above the preferred return.</p>
                </div>
              )}
            </div>
          </Step>

          {/* ── Step 10: Fees & asset management ── */}
          <Step>
            <div className="form-section">
              <div className="form-section-title">Optional: Fees &amp; Asset Management.</div>
              <p className="form-section-desc">
                Describe any management or transaction fees the GP will charge. These appear in the
                Operating Agreement. Leave blank if not applicable.
              </p>

              <div className="field-group">
                <label className="field-label" htmlFor="assetManagementFeeDescription">
                  Asset Management Fee Description
                </label>
                <FieldHelp text='e.g. "1% per annum of invested equity, charged quarterly from operating cash flow."' />
                <textarea
                  id="assetManagementFeeDescription"
                  className="field-input"
                  rows={2}
                  placeholder="Describe the asset management fee structure, if any"
                  {...form.register('assetManagementFeeDescription')}
                />
              </div>
            </div>
          </Step>

        </Stepper>
      </div>

      <HelpCard text="Our team can help you verify entity details, choose an exemption, structure the preferred return, or review your GP promote. Don't hesitate to reach out." />

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
