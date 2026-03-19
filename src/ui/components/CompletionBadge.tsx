import React from 'react'
import { useAppStore } from '../../state/store'

/**
 * Overall deal completion estimate shown as an animated pill badge.
 * Heuristic: measures serialised data payload vs. an "ideal" baseline.
 */
export const CompletionBadge: React.FC = () => {
  const data = useAppStore((s) => s.data)

  // Count meaningful filled fields rather than raw serialised size
  const deal = data.deal
  const offering = data.offering
  const dealFields = [
    deal.entityName, deal.formationState, deal.registeredAgentName,
    deal.propertyAddress, deal.propertyCity, deal.propertyState, deal.propertyZip,
    deal.gpSignerName, deal.ein,
  ]
  const offeringFields = [
    offering.offeringExemption, offering.minimumInvestment,
    offering.preferredReturnRate, offering.gpPromote,
  ]

  const filled  = [...dealFields, ...offeringFields].filter(Boolean).length
  const total   = dealFields.length + offeringFields.length
  const invPct  = data.investors.length > 0 ? 1 : 0
  const pct     = Math.min(100, Math.round(((filled / total) * 0.7 + invPct * 0.3) * 100))
  const complete = pct >= 90

  return (
    <div
      className={`completion-badge${complete ? ' completion-badge--complete' : ''}`}
      title={`${pct}% of deal data complete`}
    >
      <div className="completion-badge-bar" aria-hidden="true">
        <div className="completion-badge-fill" style={{ width: `${pct}%` }} />
      </div>
      <span>{pct}% complete</span>
    </div>
  )
}

export default CompletionBadge
