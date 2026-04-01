import React, { useEffect, useMemo, useRef, useState } from 'react'

export type ParsedAddress = {
  streetAddress?: string
  city?: string
  state?: string
  zip?: string
  formattedAddress?: string
}

type Props = {
  id?: string
  className?: string
  placeholder?: string
  value: string
  onChange: (value: string) => void
  onSelectAddress?: (address: ParsedAddress) => void
}

type Suggestion = {
  placeId: string
  description: string
}

function parseNewPlaceResponse(place: any): ParsedAddress {
  const comps: any[] = place?.addressComponents ?? []
  const pick = (type: string, short = false) => {
    const c = comps.find((x) => Array.isArray(x.types) && x.types.includes(type))
    if (!c) return undefined
    return short ? c.shortText : c.longText
  }

  const streetNumber = pick('street_number')
  const route = pick('route')
  const city = pick('locality') || pick('sublocality') || pick('postal_town')
  const state = pick('administrative_area_level_1', true)
  const zip = pick('postal_code')

  return {
    streetAddress: [streetNumber, route].filter(Boolean).join(' ').trim() || undefined,
    city: city || undefined,
    state: state || undefined,
    zip: zip || undefined,
    formattedAddress: place?.formattedAddress || undefined,
  }
}

export const AddressAutocompleteInput: React.FC<Props> = ({
  id,
  className,
  placeholder,
  value,
  onChange,
  onSelectAddress,
}) => {
  const apiKey = useMemo(() => (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim() || '', [])
  const [open, setOpen] = useState(false)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [activeIndex, setActiveIndex] = useState<number>(-1)

  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const debounceRef = useRef<number | null>(null)
  const sessionTokenRef = useRef<string>(`session-${Date.now()}-${Math.random().toString(36).slice(2)}`)

  useEffect(() => {
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current)
    }
  }, [])

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const fetchSuggestions = async (query: string) => {
    if (!apiKey || query.trim().length < 3) {
      setSuggestions([])
      setOpen(false)
      return
    }

    try {
      const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text',
        },
        body: JSON.stringify({
          input: query,
          includedRegionCodes: ['US'],
          sessionToken: sessionTokenRef.current,
        }),
      })

      if (!res.ok) {
        setSuggestions([])
        setOpen(false)
        return
      }

      const json = await res.json()
      const next: Suggestion[] = (json?.suggestions ?? [])
        .map((s: any) => ({
          placeId: s?.placePrediction?.placeId,
          description: s?.placePrediction?.text?.text,
        }))
        .filter((s: Suggestion) => !!s.placeId && !!s.description)

      setSuggestions(next)
      setOpen(next.length > 0)
    } catch {
      setSuggestions([])
      setOpen(false)
    }
  }

  const selectSuggestion = async (s: Suggestion) => {
    onChange(s.description)
    setSuggestions([])
    setOpen(false)
    setActiveIndex(-1)
    sessionTokenRef.current = `session-${Date.now()}-${Math.random().toString(36).slice(2)}`

    if (!apiKey) return

    try {
      const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(s.placeId)}`, {
        headers: {
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'addressComponents,formattedAddress',
        },
      })
      if (!res.ok) return
      const place = await res.json()
      onSelectAddress?.(parseNewPlaceResponse(place))
    } catch {
      // no-op fallback to free text
    }
  }

  const onKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (!open || suggestions.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((idx) => Math.min(idx + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((idx) => Math.max(idx - 1, 0))
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0 && activeIndex < suggestions.length) {
        e.preventDefault()
        selectSuggestion(suggestions[activeIndex])
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="address-autocomplete" ref={wrapperRef}>
      <input
        id={id}
        className={className}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          const next = e.target.value
          onChange(next)
          if (debounceRef.current) window.clearTimeout(debounceRef.current)
          debounceRef.current = window.setTimeout(() => {
            fetchSuggestions(next)
          }, 250)
        }}
        onKeyDown={onKeyDown}
        autoComplete="off"
      />

      {open && suggestions.length > 0 && (
        <div className="address-autocomplete__menu" role="listbox">
          {suggestions.map((s, idx) => (
            <button
              key={s.placeId}
              type="button"
              className={`address-autocomplete__item${idx === activeIndex ? ' address-autocomplete__item--active' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selectSuggestion(s)}
            >
              {s.description}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
