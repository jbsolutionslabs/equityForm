import React, { useState, useEffect, useRef } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAppStore, isSpvFormed, canSendSubAgreements } from '../../state/store'
import { useEconomicsStore, isEconomicsLocked, isEconomicsComplete } from '../../state/economicsStore'
import { DEAL_ID } from '../views/economics/Economics'

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

const LEGAL_ROUTES  = STAGES.map((s) => s.to)
const isLegalRoute  = (path: string) => LEGAL_ROUTES.includes(path) || path === '/'
const isAcctRoute   = (path: string) => path.startsWith('/accounting')
const isEconRoute   = (path: string) => path.startsWith('/economics')

export const Shell: React.FC<React.PropsWithChildren> = ({ children }) => {
  const loc      = useLocation()
  const navigate = useNavigate()
  const data     = useAppStore((s) => s.data)
  const reset    = useAppStore((s) => s.reset)
  const econDeal = useEconomicsStore((s) => s.deals.find(d => d.dealId === DEAL_ID))
  const [confirmReset, setConfirmReset] = useState(false)

  // Derive which section the current route belongs to
  const isOnLegal = isLegalRoute(loc.pathname)
  const isOnAcct  = isAcctRoute(loc.pathname)
  const isOnEcon  = isEconRoute(loc.pathname)
  const section   = isOnAcct ? 'acct' : isOnEcon ? 'econ' : isOnLegal ? 'legal' : 'none'

  // Explicit open/close overrides — null means "follow route default"
  const [legalExplicit, setLegalExplicit] = useState<boolean | null>(null)
  const [acctExplicit,  setAcctExplicit]  = useState<boolean | null>(null)
  const [econExplicit,  setEconExplicit]  = useState<boolean | null>(null)
  const prevSection = useRef(section)

  // Reset overrides whenever the user moves between sections
  useEffect(() => {
    if (prevSection.current !== section) {
      setLegalExplicit(null)
      setAcctExplicit(null)
      setEconExplicit(null)
      prevSection.current = section
    }
  }, [section])

  const legalOpen = legalExplicit !== null ? legalExplicit : isOnLegal
  const acctOpen  = acctExplicit  !== null ? acctExplicit  : isOnAcct
  const econOpen  = econExplicit  !== null ? econExplicit  : isOnEcon

  const handleLegalClick = () => {
    const next = !legalOpen
    setLegalExplicit(next)
    if (next && !isOnLegal) navigate('/deal')
  }

  const handleAcctClick = () => {
    const next = !acctOpen
    setAcctExplicit(next)
    if (next && !isOnAcct) navigate('/accounting')
  }

  const handleEconClick = () => {
    const next = !econOpen
    setEconExplicit(next)
    if (next && !isOnEcon) navigate('/economics')
  }

  // Economics status
  const econLocked   = isEconomicsLocked(econDeal)
  const econComplete = isEconomicsComplete(econDeal)

  // Legal completion summary for the module header badge
  const legalDoneCount = STAGES.filter((s) => s.done(data)).length

  return (
    <div className="app-root">
      {/* ── Sidebar ── */}
      <aside className="sidebar" aria-label="Navigation">
        <div className="sidebar-brand">
          <div className="sidebar-logo">
            <div className="sidebar-logo-icon" aria-hidden="true">E</div>
            <span className="sidebar-app-name">EquityForm</span>
          </div>
          <p className="sidebar-tagline">Guided Deal Setup</p>
        </div>

        <nav className="sidebar-nav" aria-label="Modules">

          {/* ══ GP Dashboard ══ */}
          <Link
            to="/dashboard"
            className={[
              'sidebar-dashboard-link',
              loc.pathname === '/dashboard' ? 'sidebar-dashboard-link--active' : '',
            ].filter(Boolean).join(' ')}
            aria-current={loc.pathname === '/dashboard' ? 'page' : undefined}
          >
            <div className="sidebar-dashboard-icon" aria-hidden="true">⊞</div>
            <div className="sidebar-dashboard-text">
              <span className="sidebar-dashboard-title">GP Dashboard</span>
              <span className="sidebar-dashboard-sub">Portfolio overview</span>
            </div>
          </Link>

          {/* ══ Economics module ══ */}
          <button
            type="button"
            className={[
              'sidebar-module-header',
              econOpen ? 'sidebar-module-header--open' : '',
            ].filter(Boolean).join(' ')}
            onClick={handleEconClick}
            aria-expanded={econOpen}
          >
            <div className="sidebar-module-icon" aria-hidden="true">◈</div>
            <div className="sidebar-module-text">
              <span className="sidebar-module-title">Economics</span>
              <span className="sidebar-module-subtitle">Capital stack &amp; waterfall</span>
            </div>
            <div className="sidebar-module-meta">
              {econLocked && <span className="sidebar-module-count">🔒</span>}
              {!econLocked && econComplete && <span className="sidebar-module-count">✓</span>}
              <span className="sidebar-module-chevron" aria-hidden="true">
                {econOpen ? '▾' : '▸'}
              </span>
            </div>
          </button>

          {econOpen && (
            <div className="sidebar-module-steps" aria-label="Economics steps">
              <Link
                to="/economics"
                className={[
                  'sidebar-step',
                  isOnEcon ? 'sidebar-step--active' : '',
                ].filter(Boolean).join(' ')}
                aria-current={isOnEcon ? 'step' : undefined}
              >
                <div
                  className={[
                    'sidebar-step-indicator',
                    econLocked   ? 'sidebar-step-indicator--done'
                    : econComplete ? 'sidebar-step-indicator--done'
                    : isOnEcon   ? 'sidebar-step-indicator--active'
                    : 'sidebar-step-indicator--accessible',
                  ].filter(Boolean).join(' ')}
                  aria-hidden="true"
                >
                  {econLocked || econComplete ? '✓' : 'E'}
                </div>
                <div className="sidebar-step-text">
                  <span className="sidebar-step-title">Deal Economics</span>
                  <span className="sidebar-step-subtitle">Stack, pref &amp; fees</span>
                </div>
              </Link>
            </div>
          )}

          {/* ══ Legal module ══ */}
          <button
            type="button"
            className={[
              'sidebar-module-header',
              legalOpen ? 'sidebar-module-header--open' : '',
            ].filter(Boolean).join(' ')}
            onClick={handleLegalClick}
            aria-expanded={legalOpen}
          >
            <div className="sidebar-module-icon" aria-hidden="true">⚖</div>
            <div className="sidebar-module-text">
              <span className="sidebar-module-title">Legal</span>
              <span className="sidebar-module-subtitle">Deal setup &amp; formation</span>
            </div>
            <div className="sidebar-module-meta">
              {legalDoneCount > 0 && (
                <span className="sidebar-module-count">{legalDoneCount}/7</span>
              )}
              <span className="sidebar-module-chevron" aria-hidden="true">
                {legalOpen ? '▾' : '▸'}
              </span>
            </div>
          </button>

          {legalOpen && (
            <div className="sidebar-module-steps" aria-label="Legal steps">
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
                    <div className={`sidebar-step-indicator ${indicatorClass}`} aria-hidden="true">
                      {isDone ? '✓' : s.step}
                    </div>
                    <div className="sidebar-step-text">
                      <span className="sidebar-step-title">{s.title}</span>
                      <span className="sidebar-step-subtitle">{s.subtitle}</span>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}

          {/* ══ Accounting module ══ */}
          <button
            type="button"
            className={[
              'sidebar-module-header',
              acctOpen ? 'sidebar-module-header--open' : '',
            ].filter(Boolean).join(' ')}
            onClick={handleAcctClick}
            aria-expanded={acctOpen}
          >
            <div className="sidebar-module-icon" aria-hidden="true">$</div>
            <div className="sidebar-module-text">
              <span className="sidebar-module-title">Accounting</span>
              <span className="sidebar-module-subtitle">Monthly financials &amp; statements</span>
            </div>
            <div className="sidebar-module-meta">
              <span className="sidebar-module-chevron" aria-hidden="true">
                {acctOpen ? '▾' : '▸'}
              </span>
            </div>
          </button>

          {acctOpen && (
            <div className="sidebar-module-steps" aria-label="Accounting steps">
              <Link
                to="/accounting"
                className={[
                  'sidebar-step',
                  loc.pathname.startsWith('/accounting') ? 'sidebar-step--active' : '',
                ].filter(Boolean).join(' ')}
                aria-current={loc.pathname.startsWith('/accounting') ? 'step' : undefined}
              >
                <div
                  className={`sidebar-step-indicator ${loc.pathname.startsWith('/accounting') ? 'sidebar-step-indicator--active' : 'sidebar-step-indicator--accessible'}`}
                  aria-hidden="true"
                >
                  1
                </div>
                <div className="sidebar-step-text">
                  <span className="sidebar-step-title">Properties</span>
                  <span className="sidebar-step-subtitle">P&amp;L entry &amp; statements</span>
                </div>
              </Link>
            </div>
          )}

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
