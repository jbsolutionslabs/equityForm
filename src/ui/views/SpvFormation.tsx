import React, { useState } from 'react'
import { useAppStore, isSpvFormed } from '../../state/store'
import { HelpCard } from '../components/HelpCard'
import ModuleProgress from '../components/ModuleProgress'
import {
  provisionRegisteredAgent,
  fileCertOfFormation,
  fileForeignQualification,
  REGISTERED_AGENTS,
  STATE_REQUIREMENTS,
  type RegisteredAgentConfirmation,
  type CertOfFormationResult,
  type ForeignQualResult,
} from '../../api/legalFormation'

export const SpvFormation: React.FC = () => {
  const spvFormation = useAppStore((s) => s.data.spvFormation)
  const markSpvItem  = useAppStore((s) => s.markSpvItem)
  const setDeal      = useAppStore((s) => s.setDeal)
  const data         = useAppStore((s) => s.data)
  const formed       = isSpvFormed(data)
  const deal         = data.deal

  const propertyState = (deal.propertyState || '').toUpperCase()
  const stateInfo     = propertyState ? STATE_REQUIREMENTS[propertyState] : null

  // ── Notification ────────────────────────────────────────────────────────
  const [notification, setNotification] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const notify = (msg: string, type: 'success' | 'error' = 'success') => {
    setNotification({ msg, type })
    window.setTimeout(() => setNotification(null), 4000)
  }

  // ── Step done flags ──────────────────────────────────────────────────────
  const s1Done = !!spvFormation.entityName?.complete
  const s2Done = !!spvFormation.registeredAgent?.complete
  const s3Done = !!spvFormation.certOfFormation?.complete
  const s4Done = !!spvFormation.einObtained?.complete
  const s5Done = !!spvFormation.foreignQualification?.complete
  const completedCount = [s1Done, s2Done, s3Done, s4Done, s5Done].filter(Boolean).length

  // ── Step 1: Entity Name ─────────────────────────────────────────────────
  const [nameInput,     setNameInput]     = useState(spvFormation.entityName?.entityName || deal.entityName || '')
  const [nameConfirmed, setNameConfirmed] = useState(false)

  const handleLockName = () => {
    const name = nameInput.trim()
    if (!name) { notify('Enter an entity name.', 'error'); return }
    if (!nameConfirmed) { notify('Confirm you have checked availability on the Delaware website.', 'error'); return }
    markSpvItem('entityName', {
      complete:    true,
      completedAt: new Date().toISOString(),
      entityName:  name,
      nameLocked:  true,
    })
    setDeal({ entityName: name, formationState: 'DE' })
    notify('Entity name locked.')
  }

  const handleUnlockName = () => {
    markSpvItem('entityName', { complete: false, nameLocked: false })
    setNameConfirmed(false)
  }

  // ── Step 2: Registered Agent ────────────────────────────────────────────
  const [selectedAgent,    setSelectedAgent]    = useState<'northwest' | 'incorp' | 'ctcorp' | null>(
    (spvFormation.registeredAgent?.agentProvider as any) ?? null,
  )
  const [agentProvisioning, setAgentProvisioning] = useState(false)
  const [agentConfirmation, setAgentConfirmation] = useState<RegisteredAgentConfirmation | null>(null)

  const handleProvisionAgent = async () => {
    if (!selectedAgent) { notify('Select a registered agent to continue.', 'error'); return }
    setAgentProvisioning(true)
    try {
      const confirmation = await provisionRegisteredAgent(deal.entityName || '', selectedAgent)
      setAgentConfirmation(confirmation)
      const provider = REGISTERED_AGENTS.find((a) => a.id === selectedAgent)!
      markSpvItem('registeredAgent', {
        complete:              true,
        completedAt:           new Date().toISOString(),
        agentProvider:         selectedAgent,
        agentName:             provider.name,
        agentAddress:          provider.deAddress,
        agentConfirmationId:   confirmation.confirmationId,
        agentAnnualRenewalDate: confirmation.annualRenewalDate,
      })
      notify('Registered agent provisioned.')
    } catch {
      notify('Provisioning failed — please try again.', 'error')
    } finally {
      setAgentProvisioning(false)
    }
  }

  const handleUnprovisionAgent = () => {
    markSpvItem('registeredAgent', { complete: false, agentConfirmationId: undefined })
    setAgentConfirmation(null)
  }

  // ── Step 3: Certificate of Formation ───────────────────────────────────
  const [filingType, setFilingType] = useState<'standard' | 'same_day'>(
    (spvFormation.certOfFormation?.certFilingType) ?? 'standard',
  )
  const [certFiling, setCertFiling] = useState(false)
  const [certResult, setCertResult] = useState<CertOfFormationResult | null>(null)

  const handleFileCert = async () => {
    const agentName    = spvFormation.registeredAgent?.agentName || ''
    const agentAddress = spvFormation.registeredAgent?.agentAddress || ''
    if (!agentName) { notify('Registered agent is required.', 'error'); return }
    setCertFiling(true)
    try {
      const result = await fileCertOfFormation({
        entityName: deal.entityName || '',
        agentName,
        agentAddress,
        filingType,
      })
      setCertResult(result)
      markSpvItem('certOfFormation', {
        complete:               true,
        completedAt:            new Date().toISOString(),
        certFilingType:         filingType,
        certFilingFee:          result.fee,
        certificateNumber:      result.confirmationNumber,
        dateFiled:              result.submittedAt,
        certEstimatedCompletion: result.estimatedCompletionDate,
      })
      notify('Certificate of Formation submitted to Delaware.')
    } catch {
      notify('Filing failed — please try again.', 'error')
    } finally {
      setCertFiling(false)
    }
  }

  const handleUnfileCert = () => {
    markSpvItem('certOfFormation', { complete: false, certificateNumber: undefined })
    setCertResult(null)
  }

  // ── Step 4: EIN ─────────────────────────────────────────────────────────
  const [einInput, setEinInput] = useState(spvFormation.einObtained?.ein || deal.ein || '')

  const handleSaveEin = () => {
    const ein = einInput.trim()
    if (!ein) { notify('Enter your EIN to continue.', 'error'); return }
    if (!/^\d{2}-\d{7}$/.test(ein)) {
      notify('EIN format should be XX-XXXXXXX (e.g. 12-3456789).', 'error')
      return
    }
    markSpvItem('einObtained', { complete: true, completedAt: new Date().toISOString(), ein })
    setDeal({ ein })
    notify('EIN saved.')
  }

  const handleUnmarkEin = () => {
    markSpvItem('einObtained', { complete: false })
  }

  // ── Step 5: Foreign Qualification ──────────────────────────────────────
  const [fqFiling, setFqFiling] = useState(false)
  const [fqResult, setFqResult] = useState<ForeignQualResult | null>(null)

  const handleFileFQ = async () => {
    if (!stateInfo) { notify('Property state not set.', 'error'); return }
    setFqFiling(true)
    try {
      const result = await fileForeignQualification({
        entityName:   deal.entityName || '',
        stateCode:    stateInfo.stateCode,
        agentName:    spvFormation.registeredAgent?.agentName || '',
        agentAddress: spvFormation.registeredAgent?.agentAddress || '',
      })
      setFqResult(result)
      markSpvItem('foreignQualification', {
        complete:                     true,
        completedAt:                  new Date().toISOString(),
        foreignQualRequired:          true,
        foreignQualState:             stateInfo.stateCode,
        foreignQualStateName:         stateInfo.stateName,
        foreignQualFee:               stateInfo.filingFee,
        foreignQualTimeline:          stateInfo.estimatedDays,
        foreignQualConfirmationId:    result.confirmationId,
        foreignQualFilingMethod:      result.filingMethod,
        foreignQualEstimatedCompletion: result.estimatedCompletionDate,
      })
      notify(`Foreign Qualification filed in ${stateInfo.stateName}.`)
    } catch {
      notify('Filing failed — please try again.', 'error')
    } finally {
      setFqFiling(false)
    }
  }

  const handleFQNotRequired = () => {
    markSpvItem('foreignQualification', {
      complete:            true,
      completedAt:         new Date().toISOString(),
      foreignQualRequired: false,
      foreignQualState:    'DE',
      foreignQualStateName: 'Delaware',
    })
    notify('Foreign qualification not required — property and entity both in Delaware.')
  }

  const handleUnmarkFQ = () => {
    markSpvItem('foreignQualification', { complete: false, foreignQualConfirmationId: undefined })
    setFqResult(null)
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  const fmtDate = (iso?: string) =>
    iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

  return (
    <div className="page-enter">
      <div className="page-header">
        <ModuleProgress
          moduleLabel="Legal"
          step={2}
          totalSteps={7}
          stepTitle="SPV Formation"
          detail="Name · Agent · Certificate · EIN · Foreign Qualification"
        />
        <h1>SPV Formation</h1>
        <p className="page-header-subtitle">
          Complete all five formation steps for your Delaware LLC. Steps 1–3 are handled directly
          through EquityForm via our formation partner API. All confirmed data flows into your
          Operating Agreement, subscription agreements, and cap table automatically.
        </p>
      </div>

      {notification && (
        <div className={`notification notification--${notification.type}`} role="alert">
          {notification.type === 'success' ? '✓ ' : '⚠ '}{notification.msg}
        </div>
      )}

      {formed && (
        <div className="state-banner state-banner--success" style={{ marginBottom: 20 }}>
          <span>✓</span> All five formation steps complete — proceed to the Operating Agreement.
        </div>
      )}

      <div className="two-panel">
        <div className="two-panel-main">

          {/* ── Step 1: Entity Name ──────────────────────────────────────── */}
          <div className={`spv-item${s1Done ? ' spv-item--done' : ''}`}>
            <div className="spv-item-header">
              <div className={`spv-item-check${s1Done ? ' spv-item-check--done' : ''}`}>
                {s1Done ? '✓' : '1'}
              </div>
              <div className="spv-item-info">
                <div className="spv-item-title">Name the Entity</div>
                <div className="spv-item-subtitle">
                  {s1Done
                    ? `${spvFormation.entityName?.entityName} · Confirmed available and locked`
                    : 'Verify availability on the Delaware Division of Corporations website, then lock your name'}
                </div>
              </div>
              {s1Done && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={handleUnlockName}>
                  Undo
                </button>
              )}
            </div>

            {!s1Done && (
              <div className="spv-item-form">
                {/* Source badge */}
                <div className="spv-review-source">
                  Pre-filled from Deal Setup — review and approve to continue
                </div>

                {/* Review block: editable name */}
                <div className="spv-review-block" style={{ marginTop: 12 }}>
                  <div className="spv-review-block-label">Entity Name</div>
                  <input
                    id="entity-name-input"
                    className="field-input"
                    placeholder="e.g. Oakwood Capital LLC"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    style={{ marginTop: 4, maxWidth: 420 }}
                  />
                  <div className="field-hint" style={{ marginTop: 4 }}>
                    All Delaware LLCs must include "LLC" or "L.L.C." in the name
                  </div>
                </div>

                <div className="spv-review-block" style={{ marginTop: 10 }}>
                  <div className="spv-review-block-label">Formation State</div>
                  <div className="spv-review-block-value">Delaware (fixed)</div>
                </div>

                {/* DE name search instruction */}
                <div style={{
                  marginTop: 16,
                  padding: '12px 14px',
                  background: 'var(--color-slate-50)',
                  border: '1px solid var(--color-slate-200)',
                  borderRadius: 8,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--color-navy-900)' }}>
                    Confirm name availability before approving
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--color-slate-600)', margin: '0 0 10px' }}>
                    Delaware requires a unique entity name. Search the official state database to
                    confirm your name is available, then check the box below.
                  </p>
                  <a
                    href="https://icis.corp.delaware.gov/Ecorp/EntitySearch/NameSearch.aspx"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary btn-sm"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    Search Delaware Entity Names ↗
                  </a>
                </div>

                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 14, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={nameConfirmed}
                    onChange={(e) => setNameConfirmed(e.target.checked)}
                    style={{ marginTop: 2, flexShrink: 0 }}
                  />
                  <span style={{ fontSize: 13, color: 'var(--color-slate-700)', lineHeight: 1.5 }}>
                    I have confirmed this name is available in the Delaware Division of Corporations database
                  </span>
                </label>

                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  style={{ marginTop: 16 }}
                  disabled={!nameInput.trim() || !nameConfirmed}
                  onClick={handleLockName}
                >
                  Approve Entity Name &amp; Continue
                </button>
              </div>
            )}
          </div>

          {/* ── Step 2: Registered Agent ─────────────────────────────────── */}
          <div className={`spv-item${s2Done ? ' spv-item--done' : ''}${!s1Done ? ' spv-item--locked' : ''}`}>
            <div className="spv-item-header">
              <div className={`spv-item-check${s2Done ? ' spv-item-check--done' : ''}`}>
                {s2Done ? '✓' : '2'}
              </div>
              <div className="spv-item-info">
                <div className="spv-item-title">Appoint Registered Agent</div>
                <div className="spv-item-subtitle">
                  {s2Done
                    ? `${spvFormation.registeredAgent?.agentName} · ${spvFormation.registeredAgent?.agentAddress}`
                    : 'Select and provision a Delaware registered agent via API'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {s2Done ? (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={handleUnprovisionAgent}>
                    Undo
                  </button>
                ) : !s1Done ? (
                  <span className="gate-badge">Complete Step 1 first</span>
                ) : null}
              </div>
            </div>

            {s2Done && spvFormation.registeredAgent?.agentConfirmationId && (
              <div className="spv-item-form" style={{ background: 'var(--color-white)' }}>
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--color-slate-500)' }}>Confirmation ID</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                      {spvFormation.registeredAgent.agentConfirmationId}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--color-slate-500)' }}>Annual Renewal</div>
                    <div style={{ fontSize: 13 }}>
                      {fmtDate(spvFormation.registeredAgent.agentAnnualRenewalDate)}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {!s2Done && s1Done && (
              <div className="spv-item-form">
                <p style={{ fontSize: 14, color: 'var(--color-slate-600)', marginTop: 0, marginBottom: 14 }}>
                  Your registered agent's name and Delaware address appear on the Certificate of Formation
                  and must be appointed before filing.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                  {REGISTERED_AGENTS.map((agent) => (
                    <label
                      key={agent.id}
                      className={`agent-card${selectedAgent === agent.id ? ' agent-card--selected' : ''}`}
                    >
                      <input
                        type="radio"
                        name="registered-agent"
                        value={agent.id}
                        checked={selectedAgent === agent.id}
                        onChange={() => setSelectedAgent(agent.id)}
                        style={{ display: 'none' }}
                      />
                      <div className="agent-card-logo" style={{ background: agent.accentColor }}>
                        {agent.logoInitials}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-navy-900)' }}>
                          {agent.name}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--color-slate-500)', marginTop: 2 }}>
                          {agent.tagline}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--color-slate-400)', marginTop: 2 }}>
                          {agent.deAddress}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--color-navy-900)' }}>
                          ${agent.annualFee}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--color-slate-500)' }}>/year</div>
                      </div>
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={!selectedAgent || agentProvisioning}
                  onClick={handleProvisionAgent}
                >
                  {agentProvisioning
                    ? `Provisioning via ${REGISTERED_AGENTS.find((a) => a.id === selectedAgent)?.name ?? 'API'}…`
                    : 'Provision Agent via API'}
                </button>
              </div>
            )}
          </div>

          {/* ── Step 3: Certificate of Formation ─────────────────────────── */}
          <div className={`spv-item${s3Done ? ' spv-item--done' : ''}${!s2Done ? ' spv-item--locked' : ''}`}>
            <div className="spv-item-header">
              <div className={`spv-item-check${s3Done ? ' spv-item-check--done' : ''}`}>
                {s3Done ? '✓' : '3'}
              </div>
              <div className="spv-item-info">
                <div className="spv-item-title">File Certificate of Formation</div>
                <div className="spv-item-subtitle">
                  {s3Done
                    ? `Submitted · Confirmation #${spvFormation.certOfFormation?.certificateNumber} · Est. ${fmtDate(spvFormation.certOfFormation?.certEstimatedCompletion)}`
                    : 'Auto-populated and submitted to Delaware Division of Corporations'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {s3Done ? (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={handleUnfileCert}>
                    Undo
                  </button>
                ) : !s2Done ? (
                  <span className="gate-badge">Complete Step 2 first</span>
                ) : null}
              </div>
            </div>

            {!s3Done && s2Done && (
              <div className="spv-item-form">
                <div className="spv-review-source" style={{ marginBottom: 12 }}>
                  Auto-populated from Steps 1 &amp; 2 — review before submitting
                </div>
                <div className="cert-preview">
                  <div className="cert-preview-title">Certificate of Formation — Delaware LLC</div>
                  <div className="cert-preview-row">
                    <span className="cert-preview-label">Entity Name</span>
                    <span className="cert-preview-value">{deal.entityName || '—'}</span>
                  </div>
                  <div className="cert-preview-row">
                    <span className="cert-preview-label">Formation State</span>
                    <span className="cert-preview-value">Delaware</span>
                  </div>
                  <div className="cert-preview-row">
                    <span className="cert-preview-label">Registered Agent</span>
                    <span className="cert-preview-value">
                      {spvFormation.registeredAgent?.agentName || '—'}
                    </span>
                  </div>
                  <div className="cert-preview-row">
                    <span className="cert-preview-label">Agent Address</span>
                    <span className="cert-preview-value">
                      {spvFormation.registeredAgent?.agentAddress || '—'}
                    </span>
                  </div>
                </div>

                <div style={{ marginTop: 16 }}>
                  <div className="field-label" style={{ marginBottom: 8 }}>Filing Speed</div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {([
                      { value: 'standard' as const, label: 'Standard', fee: '$90', time: '3–5 business days' },
                      { value: 'same_day' as const, label: 'Same-Day', fee: '$500', time: 'Returned same business day' },
                    ] as const).map(({ value, label, fee, time }) => (
                      <label
                        key={value}
                        className={`filing-option${filingType === value ? ' filing-option--selected' : ''}`}
                      >
                        <input
                          type="radio"
                          name="filing-type"
                          value={value}
                          checked={filingType === value}
                          onChange={() => setFilingType(value)}
                          style={{ display: 'none' }}
                        />
                        <div className="filing-option-label">{label}</div>
                        <div className="filing-option-fee">{fee}</div>
                        <div className="filing-option-time">{time}</div>
                      </label>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  style={{ marginTop: 16 }}
                  disabled={certFiling}
                  onClick={handleFileCert}
                >
                  {certFiling ? 'Submitting to Delaware…' : 'Submit Filing to Delaware'}
                </button>
              </div>
            )}

            {s3Done && (
              <div className="spv-item-form" style={{ background: 'var(--color-white)' }}>
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--color-slate-500)' }}>Confirmation #</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                      {spvFormation.certOfFormation?.certificateNumber}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--color-slate-500)' }}>Filing Speed</div>
                    <div style={{ fontSize: 13 }}>
                      {spvFormation.certOfFormation?.certFilingType === 'same_day' ? 'Same-Day' : 'Standard'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--color-slate-500)' }}>Filing Fee</div>
                    <div style={{ fontSize: 13 }}>${spvFormation.certOfFormation?.certFilingFee}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--color-slate-500)' }}>Est. Completion</div>
                    <div style={{ fontSize: 13 }}>
                      {fmtDate(spvFormation.certOfFormation?.certEstimatedCompletion)}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Step 4: EIN ──────────────────────────────────────────────── */}
          <div className={`spv-item${s4Done ? ' spv-item--done' : ''}${!s3Done ? ' spv-item--locked' : ''}`}>
            <div className="spv-item-header">
              <div className={`spv-item-check${s4Done ? ' spv-item-check--done' : ''}`}>
                {s4Done ? '✓' : '4'}
              </div>
              <div className="spv-item-info">
                <div className="spv-item-title">Obtain EIN</div>
                <div className="spv-item-subtitle">
                  {s4Done
                    ? `EIN: ${spvFormation.einObtained?.ein}`
                    : 'Apply for federal tax ID at IRS.gov — instant during business hours'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {s4Done ? (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={handleUnmarkEin}>
                    Undo
                  </button>
                ) : !s3Done ? (
                  <span className="gate-badge">Complete Step 3 first</span>
                ) : null}
              </div>
            </div>

            {!s4Done && s3Done && (
              <div className="spv-item-form">
                {einInput ? (
                  /* EIN is pre-filled from Deal Setup — review and confirm */
                  <>
                    <div className="spv-review-source">
                      Pre-filled from Deal Setup — review and approve to continue
                    </div>
                    <div className="spv-review-block" style={{ marginTop: 12 }}>
                      <div className="spv-review-block-label">Employer Identification Number (EIN)</div>
                      <input
                        id="ein-input"
                        className="field-input"
                        placeholder="e.g. 12-3456789"
                        value={einInput}
                        onChange={(e) => setEinInput(e.target.value)}
                        style={{ marginTop: 4, maxWidth: 280 }}
                      />
                      <div className="field-hint" style={{ marginTop: 4 }}>Format: XX-XXXXXXX</div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      style={{ marginTop: 16 }}
                      onClick={handleSaveEin}
                    >
                      Approve EIN &amp; Continue
                    </button>
                  </>
                ) : (
                  /* EIN not yet entered — guide GP to IRS */
                  <>
                    <div className="ein-instruction-card">
                      <div className="ein-instruction-title">How to Apply (5 minutes)</div>
                      <ol className="ein-step-list">
                        <li>Click the link below to open the IRS EIN online application</li>
                        <li>Select <strong>Limited Liability Company</strong> as entity type</li>
                        <li>Select <strong>Started a new business</strong> as the reason</li>
                        <li>
                          Enter entity name:{' '}
                          <strong>{deal.entityName || '(your entity name)'}</strong>
                        </li>
                        <li>
                          Enter responsible party (GP):{' '}
                          <strong>{deal.gpSignerName || deal.gpEntityName || '(your name)'}</strong>
                        </li>
                        <li>
                          Complete and submit — your EIN will be issued <strong>instantly</strong>
                        </li>
                      </ol>
                      <a
                        href="https://www.irs.gov/businesses/small-businesses-self-employed/apply-for-an-employer-identification-number-ein-online"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-secondary btn-sm"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8 }}
                      >
                        Open IRS EIN Application ↗
                      </a>
                      <div style={{ marginTop: 10, fontSize: 12, color: 'var(--color-slate-500)' }}>
                        Alternative: your registered agent partner can obtain the EIN on your behalf
                        for an additional service fee.
                      </div>
                    </div>
                    <div className="field-group" style={{ maxWidth: 280, marginTop: 16 }}>
                      <label className="field-label" htmlFor="ein-input">Enter EIN when received</label>
                      <input
                        id="ein-input"
                        className="field-input"
                        placeholder="e.g. 12-3456789"
                        value={einInput}
                        onChange={(e) => setEinInput(e.target.value)}
                      />
                      <div className="field-hint">Format: XX-XXXXXXX</div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      style={{ marginTop: 12 }}
                      onClick={handleSaveEin}
                    >
                      Approve EIN &amp; Continue
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* ── Step 5: Foreign Qualification ────────────────────────────── */}
          <div className={`spv-item${s5Done ? ' spv-item--done' : ''}${!s4Done ? ' spv-item--locked' : ''}`}>
            <div className="spv-item-header">
              <div className={`spv-item-check${s5Done ? ' spv-item-check--done' : ''}`}>
                {s5Done ? '✓' : '5'}
              </div>
              <div className="spv-item-info">
                <div className="spv-item-title">File Foreign Qualification</div>
                <div className="spv-item-subtitle">
                  {s5Done
                    ? spvFormation.foreignQualification?.foreignQualRequired === false
                      ? 'Not required — property and entity both in Delaware'
                      : `Filed in ${spvFormation.foreignQualification?.foreignQualStateName} · #${spvFormation.foreignQualification?.foreignQualConfirmationId}`
                    : 'Register the DE LLC in the property\'s state'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {s5Done ? (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={handleUnmarkFQ}>
                    Undo
                  </button>
                ) : !s4Done ? (
                  <span className="gate-badge">Complete Step 4 first</span>
                ) : null}
              </div>
            </div>

            {!s5Done && s4Done && (
              <div className="spv-item-form">
                {!propertyState ? (
                  <div className="state-banner state-banner--warning">
                    <span>⚠</span>
                    Set the property state in Deal Setup first to determine if foreign qualification
                    is required.
                  </div>
                ) : stateInfo?.stateCode === 'DE' ? (
                  <div>
                    <div className="spv-review-source" style={{ marginBottom: 12 }}>
                      Auto-detected from Deal Setup — property state is <strong>Delaware</strong>
                    </div>
                    <div className="fq-state-info fq-state-info--not-required">
                      <div style={{ fontWeight: 600, fontSize: 15 }}>Not Required</div>
                      <div style={{ fontSize: 13, color: 'var(--color-slate-600)', marginTop: 4 }}>
                        Property state is Delaware — same as formation state. No foreign qualification
                        needed.
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      style={{ marginTop: 12 }}
                      onClick={handleFQNotRequired}
                    >
                      Confirm &amp; Complete Formation
                    </button>
                  </div>
                ) : stateInfo ? (
                  <div>
                    <div className="spv-review-source" style={{ marginBottom: 12 }}>
                      Auto-detected from Deal Setup — property state is <strong>{stateInfo.stateName}</strong>
                    </div>
                    <div className="fq-state-info">
                      <div
                        style={{
                          display:        'flex',
                          justifyContent: 'space-between',
                          alignItems:     'flex-start',
                          flexWrap:       'wrap',
                          gap:            12,
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 15 }}>
                            {stateInfo.stateName} Foreign Qualification
                          </div>
                          <div style={{ fontSize: 13, color: 'var(--color-slate-600)', marginTop: 4 }}>
                            {stateInfo.apiSupported
                              ? 'Filed electronically via registered agent API'
                              : 'Filed manually by registered agent on your behalf'}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 20, flexShrink: 0 }}>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontWeight: 700, fontSize: 18 }}>
                              ${stateInfo.filingFee}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--color-slate-500)' }}>
                              Filing fee
                            </div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontWeight: 700, fontSize: 18 }}>
                              {stateInfo.estimatedDays}d
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--color-slate-500)' }}>
                              Est. timeline
                            </div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div
                              style={{
                                fontWeight: 700,
                                fontSize:   18,
                                color:      stateInfo.apiSupported
                                  ? 'var(--color-success)'
                                  : 'var(--color-warning)',
                              }}
                            >
                              {stateInfo.apiSupported ? '⚡' : '✍'}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--color-slate-500)' }}>
                              {stateInfo.apiSupported ? 'e-filed' : 'manual'}
                            </div>
                          </div>
                        </div>
                      </div>
                      {stateInfo.notes && (
                        <div className="info-box" style={{ marginTop: 12 }}>
                          <div className="info-box-title">State Note</div>
                          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-slate-600)' }}>
                            {stateInfo.notes}
                          </p>
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      style={{ marginTop: 12 }}
                      disabled={fqFiling}
                      onClick={handleFileFQ}
                    >
                      {fqFiling
                        ? 'Submitting Filing…'
                        : `Submit ${stateInfo.stateName} Foreign Qualification`}
                    </button>
                  </div>
                ) : (
                  <div className="state-banner state-banner--warning">
                    <span>⚠</span> State code "{propertyState}" not recognized. Update the property
                    state in Deal Setup.
                  </div>
                )}
              </div>
            )}

            {s5Done && spvFormation.foreignQualification?.foreignQualRequired && (
              <div className="spv-item-form" style={{ background: 'var(--color-white)' }}>
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--color-slate-500)' }}>Confirmation #</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                      {spvFormation.foreignQualification.foreignQualConfirmationId}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--color-slate-500)' }}>Filing Method</div>
                    <div style={{ fontSize: 13 }}>
                      {spvFormation.foreignQualification.foreignQualFilingMethod === 'api'
                        ? 'Electronic (API)'
                        : 'Manual (agent)'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--color-slate-500)' }}>Est. Completion</div>
                    <div style={{ fontSize: 13 }}>
                      {fmtDate(spvFormation.foreignQualification.foreignQualEstimatedCompletion)}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Progress footer ──────────────────────────────────────────── */}
          <div className="spv-progress-footer">
            {completedCount} of 5 steps complete
            {!formed && (
              <span className="gate-message" style={{ marginLeft: 12 }}>
                Complete all 5 to unlock the Operating Agreement
              </span>
            )}
          </div>
        </div>

        {/* ── Right panel ──────────────────────────────────────────────────── */}
        <div className="two-panel-aside">
          <div className="card">
            <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 16 }}>Formation Timeline</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { n: '1', title: 'Entity Name',             time: 'Instant — live DE database check' },
                { n: '2', title: 'Registered Agent',        time: 'Instant — provisioned via partner API' },
                { n: '3', title: 'Cert. of Formation',      time: '1 day (same-day) or 3–5 days (standard)' },
                { n: '4', title: 'EIN',                     time: 'Instant — online at IRS.gov' },
                { n: '5', title: 'Foreign Qualification',   time: 'Varies by state — auto-detected' },
              ].map(({ n, title, time }) => (
                <div key={n} className="info-tile">
                  <div className="info-tile-icon">{n}</div>
                  <div>
                    <div className="info-tile-title">{title}</div>
                    <div className="info-tile-desc">{time}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <h3 style={{ marginTop: 0, marginBottom: 8, fontSize: 16 }}>All Steps Flow Downstream</h3>
            <p style={{ fontSize: 14, color: 'var(--color-slate-600)', margin: 0 }}>
              Confirmed entity name, registered agent, EIN, and filing dates auto-populate into the
              Operating Agreement, subscription agreements, and cap table — no re-entry needed.
            </p>
          </div>
        </div>
      </div>

      <HelpCard text="Questions about formation, registered agents, or EIN procurement? Our team can connect you with our registered agent partners." />
    </div>
  )
}
