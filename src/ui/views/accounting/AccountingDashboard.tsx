import React, { useState } from 'react'
import { useAccountingStore } from '../../../state/accountingStore'
import { useAppStore } from '../../../state/store'
import { MonthYearPicker } from '../../components/MonthYearPicker'
import {
  computePrefGapSummary,
  computeIncomeStatement,
  fmtCurrency,
} from '../../../utils/financialComputations'
import { PropertySetup }   from './PropertySetup'
import { LineItemEntry }   from './LineItemEntry'
import { StatementViewer } from './StatementViewer'
import type { AccountingProperty } from '../../../state/accountingTypes'

/* ─── Helpers ── */

function formatPeriod(period: string) {
  const [y, m] = period.split('-').map(Number)
  return new Date(y, m - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

function useYtdNoi(property: AccountingProperty, entries: ReturnType<typeof useAccountingStore.getState>['entries']) {
  if (entries.length === 0) return 0
  const year   = new Date().getFullYear()
  const isData = computeIncomeStatement(property, entries, { type: 'year', year })
  return isData.rows.find((r) => r.key === 'noi')?.value ?? 0
}

/* ─── View types ── */

type View =
  | { type: 'dashboard' }
  | { type: 'setup';       propertyId?: string }
  | { type: 'property';    propertyId: string }

/* ─── Property row inside a deal group ── */

function PropertyRow({
  property,
  onOpen,
  onEdit,
}: {
  property: AccountingProperty
  onOpen: () => void
  onEdit: () => void
}) {
  const entries = useAccountingStore((s) => s.getEntriesForProperty(property.id))
  const gap     = computePrefGapSummary(entries)
  const ytdNOI  = useYtdNoi(property, entries)
  const latest  = entries[entries.length - 1]

  return (
    <div className="property-row">
      <div className="property-row-main">
        <div className="property-row-info">
          <div className="property-row-name">{property.name}</div>
          <div className="property-row-meta">
            {property.city && property.state ? `${property.city}, ${property.state} · ` : ''}
            {property.assetClass === 'multifamily' ? 'Multifamily' : 'Hotel'}
            {property.ein ? ` · EIN ${property.ein}` : ''}
          </div>
        </div>

        <div className="property-row-stats">
          <div className="property-row-stat">
            <div className="property-row-stat-label">YTD NOI</div>
            <div className={`property-row-stat-value ${ytdNOI < 0 ? 'text-negative' : ''}`}>
              {entries.length > 0 ? fmtCurrency(ytdNOI) : '—'}
            </div>
          </div>
          <div className="property-row-stat">
            <div className="property-row-stat-label">LP Pref Gap</div>
            <div className={`property-row-stat-value ${gap.gapYTD > 0.01 ? 'text-warning' : ''}`}>
              {gap.gapYTD > 0.01 ? fmtCurrency(gap.gapYTD) : '—'}
            </div>
          </div>
          <div className="property-row-stat">
            <div className="property-row-stat-label">Last Entry</div>
            <div className="property-row-stat-value">{latest ? formatPeriod(latest.period) : '—'}</div>
          </div>
          <div className="property-row-stat">
            <div className="property-row-stat-label">Entries</div>
            <div className="property-row-stat-value">{entries.length}</div>
          </div>
        </div>

        <div className="property-row-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onEdit}>Settings</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={onOpen}>Open →</button>
        </div>
      </div>

      {gap.gapYTD > 0.01 && (
        <div className="property-row-pref-warning">
          ⚠ Behind on LP pref — {gap.monthsWithGap} month{gap.monthsWithGap !== 1 ? 's' : ''} with unpaid pref ({fmtCurrency(gap.gapYTD)} YTD gap)
        </div>
      )}
    </div>
  )
}

/* ─── Deal group card ── */

function DealGroup({
  dealId,
  dealLabel,
  isPhase1Deal,
  properties,
  onOpenProperty,
  onEditProperty,
  onAddProperty,
}: {
  dealId: string
  dealLabel: string
  isPhase1Deal: boolean
  properties: AccountingProperty[]
  onOpenProperty: (id: string) => void
  onEditProperty: (id: string) => void
  onAddProperty: (dealId: string) => void
}) {
  const [collapsed, setCollapsed] = useState(false)

  // Aggregate pref gaps across all properties in this deal
  const totalGap = properties.reduce((sum, p) => {
    const entries = useAccountingStore.getState().getEntriesForProperty(p.id)
    return sum + computePrefGapSummary(entries).gapYTD
  }, 0)

  return (
    <div className="deal-group">
      <div className="deal-group-header">
        <div className="deal-group-title-row">
          <button
            type="button"
            className="deal-group-collapse-btn"
            onClick={() => setCollapsed((v) => !v)}
            aria-expanded={!collapsed}
          >
            <span className="deal-group-chevron">{collapsed ? '▸' : '▾'}</span>
          </button>
          <div>
            <div className="deal-group-name">
              {dealLabel}
              {isPhase1Deal && <span className="deal-group-badge">Phase 1</span>}
            </div>
            <div className="deal-group-meta">
              {properties.length} propert{properties.length !== 1 ? 'ies' : 'y'}
              {totalGap > 0.01 && (
                <span className="deal-group-meta-warning"> · ⚠ {fmtCurrency(totalGap)} LP pref gap</span>
              )}
            </div>
          </div>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => onAddProperty(dealId)}
        >
          + Add Property
        </button>
      </div>

      {!collapsed && (
        <div className="deal-group-properties">
          {properties.length === 0 ? (
            <div className="deal-group-empty">
              No properties yet.{' '}
              <button type="button" className="link-btn" onClick={() => onAddProperty(dealId)}>
                Add the first property
              </button>
            </div>
          ) : (
            properties.map((p) => (
              <PropertyRow
                key={p.id}
                property={p}
                onOpen={() => onOpenProperty(p.id)}
                onEdit={() => onEditProperty(p.id)}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

/* ─── Property workspace ── */

function PropertyWorkspace({
  property,
  onBack,
}: {
  property: AccountingProperty
  onBack: () => void
}) {
  const entries = useAccountingStore((s) => s.getEntriesForProperty(property.id))
  const gap     = computePrefGapSummary(entries)
  const [workspace, setWorkspace] = useState<'overview' | 'entry' | 'statements'>('overview')
  const [entryPeriod, setEntryPeriod] = useState('')

  const now           = new Date()
  const defaultPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const [newEntryPeriod, setNewEntryPeriod] = useState(defaultPeriod)

  if (workspace === 'entry' && entryPeriod) {
    return (
      <LineItemEntry
        property={property}
        period={entryPeriod}
        onSaved={() => setWorkspace('overview')}
        onCancel={() => setWorkspace('overview')}
      />
    )
  }

  if (workspace === 'statements') {
    return (
      <div className="page-enter">
        <div style={{ marginBottom: 20 }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setWorkspace('overview')}>
            ← Back to {property.name}
          </button>
        </div>
        <StatementViewer property={property} entries={entries} />
      </div>
    )
  }

  // Overview
  const ytdNOI = useYtdNoi(property, entries)
  const isData = entries.length > 0
    ? computeIncomeStatement(property, entries, { type: 'year', year: now.getFullYear() })
    : null
  const ytdEGI = isData?.rows.find((r) => r.key === 'egi' || r.key === 'total-rev')?.value ?? 0
  const ytdNet = isData?.rows.find((r) => r.key === 'net-income')?.value ?? 0

  return (
    <div className="page-enter">
      <div className="page-header">
        <div style={{ marginBottom: 8 }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onBack}>← All Deals</button>
        </div>
        <span className="page-header-eyebrow">Accounting</span>
        <h1>{property.name}</h1>
        <p className="page-header-subtitle">
          {property.assetClass === 'multifamily' ? 'Multifamily — NMHC/NAA' : 'Hotel — USALI 11th Ed.'}
          {property.ein ? ` · EIN ${property.ein}` : ''}
          {' · '}Tax Year {property.taxYear}
        </p>
      </div>

      {/* Pref gap alert */}
      {gap.gapYTD > 0.01 && (
        <div className="pref-gap-alert">
          <div className="pref-gap-alert-icon">⚠</div>
          <div>
            <div className="pref-gap-alert-title">Behind on LP Preferred Return</div>
            <div className="pref-gap-alert-body">
              {fmtCurrency(gap.gapYTD)} in unpaid pref across {gap.monthsWithGap} month{gap.monthsWithGap !== 1 ? 's' : ''}.
              Calculated: {fmtCurrency(gap.calculatedYTD)} — Actual paid: {fmtCurrency(gap.actualPaidYTD)}.
            </div>
          </div>
        </div>
      )}

      {/* Action bar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="entry-period-picker">
          <MonthYearPicker value={newEntryPeriod} onChange={setNewEntryPeriod} />
          <button
            type="button"
            className="btn btn-primary"
            disabled={!newEntryPeriod}
            onClick={() => { setEntryPeriod(newEntryPeriod); setWorkspace('entry') }}
          >
            + Enter Data
          </button>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setWorkspace('statements')}
          disabled={entries.length === 0}
        >
          View Statements →
        </button>
      </div>

      {/* YTD stats */}
      {entries.length > 0 && (
        <div className="stat-row" style={{ marginBottom: 24 }}>
          <div className="stat-card">
            <div className="stat-label">{property.assetClass === 'multifamily' ? 'YTD EGI' : 'YTD Revenue'}</div>
            <div className="stat-value">{fmtCurrency(ytdEGI)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">YTD NOI</div>
            <div className={`stat-value ${ytdNOI < 0 ? 'stat-value--negative' : ''}`}>{fmtCurrency(ytdNOI)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">YTD Net Income</div>
            <div className={`stat-value ${ytdNet < 0 ? 'stat-value--negative' : ''}`}>{fmtCurrency(ytdNet)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">LP Pref Gap YTD</div>
            <div className={`stat-value ${gap.gapYTD > 0.01 ? 'text-warning' : ''}`}>
              {gap.gapYTD > 0.01 ? fmtCurrency(gap.gapYTD) : '—'}
            </div>
          </div>
        </div>
      )}

      {/* Monthly entries table */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>Monthly Entries</h3>
          <div className="entry-period-picker">
            <MonthYearPicker value={newEntryPeriod} onChange={setNewEntryPeriod} />
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={!newEntryPeriod}
              onClick={() => { setEntryPeriod(newEntryPeriod); setWorkspace('entry') }}
            >
              + New Entry
            </button>
          </div>
        </div>

        {entries.length === 0 ? (
          <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--color-slate-500)', fontSize: 14 }}>
            No entries yet. Add your first monthly entry above.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Period</th>
                <th style={{ textAlign: 'right' }}>{property.assetClass === 'multifamily' ? 'EGI' : 'Revenue'}</th>
                <th style={{ textAlign: 'right' }}>NOI</th>
                <th style={{ textAlign: 'right' }}>LP Pref</th>
                <th style={{ textAlign: 'right' }}>Pref Gap</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {[...entries].reverse().map((e) => {
                const mf  = property.assetClass === 'multifamily'
                const p   = e.pnl as any
                const egi = mf
                  ? p.grossPotentialRent - p.vacancyLoss - p.concessions - p.badDebt + p.utilityReimbursements + p.otherIncome
                  : p.roomsRevenue + p.foodBeverageRevenue + p.otherOperatedDepts + p.miscIncome
                const opex = mf
                  ? p.propertyManagementFee + p.payrollBenefits + p.repairsMaintenance + p.makeReadyTurns + p.landscaping + p.utilitiesCommonArea + p.insurance + p.propertyTaxes + p.marketingAdvertising + p.administrativeGeneral + p.contractServices
                  : p.roomsExpense + p.foodBeverageExpense + p.otherDeptExpense + p.administrativeGeneral + p.itTelecom + p.salesMarketing + p.propertyOperationsMaint + p.utilities + p.baseManagementFee + p.incentiveManagementFee + p.franchiseFee + p.programMarketingFee
                const noi = egi - opex
                const gapV = e.distributions.prefGap

                return (
                  <tr key={e.id}>
                    <td style={{ fontWeight: 500 }}>{formatPeriod(e.period)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtCurrency(egi)}</td>
                    <td style={{ textAlign: 'right', color: noi < 0 ? 'var(--color-error)' : undefined }}>{fmtCurrency(noi)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtCurrency(e.distributions.actualLPDistribution)}</td>
                    <td style={{ textAlign: 'right', color: gapV > 0.01 ? 'var(--color-warning)' : undefined }}>
                      {gapV > 0.01 ? fmtCurrency(gapV) : '—'}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => { setEntryPeriod(e.period); setWorkspace('entry') }}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

/* ─── Main dashboard ── */

export const AccountingDashboard: React.FC = () => {
  const properties  = useAccountingStore((s) => s.properties)
  const phase1Deal  = useAppStore((s) => s.data.deal)
  const [view, setView] = useState<View>({ type: 'dashboard' })
  const [addToDealId, setAddToDealId] = useState<string | undefined>()

  /* Navigate to setup with optional pre-filled dealId */
  const startSetup = (dealId?: string) => {
    setAddToDealId(dealId)
    setView({ type: 'setup' })
  }

  if (view.type === 'setup') {
    const existing = view.propertyId ? properties.find((p) => p.id === view.propertyId) : undefined
    return (
      <PropertySetup
        existingProperty={existing}
        onSaved={(id) => {
          setAddToDealId(undefined)
          setView({ type: 'property', propertyId: id })
        }}
        onCancel={() => {
          setAddToDealId(undefined)
          setView({ type: 'dashboard' })
        }}
      />
    )
  }

  if (view.type === 'property') {
    const prop = properties.find((p) => p.id === view.propertyId)
    if (!prop) { setView({ type: 'dashboard' }); return null }
    return (
      <PropertyWorkspace
        property={prop}
        onBack={() => setView({ type: 'dashboard' })}
      />
    )
  }

  /* ── Dashboard: group by deal ── */

  // Build deal groups — derive deal label from Phase 1 store when possible
  const phase1DealId = phase1Deal.entityName ?? ''

  // Collect all distinct dealIds (including standalone)
  const dealMap = new Map<string, AccountingProperty[]>()
  for (const p of properties) {
    const key = p.dealId || '__standalone__'
    if (!dealMap.has(key)) dealMap.set(key, [])
    dealMap.get(key)!.push(p)
  }

  // Phase 1 deal group always shown if entityName exists (even if no properties yet)
  if (phase1DealId && !dealMap.has(phase1DealId)) {
    dealMap.set(phase1DealId, [])
  }

  // Sort groups: Phase 1 deal first, standalone last
  const sortedGroups = [...dealMap.entries()].sort(([a], [b]) => {
    if (a === phase1DealId) return -1
    if (b === phase1DealId) return  1
    if (a === '__standalone__') return  1
    if (b === '__standalone__') return -1
    return a.localeCompare(b)
  })

  const getDealLabel = (dealId: string) => {
    if (dealId === '__standalone__') return 'Standalone Properties'
    if (dealId === phase1DealId)     return phase1DealId
    return dealId
  }

  return (
    <div className="page-enter">
      <div className="page-header">
        <span className="page-header-eyebrow">Phase 2</span>
        <h1>Accounting</h1>
        <p className="page-header-subtitle">
          Monthly P&amp;L entry and financial statement generation for multifamily and hotel assets.
          Statements pull directly from your line-item data — no QuickBooks needed.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 28 }}>
        <button type="button" className="btn btn-primary" onClick={() => startSetup(phase1DealId || undefined)}>
          + Add Property
        </button>
      </div>

      {sortedGroups.length === 0 ? (
        <div className="card" style={{ padding: '48px 40px', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🏢</div>
          <h3 style={{ marginTop: 0, marginBottom: 8 }}>No properties yet</h3>
          <p style={{ color: 'var(--color-slate-500)', fontSize: 14, maxWidth: 400, margin: '0 auto 24px' }}>
            Add a property to start entering monthly income and expense data.
            Your financial statements generate automatically.
          </p>
          <button type="button" className="btn btn-primary" onClick={() => startSetup()}>
            Add First Property →
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {sortedGroups.map(([dealId, props]) => (
            <DealGroup
              key={dealId}
              dealId={dealId}
              dealLabel={getDealLabel(dealId)}
              isPhase1Deal={dealId === phase1DealId && !!phase1DealId}
              properties={props}
              onOpenProperty={(id) => setView({ type: 'property', propertyId: id })}
              onEditProperty={(id) => setView({ type: 'setup', propertyId: id })}
              onAddProperty={(did) => startSetup(did === '__standalone__' ? undefined : did)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
