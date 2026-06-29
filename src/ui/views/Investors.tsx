import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm, useFieldArray, Controller, useWatch } from 'react-hook-form'
import type { SubmitHandler } from 'react-hook-form'
import type { FieldErrors } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAppStore, Investor, canSendSubAgreements } from '../../state/store'
import { useInvestorActions, useSubscriptionActions } from '../../api/hooks/useDealMutations'
import { v4 as uuidv4 } from 'uuid'
import { generateSubscriptionAgreementHtml } from '../../utils/pdfTemplate'
import { generatePlaceholders } from '../../utils/placeholders'
import { FieldHelp, Tooltip, HelpCard } from '../components/HelpCard'
import { formatEin, formatSsn } from '../../utils/taxIdFormatting'
import { CurrencyInput } from '../components/CurrencyInput'
import ModuleProgress from '../components/ModuleProgress'
import { AddressAutocompleteInput, ParsedAddress } from '../components/AddressAutocompleteInput'
import StateSelect from '../components/StateSelect'
import { useEconomicsStore, isEconomicsLocked } from '../../state/economicsStore'
import { computeSourcesAndUses } from '../../utils/sourcesAndUses'

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
      .min(1, 'Email is required')
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

const createBlankFormInvestor = (
  id: string,
  defaults?: Partial<Pick<FormInvestor, 'state' | 'formationState'>>,
): FormInvestor => ({
  id,
  fullLegalName: '',
  subscriberType: 'individual',
  entityLegalName: '',
  formationState: defaults?.formationState ?? '',
  signerName: '',
  signerTitle: '',
  subscriptionAmount: 0,
  classAUnits: 0,
  streetAddress: '',
  city: '',
  state: defaults?.state ?? '',
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
  const { dealId }                  = useParams<{ dealId: string }>()
  const navigate                    = useNavigate()
  const data                        = useAppStore((s) => s.deals[dealId!]?.data.investors ?? [])
  const syncBlueSkyFilingsForStates = useAppStore((s) => s.syncBlueSkyFilingsForStates)
  const appData    = useAppStore((s) => s.deals[dealId!]?.data)
  const subscriptions = appData?.subscriptions ?? []
  const offering   = appData?.offering ?? {}
  const investorActions = useInvestorActions(dealId!)

  const economicsDeal = useEconomicsStore((s) => s.deals.find((d) => d.dealId === dealId))
  const econLocked    = isEconomicsLocked(economicsDeal)

  // LP equity target from Deal Economics capital stack
  const lpCapitalTarget = (() => {
    const stack = economicsDeal?.capitalStack
    if (!stack) return null
    const { sources } = computeSourcesAndUses(stack)
    const equity = Math.max(0, sources.equity)
    const lpPct  = Math.min(1, Math.max(0, stack.lpEquityPct ?? 1))
    return equity * lpPct
  })()

  const totalCommitted = data.reduce((sum, inv) => sum + (inv.subscriptionAmount || 0), 0)
  const remaining      = lpCapitalTarget != null ? Math.max(0, lpCapitalTarget - totalCommitted) : null
  const pctFunded      = lpCapitalTarget != null && lpCapitalTarget > 0
    ? Math.min(100, Math.round((totalCommitted / lpCapitalTarget) * 100))
    : null
  const subscriptionActions = useSubscriptionActions(dealId!)

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
  const [lastAddedInvestorId, setLastAddedInvestorId] = useState<string | null>(null)

  const notify = (msg: string, type: 'success' | 'error' = 'success') => {
    setNotification({ msg, type })
    window.scrollTo({ top: 0, behavior: 'smooth' })
    window.setTimeout(() => setNotification(null), 4000)
  }

  const scrollToFirstError = (errors: FieldErrors<FormValues>) => {
    const errs = errors.investors
    if (!errs) return

    // Find the lowest investor index that has errors
    const numericKeys = (Object.keys(errs) as string[])
      .filter((k) => !Number.isNaN(Number(k)))
      .sort((a, b) => Number(a) - Number(b))
    if (numericKeys.length === 0) return

    const idx = Number(numericKeys[0])
    const fieldErrs = (errs as Record<string, Record<string, unknown> | undefined>)[String(idx)]
    if (!fieldErrs) return

    // Expand the card so the fields become visible
    setExpanded((prev) => ({ ...prev, [idx]: true }))

    // Map field names → input IDs (must match the id= attributes in the JSX below)
    const fieldIdMap: Record<string, string> = {
      fullLegalName:           `investor-name-${idx}`,
      entityLegalName:         `investor-entityname-${idx}`,
      formationState:          `investor-formstate-${idx}`,
      signerName:              `investor-signername-${idx}`,
      signerTitle:             `investor-signertitle-${idx}`,
      subscriptionAmount:      `investor-amount-${idx}`,
      classAUnits:             `investor-units-${idx}`,
      email:                   `investor-email-${idx}`,
      streetAddress:           `investor-address-${idx}`,
      city:                    `investor-city-${idx}`,
      state:                   `investor-state-${idx}`,
      zip:                     `investor-zip-${idx}`,
      accreditedInvestorBasis: `investor-accredited-basis-${idx}`,
    }

    const firstField = Object.keys(fieldIdMap).find((f) => fieldErrs[f])
    const targetId   = firstField ? fieldIdMap[firstField] : undefined

    // Wait one tick for React to render the expanded card, then scroll + highlight
    window.setTimeout(() => {
      const el = targetId ? document.getElementById(targetId) : null
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el.classList.remove('field-input--highlight')
        el.classList.add('field-input--highlight')
        window.setTimeout(() => el.classList.remove('field-input--highlight'), 2500)
      }
    }, 100)
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
    const dealFormationState = appData.deal.formationState || ''
    const defaultState = normalizeStateCode(dealFormationState) || dealFormationState
    const blankForm = createBlankFormInvestor(id, {
      state: defaultState,
      formationState: defaultState,
    })
    append(blankForm)
    const newIdx = fields.length
    setExpanded((prev) => ({ ...prev, [newIdx]: true }))
    setLastAddedInvestorId(id)
  }

  const onRemove = async (idx: number, id: string) => {
    remove(idx)
    if (data.some((inv) => inv.id === id)) {
      try {
        await investorActions.remove(id)
        notify('Investor deleted successfully.')
      } catch {
        notify('Failed to remove investor. Please try again.', 'error')
      }
    }
    setExpanded((prev) => {
      const next = { ...prev }
      delete next[idx]
      return next
    })
  }

  const onSave: SubmitHandler<FormValues> = async (vals) => {
    const nonAccredited = vals.investors.filter((inv) => inv.accreditedInvestor !== true)
    const investorIndexById = new Map(vals.investors.map((inv, index) => [inv.id, index]))

    if (offering.offeringExemption === '506(c)') {
      const bad = vals.investors.filter(
        (inv) => inv.accreditedInvestor !== true || !inv.accreditedInvestorBasis,
      )
      if (bad.length > 0) {
        notify(
          'Under 506(c) all investors must be accredited and include whether they qualify by income or net worth.',
          'error',
        )
        const firstBadIdx = vals.investors.findIndex(
          (inv) => inv.accreditedInvestor !== true || !inv.accreditedInvestorBasis,
        )
        if (firstBadIdx >= 0) {
          setExpanded((prev) => ({ ...prev, [firstBadIdx]: true }))
          window.setTimeout(() => {
            const el = document.getElementById(`investor-accredited-${firstBadIdx}`)
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' })
              const row = el.closest('.checkbox-row') as HTMLElement | null
              if (row) {
                row.classList.remove('field-input--highlight')
                row.classList.add('field-input--highlight')
                window.setTimeout(() => row.classList.remove('field-input--highlight'), 2500)
              }
            }
          }, 100)
        }
        return
      }
    }

    try {
      for (const inv of vals.investors) {
        const payload: Partial<Investor> = {
          ...inv,
          derivedLastName:
            (inv as Investor).derivedLastName ??
            (inv.fullLegalName ? inv.fullLegalName.split(' ').slice(-1)[0] : ''),
        }

        if (data.some((existing) => existing.id === inv.id)) {
          await investorActions.update(inv.id, payload, payload as Record<string, unknown>)
        } else {
          await investorActions.create(payload as Investor)
        }
      }
    } catch {
      notify('Failed to save investors. Please try again.', 'error')
      return
    }

    if (nonAccredited.length > 0) {
      notify(
        `Investors saved with warning: ${nonAccredited.length} investor${nonAccredited.length === 1 ? '' : 's'} marked as not accredited. Confirm your exemption permits non-accredited investors.`,
        'error',
      )
      return
    }

    if (lastAddedInvestorId) {
      const addedIdx = investorIndexById.get(lastAddedInvestorId)
      if (addedIdx !== undefined) {
        setExpanded((prev) => ({ ...prev, [addedIdx]: false }))
      }
      setLastAddedInvestorId(null)
    }

    notify('Investors saved successfully.')
  }

  const onInvalid = (errors: FieldErrors<FormValues>) => {
    notify('Could not save investors. Please fix the required fields and try again.', 'error')
    scrollToFirstError(errors)
  }

  const previewSubscription = (invId: string) => {
    const dealData  = useAppStore.getState().deals[dealId!]?.data
    if (!dealData) return
    const appData   = dealData
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

  const canGenerateSub = appData ? canSendSubAgreements(appData) : false
  const investorIntakeComplete = data.length > 0
  const watchedInvestors = useWatch({ control: form.control, name: 'investors' }) || []
  const blueSkyStates = useMemo(() => {
    const byState = new Map<string, number>()
    watchedInvestors.forEach((inv) => {
      const code = normalizeStateCode(inv.state)
      if (!code) return
      byState.set(code, (byState.get(code) || 0) + 1)
    })
    return Array.from(byState.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [watchedInvestors])

  useEffect(() => {
    syncBlueSkyFilingsForStates(dealId!, blueSkyStates.map(([code]) => code))
  }, [blueSkyStates, syncBlueSkyFilingsForStates])

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

      {/* Securities compliance notice */}
      <div className="disclaimer-banner disclaimer-banner--warning">
        <span className="disclaimer-banner-icon">ℹ</span>
        <div className="disclaimer-banner-body">
          <strong>Securities Compliance Notice</strong>
          <p>
            EquityForm does not verify accredited investor status. As the GP, you are solely
            responsible for ensuring all investors qualify under your offering exemption (Reg D
            Rule 506(b) or 506(c)). Consult a securities attorney before accepting investor
            commitments. Non-compliance may result in SEC enforcement.
          </p>
        </div>
      </div>

      {/* LP Capital Target — sourced from locked Deal Economics */}
      <div className="capital-summary" style={{ marginBottom: 24 }}>
        <div className="capital-stat">
          <div className="capital-stat-value">
            {lpCapitalTarget != null
              ? `$${lpCapitalTarget.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
              : econLocked ? '—' : 'Not set'}
          </div>
          <div className="capital-stat-label">LP Capital Target</div>
        </div>
        <div className="capital-stat capital-stat--positive">
          <div className="capital-stat-value">
            ${totalCommitted.toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </div>
          <div className="capital-stat-label">Committed So Far</div>
        </div>
        <div className={`capital-stat${remaining != null && remaining > 0 ? ' capital-stat--warning' : ''}`}>
          <div className="capital-stat-value">
            {remaining != null
              ? `$${remaining.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
              : '—'}
          </div>
          <div className="capital-stat-label">Remaining to Fill</div>
        </div>
        <div className="capital-stat">
          <div className="capital-stat-value">
            {pctFunded != null ? `${pctFunded}%` : `${data.length} LP${data.length !== 1 ? 's' : ''}`}
          </div>
          <div className="capital-stat-label">{pctFunded != null ? 'Round Filled' : 'Investors Added'}</div>
        </div>
      </div>
      {!econLocked && (
        <div className="field-hint" style={{ marginBottom: 16, fontSize: 13 }}>
          LP Capital Target is calculated from Deal Economics (Section A). Lock Deal Economics to see the target.
        </div>
      )}

      {/* Notification */}
      {notification && (
        <div className={`notification notification--${notification.type}`} role="alert">
          {notification.type === 'success' ? '✓ ' : '⚠ '}{notification.msg}
        </div>
      )}

      {!investorIntakeComplete ? (
        <div className="state-banner state-banner--warning" style={{ marginBottom: 16 }}>
          <span>⚠</span> Investor Intake is not complete yet. Add and save at least one investor to continue.
        </div>
      ) : null}

      {/* Top actions */}
      <div className="investor-actions-bar">
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
                        onClick={async () => {
                          try {
                            await subscriptionActions.generate(f.id)
                            notify(`Subscription generated for ${name}.`)
                          } catch {
                            notify(`Failed to generate subscription for ${name}.`, 'error')
                          }
                        }}
                      >
                        Generate subscription
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={!canGenerateSub}
                        title={!canGenerateSub ? 'Operating Agreement must be GP-signed (Stage 3) before sending subscription agreements' : undefined}
                        onClick={async () => {
                          try {
                            await subscriptionActions.send(f.id)
                            notify(`Subscription sent for e-signature for ${name}.`)
                          } catch {
                            notify(`Failed to send subscription for ${name}.`, 'error')
                          }
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
                        onClick={async () => {
                          try {
                            await subscriptionActions.markSigned(f.id)
                            notify(`Marked as signed for ${name}.`)
                          } catch {
                            notify(`Failed to mark ${name} as signed.`, 'error')
                          }
                        }}
                      >
                        Mark signed
                      </button>
                      <button
                        type="button"
                        className="link-btn"
                        disabled={!subStatus || subStatus === 'pending'}
                        title={!subStatus || subStatus === 'pending' ? 'Generate or send a subscription before recording a wire.' : undefined}
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
                          onChange={(e) => setWireInput((prev) => ({ ...prev, [idx]: e.target.value.slice(0, 25) }))}
                          aria-label="Wire confirmation number"
                          maxLength={25}
                        />
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={async () => {
                            const conf = wireInput[idx]?.trim()
                            if (!conf) {
                              notify('Please enter a wire confirmation number.', 'error')
                              return
                            }
                            if (conf.length > 25) {
                              notify('Wire confirmation number must be 25 characters or fewer.', 'error')
                              return
                            }
                            try {
                              await subscriptionActions.recordWire(f.id, conf)
                              setShowWire((prev) => ({ ...prev, [idx]: false }))
                              setWireInput((prev) => ({ ...prev, [idx]: '' }))
                              notify(`Wire recorded for ${name}.`)
                            } catch (err) {
                              const msg = err instanceof Error ? err.message : 'Please try again.'
                              notify(`Failed to record wire for ${name}. ${msg}`, 'error')
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
                          <StateSelect
                            id={`investor-formstate-${idx}`}
                            value={form.watch(`investors.${idx}.formationState` as const) ?? ''}
                            onChange={(code) => form.setValue(`investors.${idx}.formationState` as const, code, { shouldDirty: true })}
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <label className="field-label" htmlFor={`investor-taxid-${idx}`} style={{ marginBottom: 0 }}>
                        {type === 'entity' ? 'Tax ID (EIN)' : 'Tax ID (SSN)'}
                      </label>
                      <Tooltip title={type === 'entity' ? 'Employer Identification Number (EIN)' : 'Social Security Number (SSN)'} content={type === 'entity' ? 'The 9-digit EIN assigned by the IRS to the investing entity (format: XX-XXXXXXX). Required for K-1 tax reporting and closing documents.' : 'The investor\'s 9-digit Social Security Number (format: XXX-XX-XXXX). Used for Schedule K-1 tax reporting at year-end.'} />
                    </div>
                    <FieldHelp text="Required for Schedule K-1 tax reporting. Keep this confidential." />
                    <input
                      id={`investor-taxid-${idx}`}
                      className="field-input"
                      placeholder={type === 'entity' ? 'e.g. 12-3456789' : 'e.g. 123-45-6789'}
                      style={{ maxWidth: 220 }}
                      maxLength={type === 'entity' ? 10 : 11}
                      {...form.register(`investors.${idx}.taxId` as const, {
                        onChange: (e) => {
                          const fmt = type === 'entity' ? formatEin : formatSsn
                          const formatted = fmt(e.target.value)
                          e.target.value = formatted
                          form.setValue(`investors.${idx}.taxId` as const, formatted, { shouldDirty: true })
                        },
                      })}
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <label className="field-label" htmlFor={`investor-accredited-basis-${idx}`} style={{ marginBottom: 0 }}>
                          Accredited basis <span className="field-required">*</span>
                        </label>
                        <Tooltip title="Accreditation Basis" content="Income test: individual income exceeding $200k (or $300k joint) in each of the two most recent years with a reasonable expectation of the same. Net worth test: net worth over $1 million, excluding primary residence. This must be self-certified by the investor in the subscription agreement." />
                      </div>
                      <FieldHelp text="Capture the investor's representation basis for accreditation." />
                      <select
                        id={`investor-accredited-basis-${idx}`}
                        className="field-input"
                        {...form.register(`investors.${idx}.accreditedInvestorBasis` as const)}
                      >
                        
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
                      <StateSelect
                        id={`investor-state-${idx}`}
                        value={form.watch(`investors.${idx}.state` as const) ?? ''}
                        onChange={(code) => form.setValue(`investors.${idx}.state` as const, code, { shouldDirty: true })}
                      />
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
          <div className="investor-actions-bar" style={{ marginTop: 8 }}>
            <button type="submit" className="btn btn-primary">
              Save all investors
            </button>
            <button type="button" onClick={onAdd} className="btn btn-secondary">
              + Add another investor
            </button>
          </div>
        )}
      </form>

      <div className="state-banner state-banner--warning" style={{ marginTop: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <span><span>⚠</span> Check your investor states for blue sky filing requirements before moving forward.</span>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => navigate('/compliance')}
        >
          Check Blue Sky Compliance →
        </button>
      </div>
    </div>
  )
}
