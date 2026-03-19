import React, { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAppStore, isSpvFormed, canSendSubAgreements } from '../../state/store'

type StageConfig = {
  to:       string
  step:     number
  title:    string
  subtitle: string
  done:     (data: ReturnType<typeof useAppStore.getState>['data']) => boolean
}

const STAGES: StageConfig[] = [
  {
    to:       '/deal',
    step:     1,
    title:    'Questionnaire',
    subtitle: 'Entity, property & economics',
    done:     (d) => !!(d.deal.entityName && d.offering.offeringExemption),
  },
  {
    to:       '/spv',
    step:     2,
    title:    'SPV Formation',
    subtitle: 'LLC filing, EIN & agent',
    done:     (d) => isSpvFormed(d),
  },
  {
    to:       '/oa',
    step:     3,
    title:    'Operating Agreement',
    subtitle: 'Generate, review & sign',
    done:     (d) => d.operatingAgreement?.status === 'signed',
  },
  {
    to:       '/investors',
    step:     4,
    title:    'Investor Intake',
    subtitle: 'Add investors & sub agreements',
    done:     (d) => d.investors.length > 0 && d.subscriptions.some((s) => s.status !== 'pending'),
  },
  {
    to:       '/signatures',
    step:     5,
    title:    'E-Signatures',
    subtitle: 'Send & track investor signing',
    done:     (d) =>
      d.subscriptions.length > 0 &&
      d.subscriptions.every((s) => s.status === 'signed' || s.status === 'paid'),
  },
  {
    to:       '/wires',
    step:     6,
    title:    'Wire Tracking',
    subtitle: 'Confirm capital received',
    done:     (d) =>
      d.subscriptions.length > 0 &&
      d.subscriptions.every((s) => s.status === 'paid'),
  },
  {
    to:       '/captable',
    step:     7,
    title:    'Cap Table Lock',
    subtitle: 'Finalize & lock',
    done:     (d) => !!d.deal.capTableLockedAt,
  },
]

export const Shell: React.FC<React.PropsWithChildren> = ({ children }) => {
  const loc   = useLocation()
  const data  = useAppStore((s) => s.data)
  const reset = useAppStore((s) => s.reset)
  const [confirmReset, setConfirmReset] = useState(false)

  return (
    <div className="app-root">
      {/* ── Sidebar ── */}
      <aside className="sidebar" aria-label="Navigation">
        <div className="sidebar-brand">
          <div className="sidebar-logo">
            <div className="sidebar-logo-icon" aria-hidden="true">E</div>
            <span className="sidebar-app-name">EquityForm</span>
          </div>
          <p className="sidebar-tagline">Guided deal intake — 7-stage legal flow</p>
        </div>

        <nav className="sidebar-nav" aria-label="Stages">
          {STAGES.map((s) => {
            const active  = loc.pathname === s.to
            const isDone  = s.done(data) && !active
            const indicatorClass = isDone
              ? 'sidebar-step-indicator--done'
              : active
              ? 'sidebar-step-indicator--active'
              : 'sidebar-step-indicator--accessible'

            return (
              <Link
                key={s.to}
                to={s.to}
                className={[
                  'sidebar-step',
                  active ? 'sidebar-step--active' : '',
                ].filter(Boolean).join(' ')}
                aria-current={active ? 'step' : undefined}
              >
                <div
                  className={`sidebar-step-indicator ${indicatorClass}`}
                  aria-hidden="true"
                >
                  {isDone ? '✓' : s.step}
                </div>
                <div className="sidebar-step-text">
                  <span className="sidebar-step-title">{s.title}</span>
                  <span className="sidebar-step-subtitle">{s.subtitle}</span>
                </div>
              </Link>
            )
          })}
        </nav>

        <div className="sidebar-footer">
          <a href="mailto:support@equityform.com" className="sidebar-help-link">
            <span className="sidebar-help-icon" aria-hidden="true">?</span>
            Need help?
          </a>
          {confirmReset ? (
            <div className="sidebar-reset-confirm">
              <span className="sidebar-reset-confirm-label">Clear all data?</span>
              <div className="sidebar-reset-confirm-actions">
                <button
                  type="button"
                  className="sidebar-reset-btn sidebar-reset-btn--danger"
                  onClick={() => { reset(); setConfirmReset(false) }}
                >
                  Yes, reset
                </button>
                <button
                  type="button"
                  className="sidebar-reset-btn sidebar-reset-btn--cancel"
                  onClick={() => setConfirmReset(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="sidebar-reset-trigger"
              onClick={() => setConfirmReset(true)}
            >
              Reset demo data
            </button>
          )}
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="main-content" id="main-content">
        <div className="main-inner page-enter">
          {children}
        </div>
      </main>
    </div>
  )
}
