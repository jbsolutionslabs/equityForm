import React from 'react'
import { fieldLabelMap, importFieldRules } from '../../server/imports/mapping/fieldRules'
import type { ImportFieldRule, ImportedFieldResult } from '../../server/types/importTypes'
import { formatMonthLabel } from '../../utils/formatMonthLabel'

type Props = {
  resultsByMonth: Record<string, ImportedFieldResult[]>
  ruleMap: Record<string, ImportFieldRule>
  onUpdateValue: (monthKey: string, fieldKey: string, value: number | string | boolean | null) => void
}

const confidenceLabel = (confidence: number) => {
  if (confidence >= 0.9) return 'High'
  if (confidence >= 0.7) return 'Medium'
  return 'Low'
}

const confidenceClass = (confidence: number) => {
  if (confidence >= 0.9) return 'confidence-badge confidence-badge--high'
  if (confidence >= 0.7) return 'confidence-badge confidence-badge--medium'
  return 'confidence-badge confidence-badge--low'
}

const renderInput = (
  rule: ImportFieldRule | undefined,
  field: ImportedFieldResult,
  onChange: (value: number | string | boolean | null) => void,
) => {
  if (rule?.type === 'boolean') {
    return (
      <input
        type="checkbox"
        checked={Boolean(field.value)}
        onChange={(event) => onChange(event.target.checked)}
      />
    )
  }

  return (
    <input
      type={rule?.type === 'string' ? 'text' : 'number'}
      className="field-input field-input--sm"
      value={
        rule?.type === 'string'
          ? (typeof field.value === 'string' ? field.value : '')
          : (typeof field.value === 'number' ? field.value : '')
      }
      onChange={(event) => {
        const raw = event.target.value
        onChange(rule?.type === 'string' ? raw : (raw ? Number(raw) : null))
      }}
    />
  )
}

export const ImportReviewTable: React.FC<Props> = ({ resultsByMonth, ruleMap, onUpdateValue }) => {
  const entries = Object.entries(resultsByMonth).sort(([a], [b]) => a.localeCompare(b))

  if (!entries.length) {
    return (
      <div className="import-results-empty">
        No results to review yet.
      </div>
    )
  }

  return (
    <div className="import-results">
      <div className="import-results-header">Review imported values</div>
      <div className="import-results-list">
        {entries.map(([monthKey, fields]) => (
          <div key={monthKey} className="import-results-month">
            <div className="import-results-month-title">{formatMonthLabel(monthKey)}</div>
            {fields.map((field) => {
              const rule = ruleMap[field.fieldKey]
              const label = fieldLabelMap[field.fieldKey] ?? field.fieldKey
              return (
                <div key={`${monthKey}-${field.fieldKey}`} className="import-result-row">
                  <div>
                    <div className="import-result-label">{label}</div>
                    {field.source && (
                      <div className="import-result-meta">
                        {field.source.sheetName} · Cell {field.source.cell} · “{field.source.matchedLabel}”
                      </div>
                    )}
                  </div>
                  <div className="import-result-actions">
                    {renderInput(rule, field, (value) => onUpdateValue(monthKey, field.fieldKey, value))}
                    <span className={confidenceClass(field.confidence)}>
                      {confidenceLabel(field.confidence)}
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      onClick={() => onUpdateValue(monthKey, field.fieldKey, null)}
                    >
                      Clear
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

export const importReviewRuleMap = importFieldRules.reduce<Record<string, ImportFieldRule>>((acc, rule) => {
  acc[rule.fieldKey] = rule
  return acc
}, {})