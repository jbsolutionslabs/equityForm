import React, { useEffect, useMemo, useState } from 'react'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import type { SubmitHandler } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAppStore, Investor, canSendSubAgreements } from '../../state/store'
import { v4 as uuidv4 } from 'uuid'
import { generateSubscriptionAgreementHtml } from '../../utils/pdfTemplate'
import { generatePlaceholders } from '../../utils/placeholders'
import { BLUE_SKY_RULE_506_BY_STATE } from '../../utils/blueSkyRules'
import { FieldHelp, HelpCard } from '../components/HelpCard'
import { CurrencyInput } from '../components/CurrencyInput'
import ModuleProgress from '../components/ModuleProgress'
import { AddressAutocompleteInput, ParsedAddress } from '../components/AddressAutocompleteInput'

/* ─── Schema helpers ─────────────────────────────────────────────────────── */
const requiredString = (message: string) => z.string().min(1, message)
const sanitizeNumberField = (label: string) =>
  z.preprocess(
    (value) => {
      if (value === null || value === undefined) return undefined
      if (typeof value === 'number' && Number.isNaN(value)) return undefined
      return value
    },
    z.number({ invalid_type_error: `${label} is required`, required_error: `${label} is required` }),
  )
const positiveNumberField = (label: string) =>
  sanitizeNumberField(label).refine((value) => value > 0, { message: `${label} must be greater than 0` })

const investorSchema = z
  .object({
    id:               z.string(),
    fullLegalName:    requiredString('Full legal name is required'),
    subscriberType:   z.union([z.literal('individual'), z.literal('entity')]),
    entityLegalName:  z.string().optional(),
    formationState:   z.string().optional(),
    signerName:       z.string().optional(),
    signerTitle:      z.string().optional(),
    subscriptionAmount: positiveNumberField('Subscription amount'),
    classAUnits:        positiveNumberField('Class A units'),
    streetAddress:    requiredString('Street address is required'),
    city:             requiredString('City is required'),
    state:            requiredString('State is required'),
    zip:              requiredString('ZIP is required'),
    email: z
      .string()
      .optional()
      .refine((value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), {
        message: 'Valid email address is required',
      }),
    phone:            z.string().optional(),
    taxId:            z.string().optional(),
    accreditedInvestor: z.preprocess(
      (value) => (value === null || value === undefined ? false : value),
      z.boolean(),
    ),
    accreditedInvestorBasis: z
      .union([z.literal('income'), z.literal('net_worth')])
      .nullable()
      .optional(),
  })
  .superRefine((investor, ctx) => {
    if (investor.subscriberType === 'entity') {
      if (!investor.entityLegalName?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Entity legal name is required for entity investors',
          path: ['entityLegalName'],
        })
      }
      if (!investor.formationState?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Formation state is required for entity investors',
          path: ['formationState'],
        })
      }
      if (!investor.signerName?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Authorised signer name is required for entity investors',
          path: ['signerName'],
        })
      }
      if (!investor.signerTitle?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Signer title is required for entity investors',
          path: ['signerTitle'],
        })
      }
    }

    if (investor.accreditedInvestor && !investor.accreditedInvestorBasis) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Select how this investor qualifies as accredited',
        path: ['accreditedInvestorBasis'],
      })
    }
  })

const schema = z.object({
  investors: z.array(investorSchema),
})

type FormInvestor = z.infer<typeof investorSchema>
type FormValues = { investors: FormInvestor[] }

const mapInvestorToForm = (investor: Investor): FormInvestor => ({
  id: investor.id,
  fullLegalName: investor.fullLegalName || '',
  subscriberType: investor.subscriberType,
  entityLegalName: investor.entityLegalName || '',
  formationState: investor.formationState || '',
  signerName: investor.signerName || '',
  signerTitle: investor.signerTitle || '',
  subscriptionAmount: investor.subscriptionAmount ?? 0,
  classAUnits: investor.classAUnits ?? 0,
  streetAddress: investor.streetAddress || '',
  city: investor.city || '',
  state: investor.state || '',
  zip: investor.zip || '',
  email: investor.email || '',
  phone: investor.phone || '',
  taxId: investor.taxId || '',
  accreditedInvestor: Boolean(investor.accreditedInvestor),
  accreditedInvestorBasis:
    investor.accreditedInvestorBasis === 'income' || investor.accreditedInvestorBasis === 'net_worth'
      ? investor.accreditedInvestorBasis
      : null,
})

