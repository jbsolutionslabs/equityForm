import React, { useState, useRef, useEffect } from 'react'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

type Props = {
  value: string           // 'YYYY-MM'
  onChange: (v: string) => void
  placeholder?: string
}

export const MonthYearPicker: React.FC<Props> = ({
  value,
  onChange,
  placeholder = 'Select month',
}) => {
  const selYear  = value ? parseInt(value.slice(0, 4)) : null
  const selMonth = value ? parseInt(value.slice(5, 7)) : null

  const [open, setOpen]       = useState(false)
  const [navYear, setNavYear] = useState(selYear ?? new Date().getFullYear())
  const ref = useRef<HTMLDivElement>(null)

  // When the picker opens, jump to the selected year
  const handleOpen = () => {
    if (selYear) setNavYear(selYear)
    setOpen(true)
  }

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', down)
    return () => document.removeEventListener('mousedown', down)
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [open])

  const handleSelect = (monthIdx: number) => {
    onChange(`${navYear}-${String(monthIdx + 1).padStart(2, '0')}`)
    setOpen(false)
  }

  const displayLabel = selYear && selMonth
    ? new Date(selYear, selMonth - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : placeholder

  return (
    <div ref={ref} className="month-picker">
      <button
        type="button"
        className={`month-picker-trigger ${open ? 'month-picker-trigger--open' : ''} ${!value ? 'month-picker-trigger--empty' : ''}`}
        onClick={() => open ? setOpen(false) : handleOpen()}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <span className="month-picker-trigger-label">{displayLabel}</span>
        <span className="month-picker-chevron" aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className="month-picker-dropdown" role="dialog" aria-label="Pick a month">
          {/* Year navigation */}
          <div className="month-picker-year-row">
            <button
              type="button"
              className="month-picker-year-btn"
              onClick={() => setNavYear((y) => y - 1)}
              aria-label="Previous year"
            >
              ◀
            </button>
            <span className="month-picker-year-label">{navYear}</span>
            <button
              type="button"
              className="month-picker-year-btn"
              onClick={() => setNavYear((y) => y + 1)}
              aria-label="Next year"
            >
              ▶
            </button>
          </div>

          {/* Month grid */}
          <div className="month-picker-grid">
            {MONTHS.map((m, i) => {
              const isSelected = navYear === selYear && i + 1 === selMonth
              return (
                <button
                  key={m}
                  type="button"
                  className={[
                    'month-picker-cell',
                    isSelected ? 'month-picker-cell--selected' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => handleSelect(i)}
                >
                  {m}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
