import React, { useState, useEffect, useMemo } from 'react'
import {
  useAccountingStore,
  buildDefaultEntry,
  defaultMFPnL,
  defaultHotelPnL,
} from '../../../state/accountingStore'
import { CurrencyInput } from '../../components/CurrencyInput'
import {
  getMonthlyDebtService,
  getMonthlyDepreciation,
  getMonthlyFinancingCostAmortization,
  getCalculatedLPPref,
  computeIncomeStatement,
  fmtAccounting,
  fmtCurrency,
} from '../../../utils/financialComputations'
import type {
  AccountingProperty,
  MonthlyEntry,
  MultifamilyPnL,
  HotelPnL,
  BelowLineItems,
  WorkingCapitalAdjustments,
  DistributionEntry,
} from '../../../state/accountingTypes'
import { SpreadsheetImportModal } from '../../components/SpreadsheetImportModal'
import type { MultiMonthImportResult } from '../../../server/types/importTypes'
import { applyImportedValues, type EntryDraft } from './applyImportedValues'

type Props = {
  property: AccountingProperty
  period: string        // "YYYY-MM"
  onSaved?: () => void
  onCancel?: () => void
  readOnly?: boolean
}

type Tab = 'pnl' | 'belowline' | 'workingcapital' | 'balancesheet' | 'distributions'

const TABS: { id: Tab; label: string }[] = [
  { id: 'pnl',           label: 'P&L Line Items' },
  { id: 'belowline',     label: 'Below The Line' },
  { id: 'workingcapital',label: 'Working Capital' },
  { id: 'balancesheet',  label: 'Balance Sheet (Schedule L)' },
  { id: 'distributions', label: 'Distributions' },
]

type ScheduleLRow = {
  lineNo: number
  label: string
  boy: number
  eom: number
  total?: boolean
}

function NumRow({
  label,
  value,
  onChange,
  hint,
  prefix = '$',
  readOnly = false,
  highlight = false,
}: {
  label: string
  value: number
  onChange?: (v: number) => void
  hint?: string
  prefix?: string
  readOnly?: boolean
  highlight?: boolean
}) {
  return (
    <div className={`line-item-row ${highlight ? 'line-item-row--highlight' : ''}`}>
      <div className="line-item-label">
        <span>{label}</span>
        {hint && <span className="line-item-hint">{hint}</span>}
      </div>
      <div className="line-item-input">
        <span className="field-adornment">{prefix}</span>
        {readOnly ? (
          <div className="line-item-readonly">{value.toLocaleString()}</div>
        ) : (
          <CurrencyInput
            className="field-input field-input--sm"
            value={value}
            onChange={(v) => onChange?.(v)}
          />
        )}
      </div>
    </div>
  )
}

function SectionHeader({ label, right }: { label: string; right?: React.ReactNode }) {
  return (
    <div className="line-item-section-header">
      <span>{label}</span>
      {right}
    </div>
  )
}

