import React, { useState } from 'react'
import { Link } from 'react-router-dom'

const DISMISSED_KEY = 'equityform:beta-banner-dismissed'

export const BetaBanner: React.FC = () => {
  const [dismissed, setDismissed] = useState(() =>
    typeof localStorage !== 'undefined' && !!localStorage.getItem(DISMISSED_KEY)
  )

  if (dismissed) return null

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, '1')
    setDismissed(true)
  }

  return (
    <div className="beta-banner" role="alert" aria-live="polite">
      <span className="beta-banner-text">
        <strong>⚠ EquityForm is in beta</strong> — not for production use. Not legal or financial advice.{' '}
        <Link to="/terms" className="beta-banner-link">Learn more</Link>
      </span>
      <button
        type="button"
        className="beta-banner-dismiss"
        onClick={handleDismiss}
        aria-label="Dismiss beta banner"
      >
        ×
      </button>
    </div>
  )
}
