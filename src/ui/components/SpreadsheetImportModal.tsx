import React, { useMemo, useState, useEffect, useRef } from 'react'
import { importSpreadsheetApi } from '../../api/importSpreadsheet'
import { detectMonths } from '../../server/imports/detectMonths'
import { runMultiMonthImport } from '../../server/imports/runMultiMonthImport'
import { parseWorkbook } from '../../server/imports/workbook/parseWorkbook'
import { importFieldRules } from '../../server/imports/mapping/fieldRules'
import type { AssetClass } from '../../state/accountingTypes'
import type {
  DetectedMonthColumn,
  ImportMode,
  ImportedFieldResult,
  MultiMonthImportResult,
  ParsedWorkbook,
} from '../../server/types/importTypes'
import { ImportReviewTable } from './ImportReviewTable'
import { MonthSelector, type MonthOption } from './MonthSelector'
import { formatMonthLabel } from '../../utils/formatMonthLabel'

type Props = {
  open: boolean
  assetClass: AssetClass
  period: string
  onClose: () => void
  onApply: (result: MultiMonthImportResult) => void
}

const importModes: { value: ImportMode; label: string; hint: string }[] = [
  { value: 'LATEST_MONTH', label: 'Latest Month', hint: 'Use current month figures.' },
  { value: 'AVERAGE_MONTH', label: 'Average Month', hint: 'Use monthly averages.' },
  { value: 'YTD_TOTAL', label: 'Year-to-Date Total', hint: 'Totals since year start.' },
  { value: 'ANNUALIZED', label: 'Annualized', hint: 'Annual totals divided by 12.' },
]

type ImportStep = 'upload' | 'selectMonths' | 'review'

type MonthOptionWithSource = MonthOption & { source: DetectedMonthColumn }

const buildMonthOptions = (detectedMonths: DetectedMonthColumn[]) => {
  const seen = new Set<string>()
  const options: MonthOptionWithSource[] = []
  const warnings: string[] = []

  detectedMonths.forEach((month) => {
    if (seen.has(month.normalizedMonthKey)) {
      warnings.push(`Duplicate month detected for ${formatMonthLabel(month.normalizedMonthKey)}; using first column.`)
      return
    }
    seen.add(month.normalizedMonthKey)
    options.push({
      key: month.normalizedMonthKey,
      label: formatMonthLabel(month.normalizedMonthKey),
      detail: `${month.sheetName} · ${month.rawHeader}`,
      source: month,
    })
  })

  return { options, warnings }
}

