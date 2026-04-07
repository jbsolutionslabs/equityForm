import React from 'react'

type ModuleProgressProps = {
  moduleLabel: 'Legal' | 'Accounting'
  step: number
  totalSteps: number
  stepTitle: string
  detail?: string
}

export const ModuleProgress: React.FC<ModuleProgressProps> = ({
  moduleLabel,
  step,
  totalSteps,
  stepTitle,
  detail,
}) => {
  const pct = Math.max(0, Math.min(100, Math.round((step / totalSteps) * 100)))

  return (
    <div className="module-progress" role="status" aria-label={`${moduleLabel} step ${step} of ${totalSteps}`}>
      <div className="module-progress-top">
        <span className="module-progress-module">{moduleLabel}</span>
        <span className="module-progress-step">Step {step} of {totalSteps}</span>
      </div>
      <div
        className="module-progress-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div className="module-progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="module-progress-detail">
        {stepTitle}
        {detail ? ` · ${detail}` : ''}
      </div>
    </div>
  )
}

export default ModuleProgress