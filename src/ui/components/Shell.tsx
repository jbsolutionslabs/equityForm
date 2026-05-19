import React, { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useMatch } from 'react-router-dom'
import { useAppStore, isSpvFormed } from '../../state/store'
import { useEconomicsStore, isEconomicsLocked } from '../../state/economicsStore'

type StageConfig = {
  path:     string
  step:     number
  title:    string
  subtitle: string
  done:     (data: ReturnType<typeof useAppStore.getState>['deals'][string]['data'], econLocked: boolean) => boolean
}

const STAGES: StageConfig[] = [
  {
    path:     'questionnaire',
    step:     1,
    title:    'Questionnaire',
    subtitle: 'Entity, property & offering',
    done:     (d) => !!(d.deal.entityName && d.offering.offeringExemption),
  },
  {
    path:     'economics',
    step:     2,
    title:    'Deal Economics',
    subtitle: 'Capital stack, pref & fees',
    done:     (_d, econLocked) => econLocked,
  },
  {
    path:     'spv',
    step:     3,
    title:    'SPV Formation',
    subtitle: 'LLC filing, EIN & agent',
    done:     (d) => isSpvFormed(d),
  },
  {
    path:     'oa',
    step:     4,
    title:    'Operating Agreement',
    subtitle: 'Generate, review & sign',
    done:     (d) => d.operatingAgreement?.status === 'signed',
  },
  {
    path:     'investors',
    step:     5,
    title:    'Investor Intake',
    subtitle: 'Add investors & sub agreements',
    done:     (d) => d.investors.length > 0 && d.subscriptions.some((s) => s.status !== 'pending'),
  },
  {
    path:     'signatures',
    step:     6,
    title:    'E-Signatures',
    subtitle: 'Send & track investor signing',
    done:     (d) =>
      d.subscriptions.length > 0 &&
      d.subscriptions.every((s) => s.status === 'signed' || s.status === 'paid'),
  },
  {
    path:     'wires',
    step:     7,
    title:    'Wire Tracking',
    subtitle: 'Confirm capital received',
    done:     (d) =>
      d.subscriptions.length > 0 &&
      d.subscriptions.every((s) => s.status === 'paid'),
  },
  {
    path:     'captable',
    step:     8,
    title:    'Cap Table Lock',
    subtitle: 'Finalize & lock',
    done:     (d) => !!d.deal.capTableLockedAt,
  },
]

/* ─── Inner sidebar for deal context ────────────────────────────────────── */
function DealSidebar({ dealId }: { dealId: string }) {
  const loc     = useLocation()
  const deals   = useAppStore((s) => s.deals)
  const reset   = useAppStore((s) => s.reset)
  const econDeal = useEconomicsStore((s) => s.deals.find((d) => d.dealId === dealId))
  const [confirmReset, setConfirmReset] = useState(false)

  const entry = deals[dealId]
  const data  = entry?.data

  const econLocked  = isEconomicsLocked(econDeal)
  const dealName    = data?.deal?.entityName || 'New Deal'
  const legalDoneCount = data ? STAGES.filter((s) => s.done(data, econLocked)).length : 0

  return (
    <>
      <div className="sidebar-back-row">
        <Link to="/deals" className="sidebar-back-link">
          ← All Deals
        </Link>
      </div>

      <div className="sidebar-deal-name">{dealName}</div>

      <div className="sidebar-module-steps" aria-label="Deal stages" style={{ padding: '0 8px' }}>
        {STAGES.map((s) => {
          const to     = `/deals/${dealId}/${s.path}`
          const active = loc.pathname === to
          const isDone = data ? s.done(data, econLocked) && !active : false
          const indicatorClass = isDone
            ? 'sidebar-step-indicator--done'
            : active
            ? 'sidebar-step-indicator--active'
            : 'sidebar-step-indicator--accessible'

          return (
            <Link
              key={s.path}
              to={to}
              className={['sidebar-step', active ? 'sidebar-step--active' : ''].filter(Boolean).join(' ')}
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

      <div className="sidebar-module-count-row">
        {legalDoneCount > 0 && (
          <span className="sidebar-module-count">{legalDoneCount}/8 stages</span>
        )}
      </div>

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
    </>
  )
}

/* ─── Top-level nav sidebar ─────────────────────────────────────────────── */
function TopLevelSidebar() {
  const loc      = useLocation()
  const navigate = useNavigate()
  const reset    = useAppStore((s) => s.reset)
  const [confirmReset, setConfirmReset] = useState(false)
  const [acctOpen, setAcctOpen]         = useState(loc.pathname.startsWith('/accounting'))

  useEffect(() => {
    setAcctOpen(loc.pathname.startsWith('/accounting'))
  }, [loc.pathname])

  const handleAcctClick = () => {
    const next = !acctOpen
    setAcctOpen(next)
    if (next && !loc.pathname.startsWith('/accounting')) navigate('/accounting')
  }

  return (
    <>
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

        {/* ══ Deals ══ */}
        <Link
          to="/deals"
          className={[
            'sidebar-dashboard-link',
            loc.pathname === '/deals' ? 'sidebar-dashboard-link--active' : '',
          ].filter(Boolean).join(' ')}
          aria-current={loc.pathname === '/deals' ? 'page' : undefined}
        >
          <div className="sidebar-dashboard-icon" aria-hidden="true">⚖</div>
          <div className="sidebar-dashboard-text">
            <span className="sidebar-dashboard-title">Deals</span>
            <span className="sidebar-dashboard-sub">Deal formation &amp; legal</span>
          </div>
        </Link>

   

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

             {/* ══ Compliance ══ */}
        <Link
          to="/compliance"
          className={[
            'sidebar-dashboard-link',
            loc.pathname === '/compliance' ? 'sidebar-dashboard-link--active' : '',
          ].filter(Boolean).join(' ')}
          aria-current={loc.pathname === '/compliance' ? 'page' : undefined}
        >
          <div className="sidebar-dashboard-icon" aria-hidden="true">✓</div>
          <div className="sidebar-dashboard-text">
            <span className="sidebar-dashboard-title">Compliance</span>
            <span className="sidebar-dashboard-sub">DE tax reminders & filing</span>
          </div>
        </Link>

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
    </>
  )
}

/* ─── Shell ──────────────────────────────────────────────────────────────── */
export const Shell: React.FC<React.PropsWithChildren> = ({ children }) => {
  const dealMatch = useMatch('/deals/:dealId/*')
  const dealId    = dealMatch?.params?.dealId

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

        {dealId ? (
          <DealSidebar dealId={dealId} />
        ) : (
          <TopLevelSidebar />
        )}
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
