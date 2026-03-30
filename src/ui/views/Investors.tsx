import React, { useState } from 'react'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAppStore, Investor, canSendSubAgreements } from '../../state/store'
import { v4 as uuidv4 } from 'uuid'
import { generateSubscriptionAgreementText } from '../../utils/pdfTemplate'
import { generatePlaceholders } from '../../utils/placeholders'
import { FieldHelp, HelpCard } from '../components/HelpCard'
import CompletionBadge from '../components/CompletionBadge'
import { FormattedNumberInput } from '../components/FormattedNumberInput'

/* ─── Schema ────────────────────────────────────────────────────────────── */
const investorSchema = z.object({
  id:                z.string(),
  fullLegalName:     z.string().min(1, 'Full legal name is required'),
  subscriberType:    z.union([z.literal('individual'), z.literal('entity')]),
  entityLegalName:   z.string().optional(),
  subscriptionAmount:z.number().nullable().optional(),
  classAUnits:       z.number().nullable().optional(),
  streetAddress:     z.string().optional(),
  city:              z.string().optional(),
  state:             z.string().optional(),
  zip:               z.string().optional(),
  email:             z.string().optional(),
  phone:             z.string().optional(),
  taxId:             z.string().optional(),
  signerName:        z.string().optional(),
  signerTitle:       z.string().optional(),
  accreditedInvestor:z.boolean().nullable().optional(),
})

