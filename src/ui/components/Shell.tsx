import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAppStore } from '../../state/store'

type StepConfig = {
  to: string
  step: number
  title: string
  subtitle: string
  enabled: boolean
  done: boolean
}

export const Shell: React.FC<React.PropsWithChildren> = ({ children }) => {
  const loc = useLocation()
  const data = useAppStore((s) => s.data)

  const steps: StepConfig[] = [
    {
      to: '/deal',
      step: 1,
      title: 'Deal Basics',
      subtitle: 'Entity, property & agent',
      enabled: true,
      done: !!data.deal.entityName,
    },
    {
      to: '/offering',
      step: 2,
      title: 'Economics & Structure',
      subtitle: 'Returns, promote & exemption',
      enabled: !!data.deal.entityName,
      done: !!data.offering.offeringExemption,
    },
    {
      to: '/investors',
      step: 3,
      title: 'Investor Details',
      subtitle: 'Add investors & subscriptions',
      enabled: !!data.spv?.formed && !!data.operatingAgreement?.gpSigned,
      done: data.investors.length > 0,
    },
    {
      to: '/review',
      step: 4,
      title: 'Review & Close',
      subtitle: 'Finalize & lock cap table',
      enabled:
        !!data.operatingAgreement?.generated ||
        data.subscriptions.some((s) => s.status === 'paid') ||
        !!data.deal.capTableLockedAt,
      done: !!data.deal.capTableLockedAt,
    },
  ]

  return (
    <div className="app-root">
      {/* ── Sidebar ── */}
      <aside className="sidebar" aria-label="Navigation">
        <div className="sidebar-brand">
          <div className="sidebar-logo">
            <div className="sidebar-logo-icon" aria-hidden="true">E</div>
            <span className="sidebar-app-name">EquityForm</span>
          </div>
          <p className="sidebar-tagline">Guided deal intake for legal &amp; cap table setup</p>
        </div>

        <nav className="sidebar-nav" aria-label="Steps">
          {steps.map((s) => {
            const active  = loc.pathname === s.to
            const locked  = !s.enabled
            const isDone  = s.done && !active

            const indicatorClass = isDone
              ? 'sidebar-step-indicator--done'
              : active
              ? 'sidebar-step-indicator--active'
              : locked
              ? 'sidebar-step-indicator--locked'
              : 'sidebar-step-indicator--accessible'

            const stepClass = [
              'sidebar-step',
              active ? 'sidebar-step--active' : '',
              locked ? 'sidebar-step--locked' : '',
            ]
              .filter(Boolean)
              .join(' ')

            const inner = (
              <>
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
              </>
            )

            if (locked) {
              return (
                <div
                  key={s.to}
                  className={stepClass}
                  aria-disabled="true"
                  title={`Complete previous steps to unlock: ${s.title}`}
                >
                  {inner}
                </div>
              )
            }

            return (
              <Link
                key={s.to}
                to={s.to}
                className={stepClass}
                aria-current={active ? 'step' : undefined}
              >
                {inner}
              </Link>
            )
          })}
        </nav>

        <div className="sidebar-footer">
          <a href="mailto:support@equityform.com" className="sidebar-help-link">
            <span className="sidebar-help-icon" aria-hidden="true">?</span>
            Need help?
          </a>
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
