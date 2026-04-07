import React, { useState, useEffect } from 'react'
import Stepper, { Step } from '../components/Stepper'
import { FieldHelp, Tooltip, HelpCard } from '../components/HelpCard'
import { CurrencyInput } from '../components/CurrencyInput'
import ModuleProgress from '../components/ModuleProgress'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAppStore, OaStatus } from '../../state/store'

const baseSchema = z.object({
  offeringExemption:           z.enum(['506(b)', '506(c)', '']).optional(),
  minimumInvestment:           z.number().nullable().optional(),
  solicitationMethod:          z.string().optional(),
  preferredReturnEnabled:      z.boolean().optional(),
  preferredReturnRate:         z.number().nullable().optional(),
  preferredReturnType:         z.enum(['cumulative', 'non-cumulative', 'IRR-based', '']).optional(),
  irrRate:                     z.number().nullable().optional(),
  gpPromote:                   z.number().nullable().optional(),
  assetManagementFeeDescription: z.string().optional(),
})

const schema = baseSchema.superRefine((vals, ctx) => {
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

type FormValues = z.infer<typeof baseSchema>

export const Offering: React.FC = () => {
  const setOffering  = useAppStore((s) => s.setOffering)
  const resetOaStatus = useAppStore((s) => s.resetOaStatus)
  const data         = useAppStore((s) => s.data.offering)
  const oaStatus: OaStatus = useAppStore((s) => s.data.operatingAgreement?.status ?? 'not_generated')

  const [notification, setNotification] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [pendingVals, setPendingVals] = useState<FormValues | null>(null)

  const notify = (msg: string, type: 'success' | 'error' = 'success') => {
    setNotification({ msg, type })
    window.setTimeout(() => setNotification(null), 4000)
  }

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: data,
    mode: 'onBlur',
  })

  const { formState: { errors }, watch, setValue, getValues } = form

  const exemption         = watch('offeringExemption')
  const prefEnabled       = watch('preferredReturnEnabled')
  const prefType          = watch('preferredReturnType')
  const prefReturnRateRaw = watch('preferredReturnRate') as number | string | null | undefined
  const irrFieldVisible = prefEnabled && prefType === 'IRR-based'
  const gpPromote   = watch('gpPromote')
  const lpResidual  = gpPromote != null && !isNaN(Number(gpPromote)) ? 100 - Number(gpPromote) : null
  const prefRateRequired = Boolean(
    prefEnabled && (
      prefReturnRateRaw === null
      || prefReturnRateRaw === undefined
      || prefReturnRateRaw === ''
      || Number.isNaN(prefReturnRateRaw as number)
    )
  )

  useEffect(() => {
    if (prefEnabled && !prefType) {
      setValue('preferredReturnType', 'cumulative')
    }
    if (!prefEnabled && prefType) {
      setValue('preferredReturnType', '')
    }
  }, [prefEnabled, prefType, setValue])

  useEffect(() => {
    if (!irrFieldVisible) {
      const current = getValues('irrRate')
      if (current !== null && current !== undefined) {
        setValue('irrRate', null)
      }
    }
  }, [irrFieldVisible, getValues, setValue])

  const persistOffering = (vals: FormValues) => {
    const gp = vals.gpPromote ?? null
    const normalizedVals: FormValues = {
      ...vals,
      irrRate: vals.preferredReturnType === 'IRR-based' ? vals.irrRate ?? null : null,
    }
    setOffering({ ...normalizedVals, lpResidual: gp !== null ? 100 - gp : null })
  }

  const onSubmit = (vals: FormValues) => {
    if (oaStatus !== 'not_generated') {
      setPendingVals(vals)
      return
    }
    persistOffering(vals)
    notify('Offering saved. Deal saved.')
  }

  const saveProgress = () => {
    form.handleSubmit((vals) => {
      if (oaStatus !== 'not_generated') {
        setPendingVals(vals)
        return
      }
      persistOffering(vals)
      notify('Offering saved. You\'re ready to continue.')
    })()
  }

  const confirmChangeAndRegenerate = () => {
    if (pendingVals) {
      persistOffering(pendingVals)
      resetOaStatus()
      notify('Offering saved. Operating Agreement has been reset — please regenerate and re-sign.')
    }
    setPendingVals(null)
  }

  const cancelPendingChange = () => {
    setPendingVals(null)
    notify('Changes cancelled. Existing Operating Agreement remains unchanged.')
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
          detail="Offering economics"
        />
        <h1>Now, let's structure the economics.</h1>
        <p className="page-header-subtitle">
          Configure the offering exemption, investor returns, and the GP promote split.
          We'll explain each piece in plain English.
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
          finishLabel="Save Offering →"
          onFinish={saveProgress}
          nextDisabled={(index) => index === 2 ? prefRateRequired : false}
          scopeLabel="Offering section"
        >

          {/* ── Step 1: Offering exemption & solicitation ── */}
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
                  <label className="field-label" htmlFor="offeringExemption">
                    Offering exemption
                  </label>
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
                      ? 'Required for 506(b). Describe how you\'re finding investors — e.g. "existing network and referrals." General solicitation is not permitted.'
                      : 'How you\'re marketing the offering — e.g. "social media advertising" or "broker-dealer network."'
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

          {/* ── Step 2: Investment parameters ── */}
          <Step>
            <div className="form-section">
              <div className="form-section-title">Set Your Investment Parameters.</div>
              <p className="form-section-desc">
                Define the minimum check size and closing timeline for this offering.
              </p>

              <div className="form-row">
                <div className="field-group">
                  <div className="field-label-row">
                    <label className="field-label" htmlFor="minimumInvestment">
                      Minimum Investment ($)
                    </label>
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
                  <label className="field-label" htmlFor="closingDate">
                    Target Closing Date
                  </label>
                  <FieldHelp text="When you expect to close the round and stop accepting new subscriptions." />
                  <input
                    id="closingDate"
                    type="date"
                    className="field-input"
                    {...form.register('closingDate' as keyof FormValues)}
                  />
                </div>
              </div>
            </div>
          </Step>

          {/* ── Step 3: Preferred return ── */}
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
                      <label className="field-label" htmlFor="preferredReturnType">
                        Preferred Return Type
                      </label>
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

          {/* ── Step 4: GP promote & LP split ── */}
          <Step>
            <div className="form-section">
              <div className="form-section-title">What's The GP Promote?</div>
              <p className="form-section-desc">
                The promote is the GP's share of profits above the preferred return.
                The LP residual is calculated automatically.
              </p>

              <div className="field-group" style={{ maxWidth: 280 }}>
                <div className="field-label-row">
                  <label className="field-label" htmlFor="gpPromote">
                    GP Promote (%)
                  </label>
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

          {/* ── Step 5: Fees & optional fields ── */}
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

      <HelpCard text="Have questions about choosing an exemption, setting a preferred return, or structuring the promote? Our team can walk you through the options." />

      {/* Change warning modal */}
      {pendingVals && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="offering-change-warn-title">
          <div className="modal">
            <div className="modal-header">
              <h2 id="offering-change-warn-title" className="modal-title">Operating Agreement Already Generated</h2>
            </div>
            <div className="modal-body">
              <p style={{ margin: 0, color: 'var(--color-slate-600)' }}>
                The Operating Agreement has already been {oaStatus === 'signed' ? 'signed' : 'generated'}.
                Saving these economics changes will <strong>reset the OA</strong> and require you to regenerate
                and re-collect the GP signature.
              </p>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-primary" onClick={confirmChangeAndRegenerate}>
                Save &amp; Regenerate OA
              </button>
              <button type="button" className="btn btn-ghost" onClick={cancelPendingChange}>
                Cancel Change
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
