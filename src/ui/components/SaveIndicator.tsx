import React, { useEffect, useState } from 'react'
import { useSaveIndicator } from '../../state/saveIndicatorStore'

export const SaveIndicator: React.FC<{ onRetry?: () => void }> = ({ onRetry }) => {
  const { state, lastSavedAt } = useSaveIndicator()
  const [visible, setVisible] = useState(false)

  // Auto-hide after 3s when saved
  useEffect(() => {
    if (state === 'saved') {
      setVisible(true)
      const t = setTimeout(() => setVisible(false), 3000)
      return () => clearTimeout(t)
    }
    if (state !== 'idle') setVisible(true)
  }, [state])

  if (!visible && state === 'idle') return null

  return (
    <div className="save-indicator" data-state={state} role="status" aria-live="polite">
      {state === 'pending' && (
        <>
          <span className="save-indicator__dot save-indicator__dot--pending" />
          <span className="save-indicator__label">Unsaved changes</span>
        </>
      )}
      {state === 'saving' && (
        <>
          <span className="save-indicator__spinner" aria-hidden="true" />
          <span className="save-indicator__label">Saving…</span>
        </>
      )}
      {state === 'saved' && visible && (
        <>
          <span className="save-indicator__dot save-indicator__dot--saved" />
          <span className="save-indicator__label">All changes saved</span>
        </>
      )}
      {state === 'error' && (
        <>
          <span className="save-indicator__dot save-indicator__dot--error" />
          <span className="save-indicator__label">Save failed</span>
          {onRetry && (
            <button
              type="button"
              className="save-indicator__retry"
              onClick={onRetry}
            >
              Retry
            </button>
          )}
        </>
      )}
    </div>
  )
}
