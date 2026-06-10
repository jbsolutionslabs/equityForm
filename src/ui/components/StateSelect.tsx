import React, { useState, useRef, useEffect } from 'react'

const STATES: { code: string; name: string }[] = [
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
  { code: 'DC', name: 'District of Columbia' },
]

function resolveEntry(value?: string): { code: string; name: string } | undefined {
  if (!value) return undefined
  const upper = value.trim().toUpperCase()
  return (
    STATES.find(s => s.code === upper) ??
    STATES.find(s => s.name.toLowerCase() === value.trim().toLowerCase())
  )
}

interface StateSelectProps {
  value?: string
  onChange: (code: string) => void
  onBlur?: () => void
  id?: string
  disabled?: boolean
  placeholder?: string
}

export const StateSelect: React.FC<StateSelectProps> = ({
  value,
  onChange,
  onBlur,
  id,
  disabled,
  placeholder = 'Select state…',
}) => {
  const [inputText, setInputText]         = useState('')
  const [isOpen, setIsOpen]               = useState(false)
  const [highlightedIdx, setHighlightedIdx] = useState(0)
  const inputRef  = useRef<HTMLInputElement>(null)
  const listRef   = useRef<HTMLUListElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Sync display text when value prop changes externally
  useEffect(() => {
    const entry = resolveEntry(value)
    setInputText(entry ? entry.name : (value ?? ''))
  }, [value])

  const filtered = STATES.filter(s => {
    if (!inputText) return true
    const q = inputText.toLowerCase()
    return s.name.toLowerCase().includes(q) || s.code.toLowerCase().startsWith(q)
  })

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value)
    setIsOpen(true)
    setHighlightedIdx(0)
  }

  const select = (code: string, name: string) => {
    onChange(code)
    setInputText(name)
    setIsOpen(false)
  }

  const handleBlur = (e: React.FocusEvent) => {
    if (wrapperRef.current?.contains(e.relatedTarget as Node)) return
    // Reset display text to current valid value (discard partial input)
    const entry = resolveEntry(value)
    setInputText(entry ? entry.name : (value ?? ''))
    setIsOpen(false)
    onBlur?.()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') { setIsOpen(true); e.preventDefault() }
      return
    }
    if (e.key === 'ArrowDown') {
      setHighlightedIdx(i => Math.min(i + 1, filtered.length - 1))
      e.preventDefault()
    } else if (e.key === 'ArrowUp') {
      setHighlightedIdx(i => Math.max(i - 1, 0))
      e.preventDefault()
    } else if (e.key === 'Enter') {
      if (filtered[highlightedIdx]) select(filtered[highlightedIdx].code, filtered[highlightedIdx].name)
      e.preventDefault()
    } else if (e.key === 'Escape') {
      setIsOpen(false)
      const entry = resolveEntry(value)
      setInputText(entry ? entry.name : (value ?? ''))
    }
  }

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setIsOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Scroll highlighted item into view
  useEffect(() => {
    if (!isOpen || !listRef.current) return
    const item = listRef.current.children[highlightedIdx] as HTMLElement
    item?.scrollIntoView({ block: 'nearest' })
  }, [highlightedIdx, isOpen])

  const selectedCode = resolveEntry(value)?.code

  return (
    <div className="state-select" ref={wrapperRef}>
      <input
        ref={inputRef}
        id={id}
        className="field-input"
        value={inputText}
        onChange={handleInputChange}
        onFocus={() => { setIsOpen(true); setHighlightedIdx(0) }}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        role="combobox"
        aria-expanded={isOpen}
        aria-autocomplete="list"
        aria-controls={id ? `${id}-listbox` : undefined}
      />
      {isOpen && filtered.length > 0 && (
        <ul
          ref={listRef}
          className="state-select-dropdown"
          id={id ? `${id}-listbox` : undefined}
          role="listbox"
        >
          {filtered.map((s, i) => (
            <li
              key={s.code}
              className={[
                'state-select-option',
                i === highlightedIdx ? 'state-select-option--highlighted' : '',
                s.code === selectedCode ? 'state-select-option--selected' : '',
              ].filter(Boolean).join(' ')}
              role="option"
              aria-selected={s.code === selectedCode}
              onMouseDown={e => { e.preventDefault(); select(s.code, s.name) }}
              onMouseEnter={() => setHighlightedIdx(i)}
            >
              <span className="state-select-name">{s.name}</span>
              <span className="state-select-code">{s.code}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default StateSelect