export const SpreadsheetImportModal: React.FC<Props> = ({ open, assetClass, period, onClose, onApply }) => {
  const [file, setFile] = useState<File | null>(null)
  const [importMode, setImportMode] = useState<ImportMode>('LATEST_MONTH')
  const [resultsByMonth, setResultsByMonth] = useState<Record<string, ImportedFieldResult[]>>({})
  const [monthOptions, setMonthOptions] = useState<MonthOptionWithSource[]>([])
  const [selectedMonths, setSelectedMonths] = useState<string[]>([])
  const [step, setStep] = useState<ImportStep>('upload')
  const [parsedWorkbook, setParsedWorkbook] = useState<ParsedWorkbook | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])

  const overlayRef = useRef<HTMLDivElement | null>(null)

  const ruleMap = useMemo(() => {
    return importFieldRules.reduce<Record<string, typeof importFieldRules[number]>>((acc, rule) => {
      acc[rule.fieldKey] = rule
      return acc
    }, {})
  }, [])

  useEffect(() => {
    if (open && overlayRef.current) {
      overlayRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [open])
  
  if (!open) return null

  const resetFlow = () => {
    setMonthOptions([])
    setSelectedMonths([])
    setParsedWorkbook(null)
    setResultsByMonth({})
    setWarnings([])
    setError(null)
    setStep('upload')
  }

  const handleFileChange = (nextFile: File | null) => {
    setFile(nextFile)
    resetFlow()
  }

  const handleScan = async () => {
    if (!file) {
      setError('Please select a spreadsheet file first.')
      return
    }

    setLoading(true)
    setError(null)
    setWarnings([])
    setResultsByMonth({})

    try {
      const parsed = await parseWorkbook(file, file.name)
      setParsedWorkbook(parsed)
      const months = detectMonths(parsed)
      console.info('[SpreadsheetImport] Detected month columns:', months)

      const { options, warnings: monthWarnings } = buildMonthOptions(months)
      setMonthOptions(options)
      if (monthWarnings.length) {
        setWarnings(monthWarnings)
      }

      if (!options.length) {
        setWarnings((prev) => ([...prev, 'No month columns were detected. Importing values using default behavior.']))
        const response = await importSpreadsheetApi({ file, importMode, assetClass })
        setResultsByMonth({ [period]: response.fields })
        setWarnings((prev) => [...prev, ...response.warnings])
        setStep('review')
        return
      }

      if (options.length === 1) {
        setSelectedMonths([options[0].key])
        const response = await runMultiMonthImport({
          file,
          importMode,
          assetClass,
          selectedMonths: [options[0].source],
          parsedWorkbook: parsed,
        })
        setResultsByMonth(response.months)
        setWarnings((prev) => [...prev, ...response.warnings])
        setStep('review')
        return
      }

      setStep('selectMonths')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to scan spreadsheet.')
    } finally {
      setLoading(false)
    }
  }

  const handleImportSelected = async () => {
    if (!file) {
      setError('Please select a spreadsheet file first.')
      return
    }

    if (!selectedMonths.length) {
      setError('Select at least one month to import.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const selectedSources = monthOptions
        .filter((option) => selectedMonths.includes(option.key))
        .map((option) => option.source)

      const response = await runMultiMonthImport({
        file,
        importMode,
        assetClass,
        selectedMonths: selectedSources,
        parsedWorkbook: parsedWorkbook ?? undefined,
      })

      setResultsByMonth(response.months)
      setWarnings((prev) => [...prev, ...response.warnings])
      setStep('review')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import selected months.')
    } finally {
      setLoading(false)
    }
  }

  const updateValue = (
    monthKey: string,
    fieldKey: string,
    value: number | string | boolean | null,
  ) => {
    setResultsByMonth((prev) => ({
      ...prev,
      [monthKey]: prev[monthKey].map((field) => (
        field.fieldKey === fieldKey ? { ...field, value } : field
      )),
    }))
  }

  const applyValues = () => {
    onApply({ months: resultsByMonth, warnings })
    onClose()
  }

  const hasResults = Object.keys(resultsByMonth).length > 0

  return (
    <div
      ref={overlayRef}
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="spreadsheet-import-title"
    >
      <div className="modal modal--wide">
        <div className="modal-header">
          <h2 id="spreadsheet-import-title" className="modal-title">Import from Spreadsheet</h2>
        </div>
        <div className="modal-body">
          <div className="field-group">
            <label className="field-label">Spreadsheet file (.xlsx, .xls, .csv)</label>
            <input
              type="file"
              className="field-input"
              accept=".xlsx,.xls,.csv"
              onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
            />
          </div>

          <div className="field-group">
            <label className="field-label">Import mode</label>
            <select
              className="field-input"
              value={importMode}
              onChange={(event) => setImportMode(event.target.value as ImportMode)}
            >
              {importModes.map((mode) => (
                <option key={mode.value} value={mode.value}>{mode.label}</option>
              ))}
            </select>
            <div className="field-help">{importModes.find((mode) => mode.value === importMode)?.hint}</div>
          </div>

          {error && <div className="notification notification--error" role="alert">⚠ {error}</div>}
          {warnings.map((warning) => (
            <div key={warning} className="notification notification--warning" role="alert">⚠ {warning}</div>
          ))}

          {step === 'selectMonths' && (
            <div className="import-months">
              <div className="import-results-header">Select months to import</div>
              <MonthSelector
                options={monthOptions}
                selectedKeys={selectedMonths}
                onChange={setSelectedMonths}
                disabled={loading}
              />
            </div>
          )}

          {step === 'review' && (
            <ImportReviewTable
              resultsByMonth={resultsByMonth}
              ruleMap={ruleMap}
              onUpdateValue={updateValue}
            />
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
          {step === 'upload' && (
            <button type="button" className="btn btn-primary" onClick={handleScan} disabled={loading}>
              {loading ? 'Scanning…' : 'Scan Workbook'}
            </button>
          )}
          {step === 'selectMonths' && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleImportSelected}
              disabled={loading || !selectedMonths.length}
            >
              {loading ? 'Importing…' : 'Import Selected Months'}
            </button>
          )}
          {step === 'review' && (
            <button type="button" className="btn btn-primary" onClick={applyValues} disabled={!hasResults || loading}>
              Apply Values
            </button>
          )}
        </div>
      </div>
    </div>
  )
}