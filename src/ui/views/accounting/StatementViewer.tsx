import React, { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import {
  computeIncomeStatement,
  computeBalanceSheet,
  computeCashFlowStatement,
  periodLabel,
  fmtAccounting,
} from '../../../utils/financialComputations'
import type {
  AccountingProperty,
  MonthlyEntry,
  ComputedStatement,
  StatementRow,
  PeriodSelection,
} from '../../../state/accountingTypes'

type StatementTab = 'is' | 'bs' | 'cfs'

type Props = {
  property: AccountingProperty
  entries:  MonthlyEntry[]
}

const CURRENT_YEAR = new Date().getFullYear()

/* ─── Period options ── */

function buildPeriodOptions(entries: MonthlyEntry[]) {
  const years = [...new Set(entries.map((e) => parseInt(e.period.split('-')[0])))].sort()
  if (years.length === 0) years.push(CURRENT_YEAR)
  return years
}

/* ─── Period selector ── */

function PeriodSelector({
  sel,
  onChange,
  availableYears,
}: {
  sel: PeriodSelection
  onChange: (s: PeriodSelection) => void
  availableYears: number[]
}) {
  return (
    <div className="period-selector">
      <div className="period-selector-group">
        <label className="period-selector-label">View</label>
        <div className="toggle-group">
          {(['month', 'quarter', 'year'] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={`toggle-btn toggle-btn--sm ${sel.type === t ? 'toggle-btn--active' : ''}`}
              onClick={() => onChange({ ...sel, type: t })}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="period-selector-group">
        <label className="period-selector-label">Year</label>
        <select
          className="field-input field-input--sm"
          value={sel.year}
          onChange={(e) => onChange({ ...sel, year: parseInt(e.target.value) })}
        >
          {availableYears.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {sel.type === 'quarter' && (
        <div className="period-selector-group">
          <label className="period-selector-label">Quarter</label>
          <div className="toggle-group">
            {([1, 2, 3, 4] as const).map((q) => (
              <button
                key={q}
                type="button"
                className={`toggle-btn toggle-btn--sm ${sel.quarter === q ? 'toggle-btn--active' : ''}`}
                onClick={() => onChange({ ...sel, quarter: q })}
              >
                Q{q}
              </button>
            ))}
          </div>
        </div>
      )}

      {sel.type === 'month' && (
        <div className="period-selector-group">
          <label className="period-selector-label">Month</label>
          <select
            className="field-input field-input--sm"
            value={sel.month ?? 1}
            onChange={(e) => onChange({ ...sel, month: parseInt(e.target.value) })}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {new Date(2000, m - 1).toLocaleDateString('en-US', { month: 'long' })}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}

/* ─── Statement row renderer ── */

function StatementRowRenderer({ row }: { row: StatementRow }) {
  if (row.type === 'spacer') return <div className="stmt-spacer" />
  if (row.type === 'note')   return <div className="stmt-note">{row.label}</div>
  if (row.type === 'header') return <div className="stmt-header">{row.label}</div>

  const formattedValue = row.value !== null ? fmtAccounting(row.value) : ''
  const isNegative     = (row.value ?? 0) < 0

  return (
    <div
      className={[
        'stmt-row',
        `stmt-row--${row.type}`,
        row.bold ? 'stmt-row--bold' : '',
        isNegative ? 'stmt-row--negative' : '',
      ].filter(Boolean).join(' ')}
    >
      <div className="stmt-row-label">
        {row.label}
        {row.note && <span className="stmt-row-note">{row.note}</span>}
      </div>
      <div className="stmt-row-value">{formattedValue}</div>
    </div>
  )
}

function StatementDisplay({ stmt }: { stmt: ComputedStatement }) {
  return (
    <div className="stmt-document">
      <div className="stmt-header-block">
        <div className="stmt-entity">{stmt.entity}</div>
        {stmt.ein && <div className="stmt-ein">EIN: {stmt.ein}</div>}
        <div className="stmt-title">{stmt.title}</div>
        <div className="stmt-subtitle">{stmt.subtitle}</div>
        <div className="stmt-period">{stmt.period}</div>
      </div>
      <div className="stmt-body">
        {stmt.rows.map((row) => (
          <StatementRowRenderer key={row.key} row={row} />
        ))}
      </div>
    </div>
  )
}

/* ─── Excel export ── */

const ACCT_FMT = '"$"#,##0_);[Red]("$"#,##0)'  // accounting: positive normal, negative red in parens

function stmtToSheet(stmt: ComputedStatement): XLSX.WorkSheet {
  type Cell = XLSX.CellObject

  // Build rows as [label cell, value cell]
  const sheetRows: Cell[][] = []

  const push = (label: string, value?: number | null, opts?: {
    bold?: boolean
    indent?: number
    italic?: boolean
    headerBg?: boolean
  }) => {
    const indent = '  '.repeat(opts?.indent ?? 0)
    const labelCell: Cell = {
      t: 's',
      v: indent + label,
      s: {
        font:      { bold: opts?.bold, italic: opts?.italic, sz: opts?.bold ? 11 : 10 },
        alignment: { vertical: 'center' },
      },
    }
    if (value !== undefined && value !== null) {
      const valueCell: Cell = {
        t: 'n',
        v: value,
        z: ACCT_FMT,
        s: {
          font:      { bold: opts?.bold, sz: opts?.bold ? 11 : 10 },
          numFmt:    ACCT_FMT,
          alignment: { horizontal: 'right', vertical: 'center' },
        },
      }
      sheetRows.push([labelCell, valueCell])
    } else {
      sheetRows.push([labelCell, { t: 's', v: '', s: {} }])
    }
  }

  const blank = () => sheetRows.push([{ t: 's', v: '', s: {} }, { t: 's', v: '', s: {} }])

  // Document header
  push(stmt.entity,   undefined, { bold: true })
  if (stmt.ein)  push(`EIN: ${stmt.ein}`, undefined, { italic: true })
  push(stmt.title,    undefined, { bold: true })
  push(stmt.subtitle, undefined, { italic: true })
  push(stmt.period,   undefined, { italic: true })
  blank()

  // Statement rows
  for (const row of stmt.rows) {
    switch (row.type) {
      case 'spacer':
        blank()
        break
      case 'note':
        push(row.label, undefined, { italic: true })
        break
      case 'header':
        push(row.label, undefined, { bold: true })
        break
      case 'line':
        push(
          row.note ? `${row.label}  (${row.note})` : row.label,
          row.value,
        )
        break
      case 'indent':
        push(
          row.note ? `${row.label}  (${row.note})` : row.label,
          row.value,
          { indent: 1 },
        )
        break
      case 'subtotal':
        push(row.label, row.value, { bold: true })
        break
      case 'total':
        push(row.label, row.value, { bold: true })
        break
    }
  }

  // Build worksheet from cell array
  const ws: XLSX.WorkSheet = {}
  let maxRow = sheetRows.length

  sheetRows.forEach((cols, r) => {
    cols.forEach((cell, c) => {
      const addr = XLSX.utils.encode_cell({ r, c })
      ws[addr] = cell
    })
  })

  ws['!ref']  = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxRow - 1, c: 1 } })
  ws['!cols'] = [{ wch: 58 }, { wch: 16 }]

  return ws
}

function exportAllToExcel(
  property: AccountingProperty,
  entries: MonthlyEntry[],
  sel: PeriodSelection,
) {
  const period = periodLabel(sel)
  const safeName = property.name.replace(/[^\w\s]/g, '').replace(/\s+/g, '_')
  const safePeriod = period.replace(/[^\w\s]/g, '').replace(/\s+/g, '_')
  const filename = `${safeName}_Financials_${safePeriod}.xlsx`

  const is  = computeIncomeStatement(property, entries, sel)
  const bs  = computeBalanceSheet(property, entries, sel)
  const cfs = computeCashFlowStatement(property, entries, sel)

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, stmtToSheet(is),  'Income Statement')
  XLSX.utils.book_append_sheet(wb, stmtToSheet(bs),  'Balance Sheet')
  XLSX.utils.book_append_sheet(wb, stmtToSheet(cfs), 'Cash Flows')

  XLSX.writeFile(wb, filename)
}

/* ─── Main component ── */

export const StatementViewer: React.FC<Props> = ({ property, entries }) => {
  const [activeTab, setActiveTab] = useState<StatementTab>('is')
  const [sel, setSel] = useState<PeriodSelection>({
    type:    'year',
    year:    CURRENT_YEAR,
    month:   new Date().getMonth() + 1,
    quarter: Math.ceil((new Date().getMonth() + 1) / 3) as 1 | 2 | 3 | 4,
  })
  const [exportingPdf,  setExportingPdf]  = useState(false)
  const [exportingXlsx, setExportingXlsx] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)

  const availableYears = buildPeriodOptions(entries)

  const statement: ComputedStatement = (() => {
    if (activeTab === 'is')  return computeIncomeStatement(property, entries, sel)
    if (activeTab === 'bs')  return computeBalanceSheet(property, entries, sel)
    return computeCashFlowStatement(property, entries, sel)
  })()

  const handleExportPDF = async () => {
    if (!printRef.current) return
    setExportingPdf(true)
    try {
      const html2pdf = (await import('html2pdf.js')).default
      const safeName   = property.name.replace(/\s+/g, '_')
      const safePeriod = periodLabel(sel).replace(/\s+/g, '_')
      const filename   = `${safeName}_${activeTab.toUpperCase()}_${safePeriod}.pdf`
      await html2pdf()
        .set({
          margin:      [12, 12, 12, 12],
          filename,
          image:       { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF:       { unit: 'mm', format: 'letter', orientation: 'portrait' },
          pagebreak:   { mode: ['avoid-all', 'css', 'legacy'] },
        })
        .from(printRef.current)
        .save()
    } finally {
      setExportingPdf(false)
    }
  }

  const handleExportExcel = () => {
    setExportingXlsx(true)
    try {
      exportAllToExcel(property, entries, sel)
    } finally {
      setExportingXlsx(false)
    }
  }

  const TABS: { id: StatementTab; label: string }[] = [
    { id: 'is',  label: 'Income Statement' },
    { id: 'bs',  label: 'Balance Sheet' },
    { id: 'cfs', label: 'Cash Flows' },
  ]

  const noData = entries.length === 0

  return (
    <div>
      {/* Controls row */}
      <div className="stmt-controls">
        <div className="tab-bar" style={{ marginBottom: 0, borderBottom: 'none' }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`tab-btn ${activeTab === t.id ? 'tab-btn--active' : ''}`}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <PeriodSelector sel={sel} onChange={setSel} availableYears={availableYears} />
          <div className="export-btn-group">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={exportingPdf || noData}
              onClick={handleExportPDF}
              title="Download current statement as PDF"
            >
              {exportingPdf ? 'Exporting…' : '↓ PDF'}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={exportingXlsx || noData}
              onClick={handleExportExcel}
              title="Download all 3 statements as Excel workbook (3 tabs)"
            >
              {exportingXlsx ? 'Exporting…' : '↓ Excel'}
            </button>
          </div>
        </div>
      </div>

      {noData ? (
        <div className="empty-state" style={{ padding: 60, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>No entries yet</div>
          <div style={{ color: 'var(--color-slate-500)', fontSize: 14 }}>
            Add monthly line-item entries to generate financial statements.
          </div>
        </div>
      ) : (
        <div ref={printRef}>
          <StatementDisplay stmt={statement} />
        </div>
      )}
    </div>
  )
}