const schema = z.object({ investors: z.array(investorSchema) })

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
  const addInvestor                 = useAppStore((s) => s.addInvestor)
  const updateInvestor              = useAppStore((s) => s.updateInvestor)
  const removeInvestor              = useAppStore((s) => s.removeInvestor)
  const generateSubscriptionForInvestor = useAppStore((s) => s.generateSubscriptionForInvestor)
  const sendSubscriptionForSignature    = useAppStore((s) => s.sendSubscriptionForSignature)
  const markSubscriptionSigned          = useAppStore((s) => s.markSubscriptionSigned)
  const recordWirePayment               = useAppStore((s) => s.recordWirePayment)
  const appData    = useAppStore((s) => s.data)
  const subscriptions = appData.subscriptions
  const offering   = appData.offering

  const form = useForm({ resolver: zodResolver(schema), defaultValues: { investors: data }, mode: 'onBlur' })
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'investors' })

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

  const onAdd = () => {
    const id = uuidv4()
    const inv: Investor = { id, fullLegalName: '', subscriberType: 'individual' }
    addInvestor(inv)
    append(inv as z.infer<typeof investorSchema>)
    const newIdx = fields.length
    setExpanded((prev) => ({ ...prev, [newIdx]: true }))
  }

  const onRemove = (idx: number, id: string) => {
    remove(idx)
    removeInvestor(id)
    setExpanded((prev) => {
      const next = { ...prev }
      delete next[idx]
      return next
    })
  }

  const onSave = (vals: { investors: z.infer<typeof investorSchema>[] }) => {
    if (offering.offeringExemption === '506(c)') {
      const bad = vals.investors.filter((inv) => inv.accreditedInvestor !== true)
      if (bad.length > 0) {
        notify(
          'Under 506(c) all investors must be marked as accredited. Please review each investor.',
          'error',
        )
        return
      }
    }
    vals.investors.forEach((inv) => {
      updateInvestor(inv.id, {
        ...inv,
        derivedLastName:
          (inv as Investor).derivedLastName ??
          (inv.fullLegalName ? inv.fullLegalName.split(' ').slice(-1)[0] : ''),
      })
    })
    notify('Investors saved. Deal saved.')
  }

  const previewSubscription = (invId: string) => {
    const appData   = useAppStore.getState().data
    const ph        = generatePlaceholders(appData)
    const idx       = appData.investors.findIndex((i) => i.id === invId)
    const invPh     = (ph.values.INVESTORS && (ph.values.INVESTORS as unknown[])[idx]) ?? {}
    const text      = generateSubscriptionAgreementText(ph.values, invPh as Record<string, unknown>)
    const w = window.open('', '_blank')
    if (w) {
      w.document.write('<pre style="font-family:monospace;padding:24px;max-width:800px;margin:0 auto">' + text.replace(/</g, '&lt;') + '</pre>')
      w.document.title = 'Subscription Preview'
    } else {
      notify('Popup blocked — please allow popups for this site to preview the subscription agreement.', 'error')
    }
  }

  const canGenerateSub = canSendSubAgreements(appData)

  return (
    <div className="page-enter">
      {/* Page header */}
      <div className="page-header">
        <span className="page-header-eyebrow">Step 3 of 4</span>
        <h1>Who's investing in this round?</h1>
        <p className="page-header-subtitle">
          Add each LP's details below. Once the SPV is formed and the Operating Agreement is
          GP-signed, you can generate and send subscription agreements.
        </p>
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <CompletionBadge />
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

      {/* Top actions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <button type="button" onClick={onAdd} className="btn btn-primary">
          + Add investor
        </button>
        <button type="button" onClick={form.handleSubmit(onSave)} className="btn btn-secondary">
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
      <form onSubmit={form.handleSubmit(onSave)}>
        {fields.map((f, idx) => {
          const name   = form.watch(`investors.${idx}.fullLegalName` as const) || 'New investor'
          const type   = form.watch(`investors.${idx}.subscriberType` as const)
          const amount = form.watch(`investors.${idx}.subscriptionAmount` as const)
          const isExpanded = expanded[idx] ?? false
          const subStatus  = getSubStatus(f.id)

          return (
            <div key={f.id} className="investor-card">
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
                  {/* Identity */}
                  <div className="form-section-title" style={{ fontSize: 15, marginBottom: 12, marginTop: 4 }}>
                    Identity &amp; type
                  </div>
                  <div className="form-row">
                    <div className="field-group">
                      <label className="field-label" htmlFor={`investor-name-${idx}`}>
                        Full legal name <span className="field-required">*</span>
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
                      <label className="field-label" htmlFor={`investor-type-${idx}`}>Subscriber type</label>
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
                          <label className="field-label" htmlFor={`investor-entityname-${idx}`}>Entity legal name</label>
                          <input
                            id={`investor-entityname-${idx}`}
                            className="field-input"
                            placeholder="e.g. Acme Holdings LLC"
                            {...form.register(`investors.${idx}.entityLegalName` as const)}
                          />
                        </div>
                        <div className="field-group">
                          <label className="field-label" htmlFor={`investor-formstate-${idx}`}>Formation state</label>
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
                          <label className="field-label" htmlFor={`investor-signername-${idx}`}>Authorised signer name</label>
                          <input
                            id={`investor-signername-${idx}`}
                            className="field-input"
                            placeholder="e.g. John Doe"
                            {...form.register(`investors.${idx}.signerName` as const)}
                          />
                        </div>
                        <div className="field-group">
                          <label className="field-label" htmlFor={`investor-signertitle-${idx}`}>Signer title</label>
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
                  <div className="form-section-title" style={{ fontSize: 15, marginBottom: 12 }}>Investment details</div>
                  <div className="form-row">
                    <div className="field-group">
                      <label className="field-label" htmlFor={`investor-amount-${idx}`}>Subscription amount ($)</label>
                      <FieldHelp text="The total dollar amount this investor is committing to the offering." />
                      <Controller
                        control={form.control}
                        name={`investors.${idx}.subscriptionAmount` as const}
                        render={({ field }) => (
                          <FormattedNumberInput
                            id={`investor-amount-${idx}`}
                            className="field-input"
                            placeholder="e.g. 100000"
                            min={0}
                            onBlur={field.onBlur}
                            value={field.value ?? null}
                            onValueChange={field.onChange}
                          />
                        )}
                      />
                    </div>
                    <div className="field-group">
                      <label className="field-label" htmlFor={`investor-units-${idx}`}>Class A units</label>
                      <FieldHelp text="Number of Class A membership units being subscribed." />
                      <Controller
                        control={form.control}
                        name={`investors.${idx}.classAUnits` as const}
                        render={({ field }) => (
                          <FormattedNumberInput
                            id={`investor-units-${idx}`}
                            className="field-input"
                            placeholder="e.g. 1000"
                            min={0}
                            onBlur={field.onBlur}
                            value={field.value ?? null}
                            onValueChange={field.onChange}
                          />
                        )}
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
                      {...form.register(`investors.${idx}.accreditedInvestor` as const)}
                    />
                    <label className="checkbox-label" htmlFor={`investor-accredited-${idx}`}>
                      Investor has confirmed accredited status
                    </label>
                  </div>

                  <hr className="form-divider" />

                  {/* Contact */}
                  <div className="form-section-title" style={{ fontSize: 15, marginBottom: 12 }}>Contact &amp; address</div>
                  <div className="form-row">
                    <div className="field-group">
                      <label className="field-label" htmlFor={`investor-email-${idx}`}>Email address</label>
                      <input
                        id={`investor-email-${idx}`}
                        type="email"
                        className="field-input"
                        placeholder="investor@example.com"
                        {...form.register(`investors.${idx}.email` as const)}
                      />
                    </div>
                    <div className="field-group">
                      <label className="field-label" htmlFor={`investor-phone-${idx}`}>Phone number</label>
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
                    <label className="field-label" htmlFor={`investor-address-${idx}`}>Street address</label>
                    <input
                      id={`investor-address-${idx}`}
                      className="field-input"
                      placeholder="e.g. 123 Main Street"
                      {...form.register(`investors.${idx}.streetAddress` as const)}
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
                    </div>
                    <div className="field-group">
                      <label className="field-label" htmlFor={`investor-zip-${idx}`}>ZIP</label>
                      <input id={`investor-zip-${idx}`} className="field-input" {...form.register(`investors.${idx}.zip` as const)} />
                    </div>
                  </div>

                  {/* Subscription actions */}
                  <div className="investor-sub-actions">
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
                      Preview sub agreement
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        markSubscriptionSigned(f.id)
                        notify(`Marked as signed for ${name}.`)
                      }}
                    >
                      Mark signed
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setShowWire((prev) => ({ ...prev, [idx]: !prev[idx] }))}
                    >
                      Record wire
                    </button>
                  </div>

                  {/* Wire confirmation inline input */}
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
