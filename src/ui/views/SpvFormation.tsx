import React, { useState } from 'react'
import { useAppStore, isSpvFormed } from '../../state/store'
import { HelpCard } from '../components/HelpCard'

type ItemKey = 'llcFiled' | 'einObtained' | 'registeredAgent'

type ItemState = {
  open: boolean
  // LLC fields
  certificateNumber: string
  dateFiled: string
  // EIN fields
  ein: string
  // Agent fields
  agentName: string
  agentAddress: string
}

const defaultItemState = (): ItemState => ({
  open: false,
  certificateNumber: '',
  dateFiled: '',
  ein: '',
  agentName: '',
  agentAddress: '',
})

export const SpvFormation: React.FC = () => {
  const spvFormation = useAppStore((s) => s.data.spvFormation)
  const markSpvItem  = useAppStore((s) => s.markSpvItem)
  const data         = useAppStore((s) => s.data)
  const formed       = isSpvFormed(data)

  const [items, setItems] = useState<Record<ItemKey, ItemState>>({
    llcFiled:        { ...defaultItemState(), certificateNumber: spvFormation.llcFiled.certificateNumber || '', dateFiled: spvFormation.llcFiled.dateFiled || '' },
    einObtained:     { ...defaultItemState(), ein: spvFormation.einObtained.ein || '' },
    registeredAgent: { ...defaultItemState(), agentName: spvFormation.registeredAgent.agentName || '', agentAddress: spvFormation.registeredAgent.agentAddress || '' },
  })

  const [notification, setNotification] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  const notify = (msg: string, type: 'success' | 'error' = 'success') => {
    setNotification({ msg, type })
    window.setTimeout(() => setNotification(null), 4000)
  }

  const toggleOpen = (key: ItemKey) =>
    setItems((prev) => ({ ...prev, [key]: { ...prev[key], open: !prev[key].open } }))

  const setField = (key: ItemKey, field: keyof ItemState, value: string) =>
    setItems((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }))

  const markComplete = (key: ItemKey) => {
    const s = items[key]
    const now = new Date().toISOString()

    if (key === 'llcFiled') {
      if (!s.certificateNumber || !s.dateFiled) {
        notify('Please enter the certificate number and filing date.', 'error')
        return
      }
      markSpvItem('llcFiled', {
        complete: true,
        completedAt: now,
        certificateNumber: s.certificateNumber,
        dateFiled: s.dateFiled,
      })
    } else if (key === 'einObtained') {
      if (!s.ein) {
        notify('Please enter the EIN.', 'error')
        return
      }
      markSpvItem('einObtained', { complete: true, completedAt: now, ein: s.ein })
    } else {
      if (!s.agentName || !s.agentAddress) {
        notify('Please enter both the agent name and address.', 'error')
        return
      }
      markSpvItem('registeredAgent', { complete: true, completedAt: now, agentName: s.agentName, agentAddress: s.agentAddress })
    }

    setItems((prev) => ({ ...prev, [key]: { ...prev[key], open: false } }))
    notify('Item marked complete.')
  }

  const unmark = (key: ItemKey) => {
    markSpvItem(key, { complete: false, completedAt: undefined })
    notify('Item unmarked.')
  }

  return (
    <div className="page-enter">
      <div className="page-header">
        <span className="page-header-eyebrow">Stage 2 of 7</span>
        <h1>SPV Formation</h1>
        <p className="page-header-subtitle">
          Complete all three formation tasks before generating your Operating Agreement.
          You can continue working on other steps while waiting on government processing.
        </p>
      </div>

      {notification && (
        <div className={`notification notification--${notification.type}`} role="alert">
          {notification.type === 'success' ? '✓ ' : '⚠ '}{notification.msg}
        </div>
      )}

      {formed && (
        <div className="state-banner state-banner--success" style={{ marginBottom: 20 }}>
          <span>✓</span> All three formation tasks complete. Your SPV is fully formed — you can now generate the Operating Agreement.
        </div>
      )}

      <div className="two-panel">
        {/* ── Left: Checklist ── */}
        <div className="two-panel-main">
          {/* Item 1: LLC Filing */}
          <div className={`spv-item${spvFormation.llcFiled.complete ? ' spv-item--done' : ''}`}>
            <div className="spv-item-header">
              <div className="spv-item-check" aria-hidden="true">
                {spvFormation.llcFiled.complete ? '✓' : '1'}
              </div>
              <div className="spv-item-info">
                <div className="spv-item-title">LLC Filing</div>
                <div className="spv-item-subtitle">
                  {spvFormation.llcFiled.complete
                    ? `Certificate #${spvFormation.llcFiled.certificateNumber} · Filed ${spvFormation.llcFiled.dateFiled}`
                    : 'File Articles of Organization with the Secretary of State'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {spvFormation.llcFiled.complete ? (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => unmark('llcFiled')}>
                    Undo
                  </button>
                ) : (
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => toggleOpen('llcFiled')}>
                    {items.llcFiled.open ? 'Cancel' : 'Mark Complete'}
                  </button>
                )}
              </div>
            </div>

            {items.llcFiled.open && !spvFormation.llcFiled.complete && (
              <div className="spv-item-form">
                <div className="form-row">
                  <div className="field-group">
                    <label className="field-label" htmlFor="llc-cert">Certificate / filing number</label>
                    <input
                      id="llc-cert"
                      className="field-input"
                      placeholder="e.g. DE-7891234"
                      value={items.llcFiled.certificateNumber}
                      onChange={(e) => setField('llcFiled', 'certificateNumber', e.target.value)}
                    />
                  </div>
                  <div className="field-group">
                    <label className="field-label" htmlFor="llc-date">Date filed</label>
                    <input
                      id="llc-date"
                      type="date"
                      className="field-input"
                      value={items.llcFiled.dateFiled}
                      onChange={(e) => setField('llcFiled', 'dateFiled', e.target.value)}
                    />
                  </div>
                </div>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => markComplete('llcFiled')}>
                  Save &amp; Mark Complete
                </button>
              </div>
            )}
          </div>

          {/* Item 2: EIN */}
          <div className={`spv-item${spvFormation.einObtained.complete ? ' spv-item--done' : ''}`}>
            <div className="spv-item-header">
              <div className="spv-item-check" aria-hidden="true">
                {spvFormation.einObtained.complete ? '✓' : '2'}
              </div>
              <div className="spv-item-info">
                <div className="spv-item-title">EIN Obtained</div>
                <div className="spv-item-subtitle">
                  {spvFormation.einObtained.complete
                    ? `EIN: ${spvFormation.einObtained.ein}`
                    : 'Apply for an Employer Identification Number from the IRS'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {spvFormation.einObtained.complete ? (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => unmark('einObtained')}>
                    Undo
                  </button>
                ) : (
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => toggleOpen('einObtained')}>
                    {items.einObtained.open ? 'Cancel' : 'Mark Complete'}
                  </button>
                )}
              </div>
            </div>

            {items.einObtained.open && !spvFormation.einObtained.complete && (
              <div className="spv-item-form">
                <div className="field-group" style={{ maxWidth: 280 }}>
                  <label className="field-label" htmlFor="ein-number">EIN</label>
                  <input
                    id="ein-number"
                    className="field-input"
                    placeholder="e.g. 12-3456789"
                    value={items.einObtained.ein}
                    onChange={(e) => setField('einObtained', 'ein', e.target.value)}
                  />
                </div>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => markComplete('einObtained')}>
                  Save &amp; Mark Complete
                </button>
              </div>
            )}
          </div>

          {/* Item 3: Registered Agent */}
          <div className={`spv-item${spvFormation.registeredAgent.complete ? ' spv-item--done' : ''}`}>
            <div className="spv-item-header">
              <div className="spv-item-check" aria-hidden="true">
                {spvFormation.registeredAgent.complete ? '✓' : '3'}
              </div>
              <div className="spv-item-info">
                <div className="spv-item-title">Registered Agent</div>
                <div className="spv-item-subtitle">
                  {spvFormation.registeredAgent.complete
                    ? `${spvFormation.registeredAgent.agentName} · ${spvFormation.registeredAgent.agentAddress}`
                    : 'Assign a registered agent in your formation state'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {spvFormation.registeredAgent.complete ? (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => unmark('registeredAgent')}>
                    Undo
                  </button>
                ) : (
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => toggleOpen('registeredAgent')}>
                    {items.registeredAgent.open ? 'Cancel' : 'Mark Complete'}
                  </button>
                )}
              </div>
            </div>

            {items.registeredAgent.open && !spvFormation.registeredAgent.complete && (
              <div className="spv-item-form">
                <div className="field-group">
                  <label className="field-label" htmlFor="agent-name">Registered agent name</label>
                  <input
                    id="agent-name"
                    className="field-input"
                    placeholder="e.g. Registered Agent Co"
                    value={items.registeredAgent.agentName}
                    onChange={(e) => setField('registeredAgent', 'agentName', e.target.value)}
                  />
                </div>
                <div className="field-group">
                  <label className="field-label" htmlFor="agent-address">Registered agent address</label>
                  <input
                    id="agent-address"
                    className="field-input"
                    placeholder="e.g. 251 Little Falls Dr, Wilmington, DE 19808"
                    value={items.registeredAgent.agentAddress}
                    onChange={(e) => setField('registeredAgent', 'agentAddress', e.target.value)}
                  />
                </div>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => markComplete('registeredAgent')}>
                  Save &amp; Mark Complete
                </button>
              </div>
            )}
          </div>

          {/* Progress indicator */}
          <div className="spv-progress-footer">
            {[spvFormation.llcFiled.complete, spvFormation.einObtained.complete, spvFormation.registeredAgent.complete].filter(Boolean).length} of 3 tasks complete
            {!formed && (
              <span className="gate-message" style={{ marginLeft: 12 }}>
                Complete all 3 to unlock the Operating Agreement
              </span>
            )}
          </div>
        </div>

        {/* ── Right: Info panel ── */}
        <div className="two-panel-aside">
          <div className="card">
            <h3 style={{ marginTop: 0, marginBottom: 8, fontSize: 16 }}>Keep working while you wait</h3>
            <p style={{ fontSize: 14, color: 'var(--color-slate-600)', marginBottom: 16 }}>
              Government processing can take days. You don't have to stop — come back to mark
              each task complete as you receive confirmations.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="info-tile">
                <div className="info-tile-icon">1</div>
                <div>
                  <div className="info-tile-title">LLC Filing</div>
                  <div className="info-tile-desc">Typically 1–5 business days in Delaware. Expedited options available.</div>
                </div>
              </div>
              <div className="info-tile">
                <div className="info-tile-icon">2</div>
                <div>
                  <div className="info-tile-title">EIN</div>
                  <div className="info-tile-desc">Apply online at IRS.gov. Instant if applied online during business hours.</div>
                </div>
              </div>
              <div className="info-tile">
                <div className="info-tile-icon">3</div>
                <div>
                  <div className="info-tile-title">Registered Agent</div>
                  <div className="info-tile-desc">Required in every state where the entity is formed or operates.</div>
                </div>
              </div>
            </div>
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <h3 style={{ marginTop: 0, marginBottom: 8, fontSize: 16 }}>What's next?</h3>
            <p style={{ fontSize: 14, color: 'var(--color-slate-600)' }}>
              Once all 3 tasks are complete, proceed to Stage 3 to generate and sign the
              Operating Agreement with your GP.
            </p>
          </div>
        </div>
      </div>

      <HelpCard text="Need help with LLC filing, EIN applications, or finding a registered agent? Our team can connect you with formation service providers." />
    </div>
  )
}
