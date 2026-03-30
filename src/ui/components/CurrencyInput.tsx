import React, { useState, useRef, useEffect } from 'react'

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type'> & {
  value: number
  onChange: (value: number) => void
}

function toDisplay(n: number): string {
  if (!n) return ''
  return Math.round(n).toLocaleString('en-US')
}

/**
 * A text input that displays dollar amounts with comma formatting (e.g. 150,000).
 * Accepts and emits plain numbers; formatting is purely visual.
 */
export const CurrencyInput: React.FC<Props> = ({ value, onChange, ...rest }) => {
  const [display, setDisplay] = useState(() => toDisplay(value))
  const valueRef = useRef(value)

  // Sync display when value is changed externally (e.g. form reset)
  useEffect(() => {
    if (value !== valueRef.current) {
      valueRef.current = value
      setDisplay(toDisplay(value))
    }
  }, [value])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9]/g, '')
    if (!raw) {
      valueRef.current = 0
      setDisplay('')
      onChange(0)
      return
    }
    const n = parseInt(raw, 10)
    valueRef.current = n
    setDisplay(n.toLocaleString('en-US'))
    onChange(n)
  }

  return (
    <input
      {...rest}
      type="text"
      inputMode="numeric"
      value={display}
      onChange={handleChange}
    />
  )
}
