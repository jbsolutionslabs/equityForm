import React from 'react'
import { useAppStore, isSpvFormed } from '../../state/store'
import { useEconomicsStore, isEconomicsLocked } from '../../state/economicsStore'
import type { AppData } from '../../state/store'

interface Props {
  dealId?: string
}

// Mirror the 8-stage gate functions from DealsList (single source of truth for stage done-state)
function stagesDone(data: AppData, econLocked: boolean): number {
  const checks = [
    () => !!(data.deal.entityName && data.offering.offeringExemption),
    () => econLocked,
    () => isSpvFormed(data),
    () => data.operatingAgreement?.status === 'signed',
    () => data.investors.length > 0 && data.subscriptions.some((s) => s.status !== 'pending'),
    () => data.subscriptions.length > 0 && data.subscriptions.every((s) => s.status === 'signed' || s.status === 'paid'),
    () => data.subscriptions.length > 0 && data.subscriptions.every((s) => s.status === 'paid'),
    () => !!data.deal.capTableLockedAt,
  ]
  return checks.filter((fn) => fn()).length
}

const TOTAL_STAGES = 8

/**
 * Overall deal completion shown as an animated pill badge.
 * Completion = stages done / 8 total stages (same gate logic as the stepper).
 */
export const CompletionBadge: React.FC<Props> = ({ dealId }) => {
  const data = useAppStore((s) =>
    dealId ? s.deals[dealId]?.data : Object.values(s.deals)[0]?.data
  )
  const econDeal  = useEconomicsStore((s) => s.deals.find((d) => d.dealId === dealId))
  const econLocked = isEconomicsLocked(econDeal)

  if (!data) return null

  const done     = stagesDone(data, econLocked)
  const pct      = Math.round((done / TOTAL_STAGES) * 100)
  const complete = done === TOTAL_STAGES

  return (
    <div
      className={`completion-badge${complete ? ' completion-badge--complete' : ''}`}
      title={`${done} of ${TOTAL_STAGES} stages complete`}
      aria-label={`${pct}% complete`}
    >
      <div className="completion-badge-bar" aria-hidden="true">
        <div className="completion-badge-fill" style={{ width: `${pct}%` }} />
      </div>
      <span>{pct}% complete</span>
    </div>
  )
}

export default CompletionBadge
