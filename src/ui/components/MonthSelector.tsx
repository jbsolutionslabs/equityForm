import React from 'react'

export type MonthOption = {
  key: string
  label: string
  detail?: string
}

type Props = {
  options: MonthOption[]
  selectedKeys: string[]
  onChange: (next: string[]) => void
  disabled?: boolean
}

export const MonthSelector: React.FC<Props> = ({ options, selectedKeys, onChange, disabled }) => {
  const toggle = (key: string) => {
    if (disabled) return
    if (selectedKeys.includes(key)) {
      onChange(selectedKeys.filter((item) => item !== key))
    } else {
      onChange([...selectedKeys, key])
    }
  }

  return (
    <div className="month-selector">
      {options.map((option) => (
        <label key={option.key} className="month-selector-option">
          <input
            type="checkbox"
            checked={selectedKeys.includes(option.key)}
            onChange={() => toggle(option.key)}
            disabled={disabled}
          />
          <span>
            <span className="month-selector-label">{option.label}</span>
            {option.detail && <span className="month-selector-detail">{option.detail}</span>}
          </span>
        </label>
      ))}
    </div>
  )
}