const createBlankFormInvestor = (id: string): FormInvestor => ({
  id,
  fullLegalName: '',
  subscriberType: 'individual',
  entityLegalName: '',
  formationState: '',
  signerName: '',
  signerTitle: '',
  subscriptionAmount: 0,
  classAUnits: 0,
  streetAddress: '',
  city: '',
  state: '',
  zip: '',
  email: '',
  phone: '',
  taxId: '',
  accreditedInvestor: false,
  accreditedInvestorBasis: null,
})

const createBlankStoreInvestor = (id: string): Investor => ({
  id,
  fullLegalName: '',
  subscriberType: 'individual',
  entityLegalName: '',
  formationState: '',
  signerName: '',
  signerTitle: '',
  subscriptionAmount: 0,
  classAUnits: 0,
  streetAddress: '',
  city: '',
  state: '',
  zip: '',
  email: '',
  phone: '',
  taxId: '',
  accreditedInvestor: false,
  accreditedInvestorBasis: null,
})

const STATE_CODE_TO_NAME: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado',
  CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho',
  IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina',
  ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas',
  UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia',
  WI: 'Wisconsin', WY: 'Wyoming', DC: 'District of Columbia',
}

const STATE_NAME_TO_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_CODE_TO_NAME).map(([code, name]) => [name.toLowerCase(), code]),
)

function normalizeStateCode(input?: string): string | null {
  if (!input) return null
  const value = input.trim()
  if (!value) return null
  const maybeCode = value.toUpperCase()
  if (STATE_CODE_TO_NAME[maybeCode]) return maybeCode
  const maybeFromName = STATE_NAME_TO_CODE[value.toLowerCase()]
  return maybeFromName || null
}

function stateDisplayLabel(input?: string): string {
  const normalized = normalizeStateCode(input)
  if (normalized) return `${STATE_CODE_TO_NAME[normalized]} (${normalized})`
  return input?.trim() || 'Unknown state'
}

function fmtRuleValue(value?: string): string {
  if (!value?.trim()) return 'Not listed'
  return value
}

/* ─── Status helpers ─────────────────────────────────────────────────────── */
const STATUS_LABELS: Record<string, string> = {
  pending: 'Generated',
  sent:    'Sent for e-sign',
  signed:  'Signed',
  paid:    'Wire received',
}

const STATUS_CLASS: Record<string, string> = {
  pending: 'status-badge--pending',
  sent:    'status-badge--sent',
  signed:  'status-badge--signed',
  paid:    'status-badge--paid',
}