export const LineItemEntry: React.FC<Props> = ({
  property,
  period,
  onSaved,
  onCancel,
  readOnly = false,
}) => {
  const getEntry    = useAccountingStore((s) => s.getEntry)
  const getEntriesForProperty = useAccountingStore((s) => s.getEntriesForProperty)
  const upsertEntry = useAccountingStore((s) => s.upsertEntry)
  const deleteEntry = useAccountingStore((s) => s.deleteEntry)

  const [tab, setTab] = useState<Tab>('pnl')
  const [saving, setSaving] = useState(false)
  const [notification, setNotification] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [showImportModal, setShowImportModal] = useState(false)

  // Build initial state from existing entry or defaults
  const buildInitial = (): Omit<MonthlyEntry, 'id' | 'createdAt' | 'updatedAt'> => {
    const existing = getEntry(property.id, period)
    if (existing) return { ...existing }
    return buildDefaultEntry(property, period)
  }

  const [entry, setEntry] = useState<Omit<MonthlyEntry, 'id' | 'createdAt' | 'updatedAt'>>(buildInitial)

  // Auto-calc below-line values from property
  const autoDebt    = getMonthlyDebtService(property, period)
  const autoDep     = getMonthlyDepreciation(property)
  const autoFinAmort= getMonthlyFinancingCostAmortization(property)
  const autoLPPref  = getCalculatedLPPref(property)

  // Seed auto-calcs when not overridden
  useEffect(() => {
    setEntry((prev) => ({
      ...prev,
      belowLine: {
        ...prev.belowLine,
        depreciation:               prev.belowLine.depreciationOverridden ? prev.belowLine.depreciation : autoDep,
        amortizationFinancingCosts: prev.belowLine.depreciationOverridden ? prev.belowLine.amortizationFinancingCosts : autoFinAmort,
        debtServiceInterest:        prev.belowLine.debtServiceOverridden  ? prev.belowLine.debtServiceInterest  : autoDebt.interest,
        debtServicePrincipal:       prev.belowLine.debtServiceOverridden  ? prev.belowLine.debtServicePrincipal : autoDebt.principal,
      },
      distributions: {
        ...prev.distributions,
        calculatedLPPref:     autoLPPref,
        actualLPDistribution: prev.distributions.isOverridden ? prev.distributions.actualLPDistribution : autoLPPref,
      },
    }))
  }, [period, property.id]) // eslint-disable-line

  const notify = (msg: string, type: 'success' | 'error' = 'success') => {
    setNotification({ msg, type })
    window.setTimeout(() => setNotification(null), 4000)
  }

  const patchMF = (key: keyof MultifamilyPnL, val: number) =>
    setEntry((e) => ({ ...e, pnl: { ...(e.pnl as MultifamilyPnL), [key]: val } }))

  const patchHotel = (key: keyof HotelPnL, val: number) =>
    setEntry((e) => ({ ...e, pnl: { ...(e.pnl as HotelPnL), [key]: val } }))

  const patchBelow = (key: keyof BelowLineItems, val: number | boolean) =>
    setEntry((e) => ({ ...e, belowLine: { ...e.belowLine, [key]: val } }))

  const patchWC = (key: keyof WorkingCapitalAdjustments, val: number) =>
    setEntry((e) => ({ ...e, workingCapital: { ...e.workingCapital, [key]: val } }))

  const patchDist = (key: keyof DistributionEntry, val: number | boolean | string) =>
    setEntry((e) => ({ ...e, distributions: { ...e.distributions, [key]: val } }))

  const applyImportResults = (result: MultiMonthImportResult) => {
    const months = Object.keys(result.months)

    if (!months.length) {
      notify('No imported months were available to apply.', 'error')
      return
    }

    let updatedCurrent: EntryDraft | null = null

    months.forEach((monthKey) => {
      const existing = getEntry(property.id, monthKey)
      const baseEntry: EntryDraft = existing
        ? (() => {
          const { createdAt, updatedAt, ...rest } = existing
          return { ...rest }
        })()
        : buildDefaultEntry(property, monthKey)

      const updated = applyImportedValues(baseEntry, property, result.months[monthKey])
      if (monthKey === period) {
        updatedCurrent = updated
      }
      upsertEntry(updated)
    })

    if (updatedCurrent) {
      setEntry(updatedCurrent)
    }

    notify(`Imported values applied to ${months.length} month${months.length > 1 ? 's' : ''}.`)
  }

  const handleSave = () => {
    setSaving(true)
    try {
      upsertEntry(entry)
      notify('Entry saved.')
      onSaved?.()
    } finally {
      setSaving(false)
    }
  }

  const mf    = property.assetClass === 'multifamily'
  const pnl   = entry.pnl
  const bl    = entry.belowLine
  const wc    = entry.workingCapital
  const dist  = entry.distributions
  const existingEntry = getEntry(property.id, period)

  // Derived totals for display
  const mfPnl  = pnl as MultifamilyPnL
  const htPnl  = pnl as HotelPnL

  const egi = mf
    ? mfPnl.grossPotentialRent - mfPnl.vacancyLoss - mfPnl.concessions - mfPnl.badDebt + mfPnl.utilityReimbursements + mfPnl.otherIncome
    : htPnl.roomsRevenue + htPnl.foodBeverageRevenue + htPnl.otherOperatedDepts + htPnl.miscIncome

  const totalOpEx = mf
    ? mfPnl.propertyManagementFee + mfPnl.payrollBenefits + mfPnl.repairsMaintenance + mfPnl.makeReadyTurns + mfPnl.landscaping + mfPnl.utilitiesCommonArea + mfPnl.insurance + mfPnl.propertyTaxes + mfPnl.marketingAdvertising + mfPnl.administrativeGeneral + mfPnl.contractServices
    : htPnl.roomsExpense + htPnl.foodBeverageExpense + htPnl.otherDeptExpense + htPnl.administrativeGeneral + htPnl.itTelecom + htPnl.salesMarketing + htPnl.propertyOperationsMaint + htPnl.utilities + htPnl.baseManagementFee + htPnl.incentiveManagementFee + htPnl.franchiseFee + htPnl.programMarketingFee

  const noi = egi - totalOpEx

  const prefGap    = dist.calculatedLPPref - dist.actualLPDistribution
  const isOverpaid = prefGap < -0.01

  const statementPreview = useMemo(() => {
    const entriesForProperty = getEntriesForProperty(property.id)

    const draftAsMonthly = {
      ...entry,
      id: `draft-${property.id}-${period}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as MonthlyEntry

    const mergedEntries = (() => {
      const existingIdx = entriesForProperty.findIndex((e) => e.period === period)
      if (existingIdx === -1) return [...entriesForProperty, draftAsMonthly]
      return entriesForProperty.map((e, idx) => (idx === existingIdx ? draftAsMonthly : e))
    })()

    const [year] = period.split('-').map(Number)
    const [_, month] = period.split('-').map(Number)

    const monthlyStatement = computeIncomeStatement(property, mergedEntries, {
      type: 'month',
      year,
      month,
    })

    const ytdStatement = computeIncomeStatement(property, mergedEntries, {
      type: 'year',
      year,
    })

    const monthlyNOI = monthlyStatement.rows.find((r) => r.key === 'noi')?.value ?? 0
    const monthlyNetIncome = monthlyStatement.rows.find((r) => r.key === 'net-income')?.value ?? 0
    const ytdNOI = ytdStatement.rows.find((r) => r.key === 'noi')?.value ?? 0
    const ytdNetIncome = ytdStatement.rows.find((r) => r.key === 'net-income')?.value ?? 0

    return {
      monthlyNOI,
      monthlyNetIncome,
      ytdNOI,
      ytdNetIncome,
    }
  }, [entry, getEntriesForProperty, period, property])

  const scheduleLRows = useMemo(() => {
    const entriesForProperty = getEntriesForProperty(property.id)
    const draftAsMonthly = {
      ...entry,
      id: `draft-${property.id}-${period}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as MonthlyEntry

    const mergedEntries = (() => {
      const existingIdx = entriesForProperty.findIndex((e) => e.period === period)
      if (existingIdx === -1) return [...entriesForProperty, draftAsMonthly]
      return entriesForProperty.map((e, idx) => (idx === existingIdx ? draftAsMonthly : e))
    })()

    const [year] = period.split('-').map(Number)
    const yearStart = `${year}-01`
    const ytdEntries = mergedEntries
      .filter((e) => e.period >= yearStart && e.period <= period)
      .sort((a, b) => a.period.localeCompare(b.period))

    const ob = property.openingBalances

    const cashBoy = ob.cashBeginning
    const cashEom = cashBoy + ytdEntries.reduce((s, e) => {
      const operating =
        e.workingCapital.changeInAccountsReceivable +
        e.workingCapital.changeInPrepaidExpenses +
        e.workingCapital.changeInAccountsPayable +
        e.workingCapital.changeInAccruedLiabilities +
        e.workingCapital.changeInSecurityDeposits +
        e.workingCapital.otherOperatingAdjustments
      const investing =
        -e.belowLine.capEx -
        e.belowLine.replacementReserve +
        e.workingCapital.proceedsFromSaleOfAssets +
        e.workingCapital.otherInvestingActivities
      const financing =
        -e.belowLine.debtServicePrincipal -
        e.belowLine.debtServiceInterest +
        e.workingCapital.proceedsFromNewBorrowings +
        e.workingCapital.capitalContributions +
        e.workingCapital.otherFinancingActivities -
        e.distributions.actualLPDistribution -
        e.distributions.actualGPDistribution
      const [entryYear] = e.period.split('-').map(Number)
      const monthlyNI = computeIncomeStatement(property, [e], { type: 'year', year: entryYear })
        .rows.find((r) => r.key === 'net-income')?.value ?? 0
      return s + monthlyNI + operating + investing + financing
    }, 0)

    const arBoy = ob.accountsReceivableBeginning
    const arEom = arBoy + ytdEntries.reduce((s, e) => s + e.workingCapital.changeInAccountsReceivable, 0)

    const otherCurrentBoy = ob.prepaidExpensesBeginning
    const otherCurrentEom = otherCurrentBoy + ytdEntries.reduce((s, e) => s + e.workingCapital.changeInPrepaidExpenses, 0)

    const buildingsBoy = property.depreciation.depreciableBuilding
    const buildingsEom = buildingsBoy
    const accumDepBoy = property.depreciation.accumulatedDepreciationBOY
    const accumDepEom = accumDepBoy + ytdEntries.reduce((s, e) => s + e.belowLine.depreciation, 0)

    const otherInvestmentsBoy = property.landValue + ob.otherAssetsBeginning + property.depreciation.deferredFinancingCosts
    const otherInvestmentsEom =
      property.landValue +
      ob.otherAssetsBeginning +
      Math.max(
        0,
        property.depreciation.deferredFinancingCosts -
        ytdEntries.reduce((s, e) => s + e.belowLine.amortizationFinancingCosts, 0),
      )

    const totalAssetsBoy =
      cashBoy + arBoy + otherCurrentBoy + otherInvestmentsBoy + buildingsBoy - accumDepBoy
    const totalAssetsEom =
      cashEom + arEom + otherCurrentEom + otherInvestmentsEom + buildingsEom - accumDepEom

    const apBoy = ob.accountsPayableBeginning
    const apEom = apBoy + ytdEntries.reduce((s, e) => s + e.workingCapital.changeInAccountsPayable, 0)

    const debtAtStart = property.debtStructure.loanAmount
    const principalPaidYtd = ytdEntries.reduce((s, e) => s + e.belowLine.debtServicePrincipal, 0)
    const debtEom = Math.max(0, debtAtStart - principalPaidYtd)

    const [startYear] = yearStart.split('-').map(Number)
    const startDebtService = getMonthlyDebtService(property, `${startYear}-01`)
    const endDebtService = getMonthlyDebtService(property, period)

    const currentMaturitiesBoy = Math.min(debtAtStart, Math.max(0, startDebtService.principal) * 12)
    const currentMaturitiesEom = Math.min(debtEom, Math.max(0, endDebtService.principal) * 12)

    const otherCurrentLiabBoy = ob.accruedLiabilitiesBeginning
    const otherCurrentLiabEom =
      otherCurrentLiabBoy +
      ytdEntries.reduce((s, e) => s + e.workingCapital.changeInAccruedLiabilities + e.workingCapital.changeInSecurityDeposits, 0)

    const nonrecourseBoy = property.debtStructure.subordinateLoanAmount ?? 0
    const nonrecourseEom = nonrecourseBoy

    const longTermDebtBoy = Math.max(0, debtAtStart - currentMaturitiesBoy)
    const longTermDebtEom = Math.max(0, debtEom - currentMaturitiesEom)

    const netIncomeYtd = computeIncomeStatement(property, ytdEntries, { type: 'year', year })
      .rows.find((r) => r.key === 'net-income')?.value ?? 0
    const capitalContribYtd = ytdEntries.reduce((s, e) => s + e.workingCapital.capitalContributions, 0)
    const distributionsYtd = ytdEntries.reduce(
      (s, e) => s + e.distributions.actualLPDistribution + e.distributions.actualGPDistribution,
      0,
    )

    const partnersCapitalBoy = ob.partnersCapitalBeginning
    const partnersCapitalEom = partnersCapitalBoy + capitalContribYtd + netIncomeYtd - distributionsYtd

    const totalLCEBoy =
      apBoy + currentMaturitiesBoy + otherCurrentLiabBoy + nonrecourseBoy + longTermDebtBoy + partnersCapitalBoy
    const totalLCEEom =
      apEom + currentMaturitiesEom + otherCurrentLiabEom + nonrecourseEom + longTermDebtEom + partnersCapitalEom

    const rows: ScheduleLRow[] = [
      { lineNo: 1, label: 'Cash', boy: cashBoy, eom: cashEom },
      { lineNo: 2, label: 'Trade notes and accounts receivable', boy: arBoy, eom: arEom },
      { lineNo: 3, label: 'Less: Allowance for bad debts', boy: 0, eom: 0 },
      { lineNo: 4, label: 'Inventories', boy: 0, eom: 0 },
      { lineNo: 5, label: 'U.S. government obligations', boy: 0, eom: 0 },
      { lineNo: 6, label: 'Tax-exempt securities', boy: 0, eom: 0 },
      { lineNo: 7, label: 'Other current assets', boy: otherCurrentBoy, eom: otherCurrentEom },
      { lineNo: 8, label: 'Mortgage and real estate loans', boy: 0, eom: 0 },
      { lineNo: 9, label: 'Other investments (incl. land and other assets)', boy: otherInvestmentsBoy, eom: otherInvestmentsEom },
      { lineNo: 10, label: 'Buildings and other depreciable assets', boy: buildingsBoy, eom: buildingsEom },
      { lineNo: 11, label: 'Less: Accumulated depreciation', boy: -accumDepBoy, eom: -accumDepEom },
      { lineNo: 12, label: 'Depletable assets', boy: 0, eom: 0 },
      { lineNo: 13, label: 'Less: Accumulated depletion', boy: 0, eom: 0 },
      { lineNo: 14, label: 'Total assets', boy: totalAssetsBoy, eom: totalAssetsEom, total: true },
      { lineNo: 15, label: 'Accounts payable', boy: apBoy, eom: apEom },
      { lineNo: 16, label: 'Mortgages, notes, bonds payable in less than 1 year', boy: currentMaturitiesBoy, eom: currentMaturitiesEom },
      { lineNo: 17, label: 'Other current liabilities', boy: otherCurrentLiabBoy, eom: otherCurrentLiabEom },
      { lineNo: 18, label: 'All nonrecourse loans', boy: nonrecourseBoy, eom: nonrecourseEom },
      { lineNo: 19, label: 'Mortgages, notes, bonds payable in 1 year or more', boy: longTermDebtBoy, eom: longTermDebtEom },
      { lineNo: 20, label: 'Other liabilities', boy: 0, eom: 0 },
      { lineNo: 21, label: "Partners' capital accounts", boy: partnersCapitalBoy, eom: partnersCapitalEom },
      { lineNo: 22, label: 'Total liabilities and capital', boy: totalLCEBoy, eom: totalLCEEom, total: true },
    ]

    return {
      rows,
      imbalanceBoy: totalAssetsBoy - totalLCEBoy,
      imbalanceEom: totalAssetsEom - totalLCEEom,
    }
  }, [entry, getEntriesForProperty, period, property])

  // Period label
  const [py, pm] = period.split('-').map(Number)
  const periodDisplay = new Date(py, pm - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const handleDeleteEntry = () => {
    if (!existingEntry) return
    if (!window.confirm(`Delete entry for ${periodDisplay}? This cannot be undone.`)) return
    deleteEntry(existingEntry.id)
    notify('Entry deleted.', 'success')
    onCancel?.()
  }

  return (
    <div className="page-enter">
      <div className="page-header">
        <span className="page-header-eyebrow">Monthly Entry — {property.name}</span>
        <h1>{periodDisplay}</h1>
        <p className="page-header-subtitle">
          Enter {mf ? 'multifamily (NMHC/NAA)' : 'hotel (USALI 11th Ed.)'} P&L line items.
          Below-the-line items are auto-calculated from property setup — override if needed.
        </p>
        {!readOnly && (
          <div style={{ marginTop: 16 }}>
            <button type="button" className="btn btn-secondary" onClick={() => setShowImportModal(true)}>
              Import from Spreadsheet
            </button>
          </div>
        )}
      </div>

      {notification && (
        <div className={`notification notification--${notification.type}`} role="alert">
          {notification.type === 'success' ? '✓ ' : '⚠ '}{notification.msg}
        </div>
      )}

      {/* Quick stats banner */}
      <div className="stat-row" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-label">{mf ? 'EGI' : 'Total Revenue'}</div>
          <div className="stat-value">{fmtCurrency(egi)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total OpEx</div>
          <div className="stat-value">{fmtCurrency(totalOpEx)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">NOI</div>
          <div className={`stat-value ${noi < 0 ? 'stat-value--negative' : ''}`}>{fmtCurrency(noi)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">LP Pref (Monthly)</div>
          <div className="stat-value">{fmtCurrency(dist.calculatedLPPref)}</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 0, marginBottom: 20 }}>
        <div className="line-item-section-header">
          <span>Income Statement Auto-Preview</span>
        </div>
        <p style={{ margin: '8px 0 16px', color: 'var(--color-slate-600)', fontSize: 14 }}>
          As the GP enters monthly line items, Income Statement totals update automatically.
        </p>
        <div className="stat-row" style={{ marginBottom: 0 }}>
          <div className="stat-card">
            <div className="stat-label">Current Month NOI</div>
            <div className={`stat-value ${statementPreview.monthlyNOI < 0 ? 'stat-value--negative' : ''}`}>
              {fmtCurrency(statementPreview.monthlyNOI)}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Current Month Net Income</div>
            <div className={`stat-value ${statementPreview.monthlyNetIncome < 0 ? 'stat-value--negative' : ''}`}>
              {fmtCurrency(statementPreview.monthlyNetIncome)}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">YTD NOI</div>
            <div className={`stat-value ${statementPreview.ytdNOI < 0 ? 'stat-value--negative' : ''}`}>
              {fmtCurrency(statementPreview.ytdNOI)}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">YTD Net Income</div>
            <div className={`stat-value ${statementPreview.ytdNetIncome < 0 ? 'stat-value--negative' : ''}`}>
              {fmtCurrency(statementPreview.ytdNetIncome)}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tab-bar">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tab-btn ${tab === t.id ? 'tab-btn--active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.id === 'distributions' && prefGap > 0.01 && (
              <span className="tab-badge tab-badge--warning">!</span>
            )}
          </button>
        ))}
      </div>

      <div className="card" style={{ marginTop: 0, borderTopLeftRadius: 0 }}>

        {/* ── Tab: P&L ── */}
        {tab === 'pnl' && (
          <div>
            {mf ? (
              <>
                <SectionHeader label="REVENUE" />
                <NumRow label="Gross Potential Rent (GPR)"      value={mfPnl.grossPotentialRent}    onChange={(v) => patchMF('grossPotentialRent', v)}    readOnly={readOnly} />
                <NumRow label="Vacancy Loss"                    value={mfPnl.vacancyLoss}           onChange={(v) => patchMF('vacancyLoss', v)}           readOnly={readOnly} hint="Enter as positive — subtracted from GPR" />
                <NumRow label="Concessions"                     value={mfPnl.concessions}           onChange={(v) => patchMF('concessions', v)}           readOnly={readOnly} hint="Enter as positive — subtracted" />
                <NumRow label="Bad Debt & Credit Loss"          value={mfPnl.badDebt}               onChange={(v) => patchMF('badDebt', v)}               readOnly={readOnly} hint="Enter as positive — subtracted" />
                <NumRow label="Utility Reimbursements (RUBS)"   value={mfPnl.utilityReimbursements} onChange={(v) => patchMF('utilityReimbursements', v)} readOnly={readOnly} />
                <NumRow label="Other Income"                    value={mfPnl.otherIncome}           onChange={(v) => patchMF('otherIncome', v)}           readOnly={readOnly} hint="Parking, laundry, storage, pet fees" />
                <div className="line-item-subtotal">
                  <span>Effective Gross Income (EGI)</span>
                  <span>{fmtCurrency(egi)}</span>
                </div>

                <SectionHeader label="OPERATING EXPENSES" />
                <NumRow label="Property Management Fee"         value={mfPnl.propertyManagementFee}  onChange={(v) => patchMF('propertyManagementFee', v)}  readOnly={readOnly} />
                <NumRow label="Payroll & Benefits"              value={mfPnl.payrollBenefits}        onChange={(v) => patchMF('payrollBenefits', v)}        readOnly={readOnly} />
                <NumRow label="Repairs & Maintenance"           value={mfPnl.repairsMaintenance}     onChange={(v) => patchMF('repairsMaintenance', v)}     readOnly={readOnly} />
                <NumRow label="Make-Ready / Unit Turns"         value={mfPnl.makeReadyTurns}         onChange={(v) => patchMF('makeReadyTurns', v)}         readOnly={readOnly} />
                <NumRow label="Landscaping & Grounds"           value={mfPnl.landscaping}            onChange={(v) => patchMF('landscaping', v)}            readOnly={readOnly} />
                <NumRow label="Utilities — Common Area"         value={mfPnl.utilitiesCommonArea}    onChange={(v) => patchMF('utilitiesCommonArea', v)}    readOnly={readOnly} />
                <NumRow label="Insurance"                       value={mfPnl.insurance}              onChange={(v) => patchMF('insurance', v)}              readOnly={readOnly} />
                <NumRow label="Property Taxes"                  value={mfPnl.propertyTaxes}          onChange={(v) => patchMF('propertyTaxes', v)}          readOnly={readOnly} />
                <NumRow label="Marketing & Advertising"         value={mfPnl.marketingAdvertising}   onChange={(v) => patchMF('marketingAdvertising', v)}   readOnly={readOnly} />
                <NumRow label="Administrative & General"        value={mfPnl.administrativeGeneral}  onChange={(v) => patchMF('administrativeGeneral', v)}  readOnly={readOnly} />
                <NumRow label="Contract Services"               value={mfPnl.contractServices}       onChange={(v) => patchMF('contractServices', v)}       readOnly={readOnly} />
                <div className="line-item-subtotal">
                  <span>Total Operating Expenses</span>
                  <span>{fmtCurrency(totalOpEx)}</span>
                </div>

                <div className="line-item-total">
                  <span>Net Operating Income (NOI)</span>
                  <span className={noi < 0 ? 'text-negative' : ''}>{fmtCurrency(noi)}</span>
                </div>

                <SectionHeader label="PROPERTY STATISTICS (optional)" />
                <NumRow label="Total Rentable Units"            value={mfPnl.totalRentableUnits}     onChange={(v) => patchMF('totalRentableUnits', v)}     readOnly={readOnly} prefix="" />
                <NumRow label="Occupied Units"                  value={mfPnl.occupiedUnits}          onChange={(v) => patchMF('occupiedUnits', v)}          readOnly={readOnly} prefix="" />
                <NumRow label="Average Rent ($/unit/mo)"        value={mfPnl.avgRent}               onChange={(v) => patchMF('avgRent', v)}               readOnly={readOnly} />
              </>
            ) : (
              <>
                <SectionHeader label="REVENUE (USALI Schedules 1–4)" />
                <NumRow label="Rooms Revenue"                   value={htPnl.roomsRevenue}           onChange={(v) => patchHotel('roomsRevenue', v)}          readOnly={readOnly} hint="ADR × rooms sold" />
                <NumRow label="Food & Beverage Revenue"         value={htPnl.foodBeverageRevenue}    onChange={(v) => patchHotel('foodBeverageRevenue', v)}   readOnly={readOnly} />
                <NumRow label="Other Operated Departments"      value={htPnl.otherOperatedDepts}     onChange={(v) => patchHotel('otherOperatedDepts', v)}    readOnly={readOnly} />
                <NumRow label="Miscellaneous Income"            value={htPnl.miscIncome}             onChange={(v) => patchHotel('miscIncome', v)}            readOnly={readOnly} hint="Resort fees, etc." />
                <div className="line-item-subtotal"><span>Total Revenue</span><span>{fmtCurrency(egi)}</span></div>

                <SectionHeader label="DEPARTMENTAL EXPENSES (USALI Schedules 1–3)" />
                <NumRow label="Rooms Expense"                   value={htPnl.roomsExpense}           onChange={(v) => patchHotel('roomsExpense', v)}          readOnly={readOnly} />
                <NumRow label="Food & Beverage Expense"         value={htPnl.foodBeverageExpense}    onChange={(v) => patchHotel('foodBeverageExpense', v)}   readOnly={readOnly} />
                <NumRow label="Other Dept Expense"              value={htPnl.otherDeptExpense}       onChange={(v) => patchHotel('otherDeptExpense', v)}      readOnly={readOnly} />

                <SectionHeader label="UNDISTRIBUTED OPERATING EXPENSES (USALI Schedules 5–9)" />
                <NumRow label="Administrative & General"        value={htPnl.administrativeGeneral}  onChange={(v) => patchHotel('administrativeGeneral', v)} readOnly={readOnly} hint="Sch 5" />
                <NumRow label="Information & Telecom"           value={htPnl.itTelecom}              onChange={(v) => patchHotel('itTelecom', v)}             readOnly={readOnly} hint="Sch 6" />
                <NumRow label="Sales & Marketing"               value={htPnl.salesMarketing}         onChange={(v) => patchHotel('salesMarketing', v)}        readOnly={readOnly} hint="Sch 7" />
                <NumRow label="Property Operations & Maint."    value={htPnl.propertyOperationsMaint} onChange={(v) => patchHotel('propertyOperationsMaint', v)} readOnly={readOnly} hint="Sch 8" />
                <NumRow label="Utilities"                       value={htPnl.utilities}              onChange={(v) => patchHotel('utilities', v)}             readOnly={readOnly} hint="Sch 9" />

                <SectionHeader label="MANAGEMENT & FRANCHISE FEES (USALI Schedule 10)" />
                <NumRow label="Base Management Fee"             value={htPnl.baseManagementFee}      onChange={(v) => patchHotel('baseManagementFee', v)}     readOnly={readOnly} />
                <NumRow label="Incentive Management Fee"        value={htPnl.incentiveManagementFee} onChange={(v) => patchHotel('incentiveManagementFee', v)} readOnly={readOnly} />
                <NumRow label="Franchise / Brand Fee"           value={htPnl.franchiseFee}           onChange={(v) => patchHotel('franchiseFee', v)}          readOnly={readOnly} />
                <NumRow label="Program / Marketing Fee"         value={htPnl.programMarketingFee}    onChange={(v) => patchHotel('programMarketingFee', v)}   readOnly={readOnly} />
                <div className="line-item-total"><span>GOP (before D&amp;A and Debt Service)</span><span>{fmtCurrency(noi)}</span></div>

                <SectionHeader label="PROPERTY STATISTICS (optional)" />
                <NumRow label="Total Rooms"                     value={htPnl.totalRooms}             onChange={(v) => patchHotel('totalRooms', v)}            readOnly={readOnly} prefix="" />
                <NumRow label="Days in Month"                   value={htPnl.daysInMonth}            onChange={(v) => patchHotel('daysInMonth', v)}           readOnly={readOnly} prefix="" />
                <NumRow label="Occupied Rooms"                  value={htPnl.occupiedRooms}          onChange={(v) => patchHotel('occupiedRooms', v)}         readOnly={readOnly} prefix="" />
                <NumRow label="Average Daily Rate (ADR)"        value={htPnl.adr}                   onChange={(v) => patchHotel('adr', v)}                   readOnly={readOnly} />
              </>
            )}
          </div>
        )}

        {/* ── Tab: Below the Line ── */}
        {tab === 'belowline' && (
          <div>
            <div className="info-box" style={{ marginBottom: 20 }}>
              <div className="info-box-title">Auto-calculated from property setup</div>
              <p style={{ margin: 0, fontSize: 14 }}>
                These values are automatically computed from your debt structure and depreciation settings.
                Enable an override only when the actual amount differs (e.g., partial-year depreciation, prepaid interest).
              </p>
            </div>

            <SectionHeader
              label="DEPRECIATION & AMORTIZATION"
              right={
                !readOnly && (
                  <label className="override-toggle">
                    <input type="checkbox" checked={bl.depreciationOverridden}
                      onChange={(e) => patchBelow('depreciationOverridden', e.target.checked)} />
                    <span>Override</span>
                  </label>
                )
              }
            />
            <NumRow
              label="Depreciation (straight-line)"
              value={bl.depreciation}
              onChange={(v) => patchBelow('depreciation', v)}
              readOnly={readOnly || !bl.depreciationOverridden}
              hint={bl.depreciationOverridden ? '' : `Auto: ${fmtCurrency(autoDep)}/mo`}
            />
            <NumRow
              label="Amortization of Deferred Financing Costs"
              value={bl.amortizationFinancingCosts}
              onChange={(v) => patchBelow('amortizationFinancingCosts', v)}
              readOnly={readOnly || !bl.depreciationOverridden}
              hint={bl.depreciationOverridden ? '' : `Auto: ${fmtCurrency(autoFinAmort)}/mo`}
            />

            <SectionHeader
              label="DEBT SERVICE"
              right={
                !readOnly && (
                  <label className="override-toggle">
                    <input type="checkbox" checked={bl.debtServiceOverridden}
                      onChange={(e) => patchBelow('debtServiceOverridden', e.target.checked)} />
                    <span>Override</span>
                  </label>
                )
              }
            />
            <NumRow
              label="Interest"
              value={bl.debtServiceInterest}
              onChange={(v) => patchBelow('debtServiceInterest', v)}
              readOnly={readOnly || !bl.debtServiceOverridden}
              hint={bl.debtServiceOverridden ? '' : `Auto: ${fmtCurrency(autoDebt.interest)}/mo`}
            />
            <NumRow
              label="Principal"
              value={bl.debtServicePrincipal}
              onChange={(v) => patchBelow('debtServicePrincipal', v)}
              readOnly={readOnly || !bl.debtServiceOverridden}
              hint={bl.debtServiceOverridden ? '' : `Auto: ${fmtCurrency(autoDebt.principal)}/mo`}
            />
            <div className="line-item-subtotal">
              <span>Total Debt Service</span>
              <span>{fmtCurrency(bl.debtServiceInterest + bl.debtServicePrincipal)}</span>
            </div>
            {!bl.debtServiceOverridden && (
              <div style={{ fontSize: 12, color: 'var(--color-slate-500)', padding: '4px 0 12px 16px' }}>
                Remaining balance this month: {fmtCurrency(autoDebt.remainingBalance)}
              </div>
            )}

            <SectionHeader
              label="CAPEX & RESERVES"
              right={
                !readOnly && (
                  <label className="override-toggle">
                    <input type="checkbox" checked={bl.capExOverridden}
                      onChange={(e) => patchBelow('capExOverridden', e.target.checked)} />
                    <span>Override</span>
                  </label>
                )
              }
            />
            <NumRow label="Capital Expenditures (CapEx)" value={bl.capEx} onChange={(v) => patchBelow('capEx', v)} readOnly={readOnly} />
            <NumRow label="Replacement Reserve" value={bl.replacementReserve} onChange={(v) => patchBelow('replacementReserve', v)} readOnly={readOnly} />
          </div>
        )}

        {/* ── Tab: Working Capital ── */}
        {tab === 'workingcapital' && (
          <div>
            <div className="info-box" style={{ marginBottom: 20 }}>
              <div className="info-box-title">Cash Flow Statement inputs (ASC 230 indirect method)</div>
              <p style={{ margin: 0, fontSize: 14 }}>
                These working capital changes drive the operating, investing, and financing sections of the
                Statement of Cash Flows. Increases in assets are negative; increases in liabilities are positive.
                Leave as 0 if unchanged.
              </p>
            </div>

            <SectionHeader label="OPERATING — WORKING CAPITAL CHANGES" />
            <NumRow label="Change in Accounts Receivable"   value={wc.changeInAccountsReceivable} onChange={(v) => patchWC('changeInAccountsReceivable', v)} readOnly={readOnly} hint="Negative = AR increased (cash use)" />
            <NumRow label="Change in Prepaid Expenses"      value={wc.changeInPrepaidExpenses}    onChange={(v) => patchWC('changeInPrepaidExpenses', v)}    readOnly={readOnly} hint="Negative = prepaid increased" />
            <NumRow label="Change in Accounts Payable"      value={wc.changeInAccountsPayable}    onChange={(v) => patchWC('changeInAccountsPayable', v)}    readOnly={readOnly} hint="Positive = AP increased (source)" />
            <NumRow label="Change in Accrued Liabilities"   value={wc.changeInAccruedLiabilities} onChange={(v) => patchWC('changeInAccruedLiabilities', v)} readOnly={readOnly} />
            <NumRow label="Change in Security Deposits Held" value={wc.changeInSecurityDeposits}  onChange={(v) => patchWC('changeInSecurityDeposits', v)}   readOnly={readOnly} />
            <NumRow label="Other Operating Adjustments"     value={wc.otherOperatingAdjustments}  onChange={(v) => patchWC('otherOperatingAdjustments', v)}  readOnly={readOnly} />

            <SectionHeader label="INVESTING" />
            <NumRow label="Proceeds from Sale of Assets"    value={wc.proceedsFromSaleOfAssets}   onChange={(v) => patchWC('proceedsFromSaleOfAssets', v)}   readOnly={readOnly} />
            <NumRow label="Other Investing Activities"      value={wc.otherInvestingActivities}   onChange={(v) => patchWC('otherInvestingActivities', v)}   readOnly={readOnly} />

            <SectionHeader label="FINANCING" />
            <NumRow label="Proceeds from New Borrowings"    value={wc.proceedsFromNewBorrowings}  onChange={(v) => patchWC('proceedsFromNewBorrowings', v)}  readOnly={readOnly} />
            <NumRow label="Capital Contributions"           value={wc.capitalContributions}       onChange={(v) => patchWC('capitalContributions', v)}       readOnly={readOnly} />
            <NumRow label="Other Financing Activities"      value={wc.otherFinancingActivities}   onChange={(v) => patchWC('otherFinancingActivities', v)}   readOnly={readOnly} />
          </div>
        )}

        {/* ── Tab: Balance Sheet (Schedule L) ── */}
        {tab === 'balancesheet' && (
          <div>
            <div className="info-box" style={{ marginBottom: 20 }}>
              <div className="info-box-title">IRS Form 1065 — Schedule L format</div>
              <p style={{ margin: 0, fontSize: 14 }}>
                Book-basis Schedule L snapshot for this monthly entry, with Beginning of Year (BOY)
                and End of Month (EOM) columns.
              </p>
            </div>

            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 70 }}>Line</th>
                  <th>Description</th>
                  <th style={{ textAlign: 'right', width: 170 }}>BOY</th>
                  <th style={{ textAlign: 'right', width: 170 }}>EOM</th>
                </tr>
              </thead>
              <tbody>
                {scheduleLRows.rows.map((row) => (
                  <tr key={`sched-l-${row.lineNo}`} style={row.total ? { fontWeight: 700 } : undefined}>
                    <td>{row.lineNo}</td>
                    <td>{row.label}</td>
                    <td style={{ textAlign: 'right' }}>{fmtAccounting(row.boy)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtAccounting(row.eom)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {(Math.abs(scheduleLRows.imbalanceBoy) > 1 || Math.abs(scheduleLRows.imbalanceEom) > 1) && (
              <div className="pref-gap-alert" style={{ marginTop: 16 }}>
                <div className="pref-gap-alert-icon">⚠</div>
                <div>
                  <div className="pref-gap-alert-title">Schedule L out-of-balance check</div>
                  <div className="pref-gap-alert-body">
                    BOY variance: {fmtAccounting(scheduleLRows.imbalanceBoy)} · EOM variance: {fmtAccounting(scheduleLRows.imbalanceEom)}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Distributions ── */}
        {tab === 'distributions' && (
          <div>
            {/* Pref gap alert */}
            {prefGap > 0.01 && (
              <div className="pref-gap-alert">
                <div className="pref-gap-alert-icon">⚠</div>
                <div>
                  <div className="pref-gap-alert-title">Behind on LP Preferred Return</div>
                  <div className="pref-gap-alert-body">
                    Calculated LP pref this month: {fmtCurrency(dist.calculatedLPPref)}.
                    Actual paid: {fmtCurrency(dist.actualLPDistribution)}.
                    Gap: <strong>{fmtCurrency(prefGap)}</strong> — this accrues on the LP's account.
                  </div>
                </div>
              </div>
            )}
            {isOverpaid && (
              <div className="state-banner state-banner--success" style={{ marginBottom: 20 }}>
                <span>✓</span> LP distribution this month exceeds calculated pref by {fmtCurrency(Math.abs(prefGap))}.
              </div>
            )}

            <SectionHeader label="LP PREFERRED RETURN" />
            <NumRow
              label="Calculated LP Pref (auto)"
              value={dist.calculatedLPPref}
              readOnly
              hint={`LP Equity × Annual Pref Rate ÷ 12 = ${fmtCurrency(autoLPPref)}/mo`}
            />

            <div className="line-item-row line-item-row--highlight">
              <div className="line-item-label">
                <span>Actual LP Distribution Paid</span>
                <span className="line-item-hint">GP edits this — leave equal to calculated if pref was fully paid</span>
              </div>
              <div className="line-item-input">
                <span className="field-adornment">$</span>
                {readOnly ? (
                  <div className="line-item-readonly">{dist.actualLPDistribution.toLocaleString()}</div>
                ) : (
                  <input
                    type="number"
                    className="field-input field-input--sm"
                    value={dist.actualLPDistribution || ''}
                    min={0}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value) || 0
                      patchDist('actualLPDistribution', v)
                      patchDist('isOverridden', v !== dist.calculatedLPPref)
                    }}
                  />
                )}
              </div>
            </div>

            {dist.isOverridden && !readOnly && (
              <div className="field-group" style={{ padding: '8px 16px 16px' }}>
                <label className="field-label" style={{ fontSize: 12 }}>Note explaining deviation (stored with entry)</label>
                <input
                  type="text"
                  className="field-input"
                  placeholder="e.g. Cash flow insufficient — pref deferred to next quarter"
                  value={dist.overrideNote}
                  onChange={(e) => patchDist('overrideNote', e.target.value)}
                />
              </div>
            )}

            <div className="line-item-subtotal">
              <span>Pref Gap (Calculated − Actual)</span>
              <span className={prefGap > 0.01 ? 'text-warning' : ''}>
                {prefGap > 0.01 ? `${fmtCurrency(prefGap)} (behind)` : prefGap < -0.01 ? `${fmtCurrency(Math.abs(prefGap))} (ahead)` : '—'}
              </span>
            </div>

            <SectionHeader label="GP DISTRIBUTIONS" />
            <NumRow label="Actual GP Distribution Paid" value={dist.actualGPDistribution} onChange={(v) => patchDist('actualGPDistribution', v)} readOnly={readOnly} hint="Includes GP co-invest share + promote" />

            <div className="line-item-total">
              <span>Total Distributions</span>
              <span>{fmtCurrency(dist.actualLPDistribution + dist.actualGPDistribution)}</span>
            </div>

            <SectionHeader label="NOTES" />
            <div className="field-group" style={{ padding: '8px 16px 16px' }}>
              {readOnly ? (
                <p style={{ fontSize: 14, color: 'var(--color-slate-600)' }}>{entry.notes || 'No notes.'}</p>
              ) : (
                <textarea
                  className="field-input"
                  rows={3}
                  style={{ resize: 'vertical' }}
                  placeholder="Any notes for this period…"
                  value={entry.notes}
                  onChange={(e) => setEntry((prev) => ({ ...prev, notes: e.target.value }))}
                />
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        {!readOnly && (
          <div style={{ display: 'flex', gap: 12, marginTop: 24, borderTop: '1px solid var(--color-slate-200)', paddingTop: 20 }}>
            {onCancel && (
              <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
            )}
          {existingEntry && (
            <button
              type="button"
              className="btn btn-danger"
              disabled={saving}
              onClick={handleDeleteEntry}
            >
              Delete Entry
            </button>
          )}
            <button type="button" className="btn btn-primary" disabled={saving} onClick={handleSave}>
              {saving ? 'Saving…' : 'Save Entry'}
            </button>
          </div>
        )}
      </div>

      {!readOnly && (
        <SpreadsheetImportModal
          open={showImportModal}
          assetClass={property.assetClass}
          period={period}
          onClose={() => setShowImportModal(false)}
          onApply={applyImportResults}
        />
      )}
    </div>
  )
}
