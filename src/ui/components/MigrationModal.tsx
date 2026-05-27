import React, { useState } from 'react'
import { apiClient } from '../../api/client'

/**
 * Shown on first sign-in if localStorage has existing deal data.
 * Offers to import data to the user's cloud account.
 */
export const MigrationModal: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [count, setCount] = useState(0)

  async function handleImport() {
    setStatus('loading')
    try {
      const raw = localStorage.getItem('equityform:deals')
      if (!raw) { onDone(); return }
      const parsed = JSON.parse(raw) as { deals?: Record<string, unknown> }
      const { data } = await apiClient.post('/migrate', parsed)
      setCount(data.imported ?? 0)
      // Clear localStorage after successful import
      localStorage.removeItem('equityform:deals')
      localStorage.removeItem('equityform:economics')
      localStorage.removeItem('equityform:accounting')
      localStorage.removeItem('equityform:templates')
      localStorage.removeItem('equityform:compliance')
      setStatus('done')
    } catch {
      setStatus('error')
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9999,
      }}
    >
      <div
        style={{
          background: 'var(--color-surface)',
          borderRadius: 12,
          padding: '2rem',
          maxWidth: 440,
          width: '90%',
          boxShadow: 'var(--shadow-xl)',
        }}
      >
        {status === 'done' ? (
          <>
            <h2 style={{ marginBottom: '0.5rem' }}>Import complete</h2>
            <p style={{ color: 'var(--color-slate-500)', marginBottom: '1.5rem' }}>
              {count} deal{count !== 1 ? 's' : ''} imported to your account.
            </p>
            <button className="btn btn-primary" onClick={onDone}>Continue</button>
          </>
        ) : (
          <>
            <h2 style={{ marginBottom: '0.5rem' }}>Existing data found</h2>
            <p style={{ color: 'var(--color-slate-500)', marginBottom: '1.5rem' }}>
              We found deal data saved locally in this browser. Would you like to import it into your account so it&apos;s backed up and accessible everywhere?
            </p>
            {status === 'error' && (
              <p style={{ color: 'var(--color-error)', marginBottom: '1rem', fontSize: '0.875rem' }}>
                Import failed. You can try again or skip.
              </p>
            )}
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                className="btn btn-primary"
                onClick={handleImport}
                disabled={status === 'loading'}
              >
                {status === 'loading' ? 'Importing…' : 'Import to my account'}
              </button>
              <button className="btn btn-ghost" onClick={onDone}>
                Skip
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
