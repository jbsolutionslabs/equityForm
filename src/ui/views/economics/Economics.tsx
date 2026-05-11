import React, { useEffect, useState } from 'react'
import {
  useEconomicsStore,
  canLockEconomics,
  isEconomicsLocked,
} from '../../../state/economicsStore'
import {
  validateSectionA,
  validateSectionB,
  validateSectionC,
} from '../../../utils/economicsValidation'
import { SectionA } from './SectionA'
import { SectionB } from './SectionB'
import { SectionC } from './SectionC'

/** Single deal ID for POC (no multi-deal routing yet). */
export const DEAL_ID = 'current'

type Tab = 'A' | 'B' | 'C'

const TABS: { id: Tab; label: string; sub: string }[] = [
  { id: 'A', label: 'Capital Stack',  sub: 'Purchase, debt & leverage'  },
  { id: 'B', label: 'Profit Split',   sub: 'Pref return & waterfall'     },
  { id: 'C', label: 'Fees',           sub: 'Acquisition, AM & other'     },
]

export const Economics: React.FC = () => {
  const [tab, setTab] = useState<Tab>('A')

  const getOrCreateDeal = useEconomicsStore(s => s.getOrCreateDeal)
  const lockEconomics   = useEconomicsStore(s => s.lockEconomics)
  const unlockEconomics = useEconomicsStore(s => s.unlockEconomics)
  const deal = useEconomicsStore(s => s.deals.find(d => d.dealId === DEAL_ID))

  // Seed deal on first mount
  useEffect(() => { getOrCreateDeal(DEAL_ID) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!deal) return null

  const doneA = deal.sectionAComplete
  const doneB = deal.sectionBComplete
  const doneC = deal.sectionCComplete

  // Live error counts drive the "needs attention" indicator even before explicit complete
  const errCountA = validateSectionA(deal).length
  const errCountB = validateSectionB(deal).length
  const errCountC = validateSectionC(deal).length

  const locked  = isEconomicsLocked(deal)
  const canLock = canLockEconomics(deal)

  // Pre-compute so TypeScript doesn't lose narrowing inside the closure
  const hasPurchasePrice = !!deal.capitalStack?.purchasePrice
  const hasFeeAnswers    = deal.fees.some(f => f.enabled !== null)

  function tabDotClass(t: Tab, done: boolean, active: boolean, errCount: number): string {
    if (done)   return 'econ-tab-dot econ-tab-dot--done'
    if (active) return 'econ-tab-dot econ-tab-dot--active'
    if (errCount === 0 && t === 'A' && hasPurchasePrice) return 'econ-tab-dot econ-tab-dot--valid'
    if (errCount === 0 && t === 'C' && hasFeeAnswers)    return 'econ-tab-dot econ-tab-dot--valid'
    return 'econ-tab-dot'
  }

  return (
    <div className="econ-root">

      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <h1>Deal Economics</h1>
          <p className="page-subtitle">Capital structure, profit split &amp; fee schedule</p>
        </div>
        {locked && (
          <span className="econ-locked-badge" aria-label="Economics locked">
            <span aria-hidden="true">🔒</span> Locked
          </span>
        )}
      </div>

      {/* ── Section tabs ── */}
      <div className="econ-tabs" role="tablist" aria-label="Economics sections">
        {TABS.map(t => {
          const active = tab === t.id
          const done   = t.id === 'A' ? doneA : t.id === 'B' ? doneB : doneC
          const errs   = t.id === 'A' ? errCountA : t.id === 'B' ? errCountB : errCountC
          return (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={active}
              className={['econ-tab', active ? 'econ-tab--active' : ''].filter(Boolean).join(' ')}
              onClick={() => setTab(t.id)}
            >
              <span className={tabDotClass(t.id, done, active, errs)} aria-hidden="true">
                {done ? '✓' : t.id}
              </span>
              <span className="econ-tab-info">
                <span className="econ-tab-label">{t.label}</span>
                <span className="econ-tab-sub">{t.sub}</span>
              </span>
            </button>
          )
        })}
      </div>

      {/* ── Active section ── */}
      <div className="econ-body">
        {tab === 'A' && <SectionA dealId={DEAL_ID} locked={locked} setTab={setTab} />}
        {tab === 'B' && <SectionB dealId={DEAL_ID} locked={locked} setTab={setTab} />}
        {tab === 'C' && <SectionC dealId={DEAL_ID} locked={locked} />}
      </div>

      {/* ── Lock / Unlock bar ── */}
      {locked ? (
        <div className="econ-lock-bar econ-lock-bar--locked">
          <div className="econ-lock-bar-inner">
            <div className="econ-lock-bar-msg">
              <strong>Economics locked</strong>
              <span>
                Locked{' '}
                {new Date(deal.lockedAt!).toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric', year: 'numeric',
                })}
              </span>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => unlockEconomics(DEAL_ID, 'Manual unlock')}
            >
              Unlock
            </button>
          </div>
        </div>
      ) : canLock ? (
        <div className="econ-lock-bar econ-lock-bar--ready">
          <div className="econ-lock-bar-inner">
            <div className="econ-lock-bar-msg">
              <strong>All sections complete</strong>
              <span>Lock the economics to proceed to SPV formation.</span>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => lockEconomics(DEAL_ID, 'GP')}
            >
              Lock Economics
            </button>
          </div>
        </div>
      ) : null}

    </div>
  )
}
