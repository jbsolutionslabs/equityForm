import React, { useMemo, useState } from 'react'
import type { DebtInstrument, LoanPosition } from '../../state/economicsTypes'
import { fmtCurrency } from '../../utils/financialComputations'
import { CurrencyInput } from './CurrencyInput'
import {
  extractTextFromDebtDocument,
  importDebtInstrumentsFromText,
  type ImportedDebtInstrumentCandidate,
} from '../../server/imports/debtDocumentImport'

type CandidateDraft = ImportedDebtInstrumentCandidate & {
  include: boolean
}

type Props = {
  open: boolean
  onClose: () => void
  onApply: (instruments: Omit<DebtInstrument, 'id'>[]) => void
}

const positionOptions: Array<{ value: LoanPosition; label: string }> = [
  { value: 'senior', label: 'Senior' },
  { value: 'subordinate', label: 'Subordinate (Mezz)' },
  { value: 'pref_equity', label: 'Preferred Equity' },
]

export const DebtInstrumentImportModal: React.FC<Props> = ({ open, onClose, onApply }) => {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rawText, setRawText] = useState('')
  const [candidates, setCandidates] = useState<CandidateDraft[]>([])

  const includedCount = useMemo(() => candidates.filter(c => c.include).length, [candidates])

  if (!open) return null

  const reset = () => {
    setFile(null)
    setLoading(false)
    setError(null)
    setRawText('')
    setCandidates([])
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleScan = async () => {
    if (!file) {
      setError('Please upload a PDF or DOCX file first.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const text = await extractTextFromDebtDocument(file)
      setRawText(text)
      const parsed = importDebtInstrumentsFromText(text)
      setCandidates(parsed.map((entry) => ({ ...entry, include: true })))
      if (!parsed.length) {
        setError('No debt instrument candidates were detected. Try another document or add manually.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse debt document.')
    } finally {
      setLoading(false)
    }
  }

  const patchCandidate = (index: number, patch: Partial<CandidateDraft>) => {
    setCandidates(prev => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }

  const patchInstrument = (index: number, patch: Partial<DebtInstrument>) => {
    setCandidates(prev => prev.map((item, i) => {
      if (i !== index) return item
      return { ...item, instrument: { ...item.instrument, ...patch } }
    }))
  }

  const apply = () => {
    const selected = candidates.filter(c => c.include).map(c => c.instrument)
    if (!selected.length) {
      setError('Select at least one instrument to import.')
      return
    }
    onApply(selected)
    handleClose()
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="debt-import-title">
      <div className="modal modal--wide">
        <div className="modal-header">
          <h2 id="debt-import-title" className="modal-title">Import Debt Instruments</h2>
        </div>

        <div className="modal-body">
          <div className="field-group">
            <label className="field-label">Upload term sheet / agreement (.pdf, .docx)</label>
            <input
              type="file"
              className="field-input"
              accept=".pdf,.docx"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </div>

          {error && <div className="notification notification--error">⚠ {error}</div>}

          {candidates.length > 0 && (
            <div className="import-results" style={{ marginTop: 12 }}>
              <div className="import-results-header">Review extracted instruments ({includedCount} selected)</div>
              <div className="import-results-list">
                {candidates.map((candidate, index) => (
                  <div key={`${candidate.title}-${index}`} className="import-results-month">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <div className="import-results-month-title">{candidate.title}</div>
                      <label className="checkbox-row" style={{ whiteSpace: 'nowrap' }}>
                        <input
                          type="checkbox"
                          checked={candidate.include}
                          onChange={(e) => patchCandidate(index, { include: e.target.checked })}
                        />
                        Import
                      </label>
                    </div>
                    <p className="field-hint" style={{ marginTop: 6 }}>
                      Confidence: {(candidate.confidence * 100).toFixed(0)}% · {candidate.sourceExcerpt}
                    </p>
                    <p className="field-hint" style={{ marginTop: 4 }}>
                      Extracted amount: <strong>{fmtCurrency(candidate.instrument.loanAmount ?? 0)}</strong>
                    </p>

                    <div className="instrument-form-grid" style={{ marginTop: 8 }}>
                      <div className="field-group">
                        <label className="field-label">Lender</label>
                        <input
                          type="text"
                          className="field-input"
                          value={candidate.instrument.lender ?? ''}
                          onChange={(e) => patchInstrument(index, { lender: e.target.value })}
                        />
                      </div>
                      <div className="field-group">
                        <label className="field-label">Position</label>
                        <select
                          className="field-input"
                          value={candidate.instrument.position}
                          onChange={(e) => patchInstrument(index, { position: e.target.value as LoanPosition })}
                        >
                          {positionOptions.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="field-group">
                        <label className="field-label">Amount ($)</label>
                        <CurrencyInput
                          className="field-input"
                          value={candidate.instrument.loanAmount || 0}
                          onChange={(value) => patchInstrument(index, { loanAmount: value || 0 })}
                        />
                      </div>
                      <div className="field-group">
                        <label className="field-label">Term (years)</label>
                        <input
                          type="number"
                          className="field-input"
                          value={candidate.instrument.termYears || ''}
                          onChange={(e) => patchInstrument(index, { termYears: Number(e.target.value) || 0 })}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!!rawText && (
            <details style={{ marginTop: 12 }}>
              <summary className="field-label" style={{ cursor: 'pointer' }}>Show extracted text</summary>
              <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 180, overflow: 'auto', fontSize: 12 }}>{rawText.slice(0, 4000)}</pre>
            </details>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={handleClose} disabled={loading}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={handleScan} disabled={loading || !file}>
            {loading ? 'Parsing…' : 'Extract Debt Terms'}
          </button>
          <button type="button" className="btn btn-primary" onClick={apply} disabled={!candidates.length || loading}>
            Apply Selected
          </button>
        </div>
      </div>
    </div>
  )
}
