import React from 'react'

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: number | string | null
  onValueChange: (value: number | null) => void
}

const formatNumberInput = (value: number | string | null) => {
  if (value === null || value === undefined || value === '') return ''
  const numeric = typeof value === 'number'
    ? value
    : Number(String(value).replace(/,/g, ''))
  if (Number.isNaN(numeric)) return ''
  return numeric.toLocaleString('en-US')
}

const parseNumberInput = (raw: string) => {
  const cleaned = raw.replace(/,/g, '').trim()
  if (!cleaned) return null
  const numeric = Number(cleaned)
  return Number.isNaN(numeric) ? null : numeric
}

export const FormattedNumberInput: React.FC<Props> = ({ value, onValueChange, ...props }) => (
  <input
    {...props}
    type="text"
    inputMode="decimal"
    value={formatNumberInput(value)}
    onChange={(event) => onValueChange(parseNumberInput(event.target.value))}
  />
)