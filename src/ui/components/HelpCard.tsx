import React, { useState, useRef, useEffect } from 'react'

/* ── Inline field explainer ─────────────────────────────────────────────── */
export const FieldHelp: React.FC<{ text: string }> = ({ text }) => (
  <p className="field-help">{text}</p>
)

/* ── Tooltip (Level 2 — on-demand popover) ──────────────────────────────── */
interface TooltipProps {
  title: string
  content: string
  learnMoreUrl?: string
}

export const Tooltip: React.FC<TooltipProps> = ({ title, content, learnMoreUrl }) => {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className="tooltip-wrapper" ref={wrapRef}>
      <button
        type="button"
        className="tooltip-btn"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Help: ${title}`}
        aria-expanded={open}
        aria-haspopup="true"
      >
        ?
      </button>
      {open && (
        <div className="tooltip-popover" role="tooltip">
          <div className="tooltip-popover-title">{title}</div>
          <p style={{ margin: 0 }}>{content}</p>
          {learnMoreUrl && (
            <a
              href={learnMoreUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'block', marginTop: 8, fontSize: 12.5, color: 'var(--color-accent)' }}
            >
              Learn more →
            </a>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Help/Support card (bottom of each view) ─────────────────────────────── */
export const HelpCard: React.FC<{ title?: string; text: string }> = ({ title, text }) => (
  <div className="help-support-card" role="complementary" aria-label="Help and support">
    <div className="help-support-card-title">
      <span aria-hidden="true">💬</span>
      {title ?? 'Questions about this step?'}
    </div>
    <p className="help-support-card-body">{text}</p>
    <div className="help-support-card-actions">
      <a href="mailto:support@equityform.com" className="btn btn-secondary btn-sm">
        Email us
      </a>
    </div>
  </div>
)

export default HelpCard
