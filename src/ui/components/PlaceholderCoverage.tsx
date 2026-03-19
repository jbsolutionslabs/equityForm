import React, { useState } from 'react'
import { generatePlaceholders } from '../../utils/placeholders'
import { useAppStore } from '../../state/store'

type HealthStatus = 'ok' | 'warn' | 'missing'

interface HealthGroup {
  label: string
  items: Array<{ name: string; status: HealthStatus; value: string }>
}

function statusOf(type: string, value: unknown): HealthStatus {
  if (type === 'missing') return 'missing'
  if (type === 'integration') return 'warn'
  if (value === undefined || value === null || value === '' || value === 'MISSING') return 'missing'
  return 'ok'
}

function preview(value: unknown): string {
  if (value === undefined || value === null || value === '') return '—'
  if (typeof value === 'object') return Array.isArray(value) ? `${(value as unknown[]).length} items` : '(object)'
  return String(value).slice(0, 40)
}

export const PlaceholderCoverage: React.FC = () => {
  const data = useAppStore((s) => s.data)
  const { values, map } = generatePlaceholders(data)
  const [showRaw, setShowRaw] = useState(false)

  // Group placeholders into logical categories
  const entityKeys      = ['ENTITY_NAME','FORMATION_STATE','EFFECTIVE_DATE','PRINCIPAL_ADDRESS','REGISTERED_AGENT_NAME','REGISTERED_AGENT_ADDRESS','DEAL_PURPOSE','GP_ENTITY_NAME','GP_ENTITY_STATE','GP_SIGNER_NAME','GP_SIGNER_TITLE']
  const propertyKeys    = ['PROPERTY_ADDRESS','PROPERTY_CITY','PROPERTY_STATE','PROPERTY_ZIP','PROPERTY_LEGAL_DESCRIPTION']
  const offeringKeys    = ['OFFERING_EXEMPTION','OFFERING_EXEMPTION_RULE','SOLICITATION_METHOD','MIN_INVESTMENT','CLOSING_DATE','PREFERRED_RETURN_RATE','PREFERRED_RETURN_TYPE','IRR_RATE','GP_PROMOTE','LP_RESIDUAL']
  const feeKeys         = ['ASSET_MGMT_FEE','ACQUISITION_FEE','DISPOSITION_FEE','CONSENT_THRESHOLD','REFINANCE_THRESHOLD','AMENDMENT_THRESHOLD','REPORT_PERIOD','REPORT_FREQUENCY_DAYS','DISPUTE_METHOD','DISPUTE_VENUE']
  const bankingKeys     = ['BANK_NAME','ACCOUNT_NAME','ACCOUNT_NUMBER','ROUTING_NUMBER']

  const allCategorised  = new Set([...entityKeys,...propertyKeys,...offeringKeys,...feeKeys,...bankingKeys])
  const otherKeys       = Object.keys(map).filter((k) => !allCategorised.has(k))

  const buildGroup = (label: string, keys: string[]): HealthGroup => ({
    label,
    items: keys
      .filter((k) => k in map)
      .map((k) => ({
        name: k,
        status: statusOf(map[k].type, values[k]),
        value: preview(values[k]),
      })),
  })

  const groups: HealthGroup[] = [
    buildGroup('Entity Setup', entityKeys),
    buildGroup('Property Details', propertyKeys),
    buildGroup('Offering Terms', offeringKeys),
    buildGroup('Fees & Governance', feeKeys),
    buildGroup('Banking', bankingKeys),
    buildGroup('Investors & Other', otherKeys),
  ].filter((g) => g.items.length > 0)

  const totalItems   = groups.flatMap((g) => g.items).length
  const okCount      = groups.flatMap((g) => g.items).filter((i) => i.status === 'ok').length
  const missingCount = groups.flatMap((g) => g.items).filter((i) => i.status === 'missing').length
  const warnCount    = groups.flatMap((g) => g.items).filter((i) => i.status === 'warn').length

  return (
    <div>
      <div className="doc-health-card">
        <div className="doc-health-card-header">
          <span className="doc-health-card-title">Document Health</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {missingCount > 0 && (
              <span className="status-badge status-badge--pending">
                {missingCount} missing
              </span>
            )}
            {warnCount > 0 && (
              <span className="status-badge status-badge--sent">
                {warnCount} pending
              </span>
            )}
            <span className="status-badge status-badge--signed">
              {okCount}/{totalItems} filled
            </span>
          </div>
        </div>

        <div className="doc-health-body">
          {groups.map((group) => (
            <React.Fragment key={group.label}>
              <div
                style={{
                  padding: '8px 20px 4px',
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--color-slate-400)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.07em',
                }}
              >
                {group.label}
              </div>
              {group.items.map((item) => (
                <div key={item.name} className="doc-health-item">
                  <div
                    className={`doc-health-icon doc-health-icon--${item.status === 'ok' ? 'ok' : item.status === 'warn' ? 'warn' : 'missing'}`}
                    aria-label={item.status}
                  >
                    {item.status === 'ok' ? '✓' : item.status === 'warn' ? '~' : '!'}
                  </div>
                  <div className="doc-health-label" style={{ fontSize: 12.5 }}>
                    {item.name.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}
                  </div>
                  {item.status !== 'missing' && (
                    <div className="doc-health-value">{item.value}</div>
                  )}
                </div>
              ))}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Developer raw view toggle */}
      <div style={{ textAlign: 'center', marginTop: 8 }}>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setShowRaw((r) => !r)}
          style={{ fontSize: 12 }}
        >
          {showRaw ? 'Hide' : 'Show'} raw placeholder table
        </button>
      </div>

      {showRaw && (
        <div style={{ marginTop: 12, overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Placeholder</th>
                <th>Status</th>
                <th>Source</th>
                <th>Value preview</th>
              </tr>
            </thead>
            <tbody>
              {Object.keys(map).map((k) => {
                const s = map[k]
                const v = values[k]
                return (
                  <tr key={k}>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{k}</td>
                    <td>
                      <span
                        className={`status-badge status-badge--${
                          s.type === 'missing' ? 'pending' : s.type === 'integration' ? 'sent' : 'signed'
                        }`}
                        style={{ fontSize: 11 }}
                      >
                        {s.type}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: 11.5, color: 'var(--color-slate-600)' }}>
                      {'path' in s ? (s as { path: string }).path : (s as { formula?: string; source?: string }).formula ?? (s as { source?: string }).source ?? ''}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: 11.5, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default PlaceholderCoverage