/* ─── Component ──────────────────────────────────────────────────────────── */
export const Investors: React.FC = () => {
  const data                        = useAppStore((s) => s.data.investors)
  const blueSkyFilings              = useAppStore((s) => s.data.blueSkyFilings)
  const addInvestor                 = useAppStore((s) => s.addInvestor)
  const updateInvestor              = useAppStore((s) => s.updateInvestor)
  const removeInvestor              = useAppStore((s) => s.removeInvestor)
  const setBlueSkyFilingStep        = useAppStore((s) => s.setBlueSkyFilingStep)
  const generateSubscriptionForInvestor = useAppStore((s) => s.generateSubscriptionForInvestor)
  const sendSubscriptionForSignature    = useAppStore((s) => s.sendSubscriptionForSignature)
  const markSubscriptionSigned          = useAppStore((s) => s.markSubscriptionSigned)
  const recordWirePayment               = useAppStore((s) => s.recordWirePayment)
  const appData    = useAppStore((s) => s.data)
  const subscriptions = appData.subscriptions
  const offering   = appData.offering

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { investors: data.map(mapInvestorToForm) },
    mode: 'onBlur',
  })
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'investors',
    keyName: 'fieldKey',
  })

  // UI state
  const [expanded, setExpanded]   = useState<Record<number, boolean>>({})
  const [wireInput, setWireInput] = useState<Record<number, string>>({})
  const [showWire, setShowWire]   = useState<Record<number, boolean>>({})
  const [notification, setNotification] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  const notify = (msg: string, type: 'success' | 'error' = 'success') => {
    setNotification({ msg, type })
    window.setTimeout(() => setNotification(null), 4000)
  }

  const toggleExpand = (idx: number) =>
    setExpanded((prev) => ({ ...prev, [idx]: !prev[idx] }))

  const getSubStatus = (id: string) =>
    subscriptions.find((s) => s.investorId === id)?.status ?? null

  useEffect(() => {
    form.reset({ investors: data.map(mapInvestorToForm) })
  }, [data, form])

  const onAdd = () => {
    const id = uuidv4()
    const blankForm = createBlankFormInvestor(id)
    append(blankForm)
    const newIdx = fields.length
    setExpanded((prev) => ({ ...prev, [newIdx]: true }))
  }

  const onRemove = (idx: number, id: string) => {
    remove(idx)
    if (data.some((inv) => inv.id === id)) {
      removeInvestor(id)
    }
    setExpanded((prev) => {
      const next = { ...prev }
      delete next[idx]
      return next
    })
  }

  const onSave: SubmitHandler<FormValues> = (vals) => {
    const nonAccredited = vals.investors.filter((inv) => inv.accreditedInvestor !== true)

    if (offering.offeringExemption === '506(c)') {
      const bad = vals.investors.filter(
        (inv) => inv.accreditedInvestor !== true || !inv.accreditedInvestorBasis,
      )
      if (bad.length > 0) {
        notify(
          'Under 506(c) all investors must be accredited and include whether they qualify by income or net worth.',
          'error',
        )
        return
      }
    }
    vals.investors.forEach((inv) => {
      const payload: Partial<Investor> = {
        ...inv,
        derivedLastName:
          (inv as Investor).derivedLastName ??
          (inv.fullLegalName ? inv.fullLegalName.split(' ').slice(-1)[0] : ''),
      }

      if (data.some((existing) => existing.id === inv.id)) {
        updateInvestor(inv.id, payload)
      } else {
        addInvestor(payload as Investor)
      }
    })

    if (nonAccredited.length > 0) {
      notify(
        `Investors saved with warning: ${nonAccredited.length} investor${nonAccredited.length === 1 ? '' : 's'} marked as not accredited. Confirm your exemption permits non-accredited investors.`,
        'error',
      )
      return
    }

    notify('Investors saved. Deal saved.')
  }

  const onInvalid = () => {
    notify('Could not save investors. Please fix the required fields and try again.', 'error')
  }

  const previewSubscription = (invId: string) => {
    const appData   = useAppStore.getState().data
    const ph        = generatePlaceholders(appData)
    const idx       = appData.investors.findIndex((i) => i.id === invId)
    const invPh     = (ph.values.INVESTORS && (ph.values.INVESTORS as unknown[])[idx]) ?? {}
    const html      = generateSubscriptionAgreementHtml(ph.values, invPh as Record<string, unknown>)
    const w = window.open('', '_blank')
    if (w) {
      w.document.open()
      w.document.write(html)
      w.document.close()
    } else {
      notify('Popup blocked — please allow popups for this site to preview the subscription agreement.', 'error')
    }
  }

  const canGenerateSub = canSendSubAgreements(appData)
  const watchedInvestors = form.watch('investors') || []
  const blueSkyStates = useMemo(() => {
    const byState = new Map<string, number>()
    watchedInvestors.forEach((inv) => {
      const code = normalizeStateCode(inv.state)
      if (!code) return
      byState.set(code, (byState.get(code) || 0) + 1)
    })
    return Array.from(byState.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [watchedInvestors])
  const blueSkyChecklistSteps: { key: 'requirementsReviewed' | 'stateNoticeFiled' | 'stateFeePaid' | 'evidenceSaved'; label: string; hint: string }[] = [
    {
      key: 'requirementsReviewed',
      label: 'Review state-specific blue sky requirements',
      hint: 'Confirm notice form type, deadlines, and exemptions for this jurisdiction.',
    },
    {
      key: 'stateNoticeFiled',
      label: 'File state notice (Form D notice filing)',
      hint: 'Submit the required state notice filing after SEC Form D filing, per state rules.',
    },
    {
      key: 'stateFeePaid',
      label: 'Pay state filing fee',
      hint: 'Record fee payment/waiver confirmation for this state filing.',
    },
    {
      key: 'evidenceSaved',
      label: 'Save evidence of filing and acceptance',
      hint: 'Keep copy of submission, receipt, and acceptance confirmation in your deal records.',
    },
  ]

  const stateComplianceRows = blueSkyStates.map(([code, count]) => {
    const rule = BLUE_SKY_RULE_506_BY_STATE[code]
    const requiresNotice = rule?.requiresFormDNoticeFiling !== false
    const filing =
      blueSkyFilings[code] || {
        requirementsReviewed: false,
        stateNoticeFiled: false,
        stateFeePaid: false,
        evidenceSaved: false,
      }
    const completedCount = blueSkyChecklistSteps.reduce(
      (sum, step) => sum + (filing[step.key] ? 1 : 0),
      0,
    )
    const isComplete = requiresNotice
      ? completedCount === blueSkyChecklistSteps.length
      : true

    return {
      code,
      count,
      rule,
      requiresNotice,
      filing,
      completedCount,
      isComplete,
    }
  })

  const rowsRequiringNotice = stateComplianceRows.filter((row) => row.requiresNotice)
  const rowsNoNoticeRequired = stateComplianceRows.filter((row) => !row.requiresNotice)
  const allBlueSkyCompliant = stateComplianceRows.length > 0 && stateComplianceRows.every((row) => row.isComplete)
  const totalChecklistItems = rowsRequiringNotice.length * blueSkyChecklistSteps.length
  const completedChecklistItems = rowsRequiringNotice.reduce((sum, row) => sum + row.completedCount, 0)

  return (
    <div className="page-enter">
      {/* Page header */}
      <div className="page-header">
        <ModuleProgress
          moduleLabel="Legal"
          step={4}
          totalSteps={7}
          stepTitle="Investor Intake"
          detail="Add investors and prepare subscription agreements"
        />
        <h1>Who's investing in this round?</h1>
        <p className="page-header-subtitle">
          Add each LP's details below. Once the SPV is formed and the Operating Agreement is
          GP-signed, you can generate and send subscription agreements.
        </p>
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          {!canGenerateSub && (
            <span className="gate-message" style={{ fontSize: 13 }}>
              Subscription agreements locked — Operating Agreement must be GP-signed first (Stage 3)
            </span>
          )}
        </div>
      </div>

      {/* Notification */}
      {notification && (
        <div className={`notification notification--${notification.type}`} role="alert">
          {notification.type === 'success' ? '✓ ' : '⚠ '}{notification.msg}
        </div>
      )}

      {blueSkyStates.length > 0 && (
        <>
          <div
            className={`state-banner ${allBlueSkyCompliant ? 'state-banner--success' : 'state-banner--warning'}`}
            role="status"
            aria-live="polite"
            style={{ marginBottom: 12 }}
          >
            <span aria-hidden="true">{allBlueSkyCompliant ? '✓' : '⚠'}</span>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>
                {allBlueSkyCompliant ? 'Blue sky compliance complete' : 'Blue sky filing checklist in progress'}
              </div>
              <div style={{ fontSize: 13, color: 'var(--color-slate-700)' }}>
                {allBlueSkyCompliant
                  ? `All tracked state filing steps are complete (${completedChecklistItems}/${totalChecklistItems}).`
                  : `Complete required filing tasks for investor states (${completedChecklistItems}/${totalChecklistItems} complete).`}{' '}
                SEC Form D is generally due within 15 days after first sale.
              </div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header" style={{ fontSize: 15, marginBottom: 8 }}>
              State blue sky filings (based on investor addresses)
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--color-slate-600)', marginBottom: 14 }}>
              Dataset basis: Rule 506 / Form D state notice layer (NASAA EFD schedule as of 2026-01-01).
              Always confirm jurisdiction-specific updates with counsel.
            </div>

            <div style={{ display: 'grid', gap: 14 }}>
              {stateComplianceRows.map((row) => (
                <div
                  key={row.code}
                  style={{
                    border: '1px solid var(--color-slate-200)',
                    borderRadius: 10,
                    padding: 12,
                    background: row.isComplete ? 'rgba(24, 124, 70, 0.06)' : 'var(--color-slate-50)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8, alignItems: 'center' }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>
                      {row.rule?.stateName || STATE_CODE_TO_NAME[row.code] || row.code} ({row.code}){row.count > 1 ? ` · ${row.count} LPs` : ''}
                    </div>
                    <span className={`status-badge ${row.isComplete ? 'status-badge--paid' : 'status-badge--pending'}`} style={{ fontSize: 11 }}>
                      {row.requiresNotice
                        ? `${row.completedCount}/${blueSkyChecklistSteps.length} complete`
                        : 'No notice filing required'}
                    </span>
                  </div>

                  <div style={{ fontSize: 12.5, color: 'var(--color-slate-600)', marginBottom: 10, display: 'grid', gap: 4 }}>
                    <div><strong>New notice fee:</strong> {fmtRuleValue(row.rule?.newNoticeFee)}</div>
                    <div><strong>Fee type:</strong> {fmtRuleValue(row.rule?.feeType)}</div>
                    {!!row.rule?.variableCalculation && (
                      <div><strong>Variable calculation:</strong> {fmtRuleValue(row.rule?.variableCalculation)}</div>
                    )}
                    {!!row.rule?.lateFee && row.rule.lateFee !== 'No' && (
                      <div><strong>Late filing fee:</strong> {row.rule.lateFee}</div>
                    )}
                    {row.rule?.hasRenewalOrAnnualSalesReportFee && (
                      <div><strong>Renewal/annual fee:</strong> {fmtRuleValue(row.rule?.renewalOrAnnualSalesReportFee)}</div>
                    )}
                    {!!row.rule?.amendmentNoticeFee && row.rule.amendmentNoticeFee !== 'No' && (
                      <div><strong>Amendment fee:</strong> {row.rule.amendmentNoticeFee}</div>
                    )}
                  </div>

                  {row.requiresNotice ? (
                    <div style={{ display: 'grid', gap: 8 }}>
                      {blueSkyChecklistSteps.map((step) => (
                        <label key={step.key} className="checkbox-row" style={{ alignItems: 'flex-start', marginTop: 0 }}>
                          <input
                            type="checkbox"
                            checked={Boolean(row.filing[step.key])}
                            onChange={(e) => setBlueSkyFilingStep(row.code, step.key, e.target.checked)}
                          />
                          <span className="checkbox-label" style={{ display: 'grid', gap: 2 }}>
                            <span>{step.label}</span>
                            <span style={{ fontSize: 12, color: 'var(--color-slate-500)', fontWeight: 400 }}>{step.hint}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <div className="state-banner state-banner--success" style={{ marginBottom: 0 }}>
                      <span aria-hidden="true">✓</span>
                      <span style={{ fontSize: 12.5 }}>
                        This state is marked as not requiring a Rule 506 Form D notice filing in the provided dataset.
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {rowsNoNoticeRequired.length > 0 && (
              <div style={{ marginTop: 12, fontSize: 12, color: 'var(--color-slate-500)' }}>
                No-notice states detected: {rowsNoNoticeRequired.map((row) => row.code).join(', ')}.
              </div>
            )}
          </div>
        </>
      )}

      {/* Top actions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <button type="button" onClick={onAdd} className="btn btn-primary">
          + Add investor
        </button>
        <button type="button" onClick={form.handleSubmit(onSave, onInvalid)} className="btn btn-secondary">
          Save all investors
        </button>
      </div>

      {/* Empty state */}
      {fields.length === 0 && (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-title">No investors added yet.</div>
            <p className="empty-state-body">
              Add your first investor to get started. You can add as many LPs as needed
              and generate individual subscription agreements for each.
            </p>
            <button type="button" onClick={onAdd} className="btn btn-primary">
              + Add first investor
            </button>
          </div>
        </div>
      )}

      {/* Investor cards */}
      <form onSubmit={form.handleSubmit(onSave, onInvalid)}>
        {fields.map((f, idx) => {
          const name   = form.watch(`investors.${idx}.fullLegalName` as const) || 'New investor'
          const type   = form.watch(`investors.${idx}.subscriberType` as const)
          const amount = form.watch(`investors.${idx}.subscriptionAmount` as const)
          const isAccredited = form.watch(`investors.${idx}.accreditedInvestor` as const)
          const isExpanded = expanded[idx] ?? false
          const subStatus  = getSubStatus(f.id)
          const investorState = form.watch(`investors.${idx}.state` as const)
          const blueSkyStateCode = normalizeStateCode(investorState)

          return (
            <div key={f.fieldKey} className="investor-card">
              {/* Card header (always visible) */}
              <div
                className="investor-card-header"
                onClick={() => toggleExpand(idx)}
                role="button"
                tabIndex={0}
                aria-expanded={isExpanded}
                aria-label={`${name} — click to ${isExpanded ? 'collapse' : 'expand'}`}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleExpand(idx) }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                  <div className="investor-card-number" aria-hidden="true">{idx + 1}</div>
                  <div>
                    <div className="investor-card-name">{name}</div>
                    <div className="investor-card-meta">
                      {type === 'entity' ? 'Entity' : 'Individual'}
                        {amount ? ` · $${Number(amount).toLocaleString()}` : ''}
                        {` · ${isAccredited ? 'Accredited' : 'Not accredited'}`}
                    </div>
                  </div>
                </div>
                <div className="investor-card-actions" onClick={(e) => e.stopPropagation()}>
                  {subStatus && (
                    <span className={`status-badge ${STATUS_CLASS[subStatus] ?? 'status-badge--none'}`}>
                      {STATUS_LABELS[subStatus] ?? subStatus}
                    </span>
                  )}
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => toggleExpand(idx)}
                    aria-label={isExpanded ? 'Collapse investor form' : 'Expand investor form'}
                  >
                    {isExpanded ? '↑ Collapse' : '↓ Edit'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => onRemove(idx, f.id)}
                    aria-label={`Remove ${name}`}
                  >
                    Remove
                  </button>
                </div>
              </div>

              {/* Expanded form body */}
              {isExpanded && (
                <div className="investor-card-body">
                  <div className="investor-action-panel">
                    <div className="investor-action-header">
                      <div>
                        <div className="investor-action-title">Subscription agreement</div>
                        <div className="investor-action-subtitle">
                          Generate, send, and record status for this investor's subscription.
                        </div>
                      </div>
                      {subStatus && (
                        <span className={`status-badge ${STATUS_CLASS[subStatus] ?? 'status-badge--none'}`}>
                          {STATUS_LABELS[subStatus] ?? subStatus}
                        </span>
                      )}
                    </div>
                    <div className="investor-action-buttons">
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={!canGenerateSub}
                        title={!canGenerateSub ? 'Operating Agreement must be GP-signed (Stage 3) before generating subscription agreements' : undefined}
                        onClick={() => {
                          generateSubscriptionForInvestor(f.id)
                          notify(`Subscription generated for ${name}.`)
                        }}
                      >
                        Generate subscription
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={!canGenerateSub}
                        title={!canGenerateSub ? 'Operating Agreement must be GP-signed (Stage 3) before sending subscription agreements' : undefined}
                        onClick={() => {
                          sendSubscriptionForSignature(f.id)
                          notify(`Subscription sent for e-signature for ${name}.`)
                        }}
                      >
                        Send for e-sign
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => previewSubscription(f.id)}
                      >
                        Preview agreement
                      </button>
                    </div>
                    <div className="investor-action-links">
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() => {
                          markSubscriptionSigned(f.id)
                          notify(`Marked as signed for ${name}.`)
                        }}
                      >
                        Mark signed
                      </button>
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() => setShowWire((prev) => ({ ...prev, [idx]: !prev[idx] }))}
                      >
                        Record wire
                      </button>
                    </div>

                    {showWire[idx] && (
                      <div className="investor-wire-row">
                        <input
                          className="field-input"
                          style={{ maxWidth: 280, height: 38 }}
                          placeholder="Wire confirmation #"
                          value={wireInput[idx] ?? ''}
                          onChange={(e) => setWireInput((prev) => ({ ...prev, [idx]: e.target.value }))}
                          aria-label="Wire confirmation number"
                        />
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => {
                            const conf = wireInput[idx]?.trim()
                            if (conf) {
                              recordWirePayment(f.id, conf)
                              setShowWire((prev) => ({ ...prev, [idx]: false }))
                              setWireInput((prev) => ({ ...prev, [idx]: '' }))
                              notify(`Wire recorded for ${name}.`)
                            }
                          }}
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setShowWire((prev) => ({ ...prev, [idx]: false }))}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Identity */}
                  <div className="form-section-title" style={{ fontSize: 15, marginBottom: 12, marginTop: 4 }}>
                    Identity &amp; Type
                  </div>
                  <div className="form-row">
                    <div className="field-group">
                      <label className="field-label" htmlFor={`investor-name-${idx}`}>
                        Full Legal Name <span className="field-required">*</span>
                      </label>
                      <FieldHelp text="As it should appear on the subscription agreement and all documents." />
                      <input
                        id={`investor-name-${idx}`}
                        className="field-input"
                        placeholder="e.g. Jane A. Smith"
                        {...form.register(`investors.${idx}.fullLegalName` as const)}
                      />
                    </div>
                    <div className="field-group">
                      <label className="field-label" htmlFor={`investor-type-${idx}`}>Subscriber Type</label>
                      <FieldHelp text="Is this investor a person or a legal entity?" />
                      <select
                        id={`investor-type-${idx}`}
                        className="field-input"
                        {...form.register(`investors.${idx}.subscriberType` as const)}
                      >
                        <option value="individual">Individual</option>
                        <option value="entity">Entity (LLC, Trust, etc.)</option>
                      </select>
                    </div>
                  </div>

                  {type === 'entity' && (
                    <>
                      <div className="form-row">
                        <div className="field-group">
                          <label className="field-label" htmlFor={`investor-entityname-${idx}`}>Entity Legal Name</label>
                          <input
                            id={`investor-entityname-${idx}`}
                            className="field-input"
                            placeholder="e.g. Acme Holdings LLC"
                            {...form.register(`investors.${idx}.entityLegalName` as const)}
                          />
                        </div>
                        <div className="field-group">
                          <label className="field-label" htmlFor={`investor-formstate-${idx}`}>Formation State</label>
                          <input
                            id={`investor-formstate-${idx}`}
                            className="field-input"
                            placeholder="e.g. Delaware"
                            {...form.register(`investors.${idx}.formationState` as const)}
                          />
                        </div>
                      </div>
                      <div className="form-row">
                        <div className="field-group">
                          <label className="field-label" htmlFor={`investor-signername-${idx}`}>Authorised Signer Name</label>
                          <input
                            id={`investor-signername-${idx}`}
                            className="field-input"
                            placeholder="e.g. John Doe"
                            {...form.register(`investors.${idx}.signerName` as const)}
                          />
                        </div>
                        <div className="field-group">
                          <label className="field-label" htmlFor={`investor-signertitle-${idx}`}>Signer Title</label>
                          <input
                            id={`investor-signertitle-${idx}`}
                            className="field-input"
                            placeholder="e.g. Managing Member"
                            {...form.register(`investors.${idx}.signerTitle` as const)}
                          />
                        </div>
                      </div>
                    </>
                  )}

                  <hr className="form-divider" />

                  {/* Investment */}
                  <div className="form-section-title" style={{ fontSize: 15, marginBottom: 12 }}>Investment Details</div>
                  <div className="form-row">
                    <div className="field-group">
                      <label className="field-label" htmlFor={`investor-amount-${idx}`}>Subscription Amount ($)</label>
                      <FieldHelp text="The total dollar amount this investor is committing to the offering." />
                      <Controller
                        control={form.control}
                        name={`investors.${idx}.subscriptionAmount` as const}
                        render={({ field }) => (
                          <CurrencyInput
                            id={`investor-amount-${idx}`}
                            className="field-input"
                            placeholder="e.g. 100000"
                            value={field.value ?? 0}
                            onChange={(v) => field.onChange(v || null)}
                          />
                        )}
                      />
                    </div>
                    <div className="field-group">
                      <label className="field-label" htmlFor={`investor-units-${idx}`}>Class A Units</label>
                      <FieldHelp text="Number of Class A membership units being subscribed." />
                      <input
                        id={`investor-units-${idx}`}
                        type="number"
                        className="field-input"
                        placeholder="e.g. 1000"
                        min={0}
                        {...form.register(`investors.${idx}.classAUnits` as const, { valueAsNumber: true })}
                      />
                    </div>
                  </div>

                  <div className="field-group">
                    <label className="field-label" htmlFor={`investor-taxid-${idx}`}>Tax ID (EIN / SSN)</label>
                    <FieldHelp text="Required for Schedule K-1 tax reporting. Keep this confidential." />
                    <input
                      id={`investor-taxid-${idx}`}
                      className="field-input"
                      placeholder="e.g. 123-45-6789"
                      style={{ maxWidth: 220 }}
                      {...form.register(`investors.${idx}.taxId` as const)}
                    />
                  </div>

                  <div className="checkbox-row">
                    <input
                      type="checkbox"
                      id={`investor-accredited-${idx}`}
                      {...form.register(`investors.${idx}.accreditedInvestor` as const, {
                        onChange: (e) => {
                          if (!e.target.checked) {
                            form.setValue(`investors.${idx}.accreditedInvestorBasis` as const, null)
                          }
                        },
                      })}
                    />
                    <label className="checkbox-label" htmlFor={`investor-accredited-${idx}`}>
                      Investor has confirmed accredited status
                    </label>
                  </div>

                  {!isAccredited && (
                    <div
                      role="status"
                      aria-live="polite"
                      style={{
                        marginTop: 8,
                        padding: '8px 10px',
                        borderRadius: 8,
                        border: '1px solid rgba(180, 60, 60, 0.35)',
                        background: 'rgba(180, 60, 60, 0.08)',
                        color: '#7a1f1f',
                        fontSize: 13,
                        lineHeight: 1.4,
                        maxWidth: 620,
                      }}
                    >
                      <strong>Not accredited:</strong>{' '}
                      {offering.offeringExemption === '506(c)'
                        ? 'This investor cannot be saved under Rule 506(c) unless accredited status is confirmed and a basis is selected.'
                        : 'This investor is explicitly marked as non-accredited. Confirm your selected offering exemption allows non-accredited investors.'}
                    </div>
                  )}

                  {isAccredited && (
                    <div className="field-group" style={{ maxWidth: 420, marginTop: 8 }}>
                      <label className="field-label" htmlFor={`investor-accredited-basis-${idx}`}>
                        Accredited basis <span className="field-required">*</span>
                      </label>
                      <FieldHelp text="Capture the investor's representation basis for accreditation." />
                      <select
                        id={`investor-accredited-basis-${idx}`}
                        className="field-input"
                        {...form.register(`investors.${idx}.accreditedInvestorBasis` as const)}
                      >
                        <option value="">Select basis</option>
                        <option value="income">Income test</option>
                        <option value="net_worth">Net worth test</option>
                      </select>
                    </div>
                  )}

                  <hr className="form-divider" />

                  {/* Contact */}
                  <div className="form-section-title" style={{ fontSize: 15, marginBottom: 12 }}>Contact &amp; Address</div>
                  <div className="form-row">
                    <div className="field-group">
                      <label className="field-label" htmlFor={`investor-email-${idx}`}>Email Address</label>
                      <input
                        id={`investor-email-${idx}`}
                        type="email"
                        className="field-input"
                        placeholder="investor@example.com"
                        {...form.register(`investors.${idx}.email` as const)}
                      />
                    </div>
                    <div className="field-group">
                      <label className="field-label" htmlFor={`investor-phone-${idx}`}>Phone Number</label>
                      <input
                        id={`investor-phone-${idx}`}
                        type="tel"
                        className="field-input"
                        placeholder="(415) 555-0100"
                        {...form.register(`investors.${idx}.phone` as const)}
                      />
                    </div>
                  </div>

                  <div className="field-group">
                    <label className="field-label" htmlFor={`investor-address-${idx}`}>Street Address</label>
                    <AddressAutocompleteInput
                      id={`investor-address-${idx}`}
                      className="field-input"
                      placeholder="e.g. 123 Main Street"
                      value={form.watch(`investors.${idx}.streetAddress` as const) || ''}
                      onChange={(v) => form.setValue(`investors.${idx}.streetAddress` as const, v)}
                      onSelectAddress={(addr: ParsedAddress) => {
                        if (addr.streetAddress) form.setValue(`investors.${idx}.streetAddress` as const, addr.streetAddress)
                        if (addr.city) form.setValue(`investors.${idx}.city` as const, addr.city)
                        if (addr.state) form.setValue(`investors.${idx}.state` as const, addr.state)
                        if (addr.zip) form.setValue(`investors.${idx}.zip` as const, addr.zip)
                      }}
                    />
                  </div>

                  <div className="form-row-3">
                    <div className="field-group">
                      <label className="field-label" htmlFor={`investor-city-${idx}`}>City</label>
                      <input id={`investor-city-${idx}`} className="field-input" {...form.register(`investors.${idx}.city` as const)} />
                    </div>
                    <div className="field-group">
                      <label className="field-label" htmlFor={`investor-state-${idx}`}>State</label>
                      <input id={`investor-state-${idx}`} className="field-input" maxLength={2} {...form.register(`investors.${idx}.state` as const)} />
                      {blueSkyStateCode && (
                        <div
                          role="status"
                          aria-live="polite"
                          style={{
                            marginTop: 8,
                            padding: '8px 10px',
                            borderRadius: 8,
                            border: '1px solid rgba(180, 120, 20, 0.35)',
                            background: 'rgba(180, 120, 20, 0.08)',
                            color: '#7a5312',
                            fontSize: 12.5,
                            lineHeight: 1.35,
                          }}
                        >
                          <strong>Blue sky flag:</strong> Investor state entered as {stateDisplayLabel(investorState)}.
                          Review and file required state Form D notice filing for this jurisdiction.
                        </div>
                      )}
                    </div>
                    <div className="field-group">
                      <label className="field-label" htmlFor={`investor-zip-${idx}`}>ZIP</label>
                      <input id={`investor-zip-${idx}`} className="field-input" {...form.register(`investors.${idx}.zip` as const)} />
                    </div>
                  </div>

                </div>
              )}
            </div>
          )
        })}

        {/* Bottom save */}
        {fields.length > 0 && (
          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <button type="submit" className="btn btn-primary">
              Save all investors
            </button>
            <button type="button" onClick={onAdd} className="btn btn-secondary">
              + Add another investor
            </button>
          </div>
        )}
      </form>

      <HelpCard text="Need help with accreditation verification, subscription agreement terms, or investor onboarding? Our legal team is happy to assist." />
    </div>
  )
}
