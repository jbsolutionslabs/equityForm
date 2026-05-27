import React, { useState } from 'react'

type StepperProps = React.PropsWithChildren<{
  startIndex?: number
  value?: number                        // controlled mode — overrides internal state
  onStepChange?: (index: number) => void
  onFinish?: () => void
  finishLabel?: string
  nextDisabled?: (index: number) => boolean
  scopeLabel?: string
}>

export const Stepper: React.FC<StepperProps> = ({
  children,
  startIndex = 0,
  value,
  onStepChange,
  onFinish,
  finishLabel = 'Finish',
  nextDisabled,
  scopeLabel = 'This page',
}) => {
  const steps = React.Children.toArray(children)
  const [internalIndex, setInternalIndex] = useState(startIndex)
  const [shaking, setShaking] = useState(false)

  // If value prop is provided, use it (controlled). Otherwise use internal state.
  const index = value !== undefined ? value : internalIndex

  const isFirst = index === 0
  const isLast  = index === steps.length - 1
  const pct     = Math.round(((index + 1) / steps.length) * 100)
  const isNextDisabled = nextDisabled ? nextDisabled(index) : false

  const setIndex = (i: number) => {
    if (value === undefined) setInternalIndex(i)
    onStepChange?.(i)
  }

  const goNext = () => {
    if (isNextDisabled) {
      triggerShake()
      return
    }
    if (!isLast) {
      setIndex(index + 1)
    } else if (onFinish) {
      onFinish()
    }
  }

  const goBack = () => {
    if (!isFirst) setIndex(index - 1)
  }

  const triggerShake = () => {
    setShaking(true)
    window.setTimeout(() => setShaking(false), 500)
  }

  return (
    <div>
      {/* Progress */}
      <div className="stepper-progress" role="status" aria-label={`Step ${index + 1} of ${steps.length}`}>
        <div className="stepper-progress-header">
          <span className="stepper-progress-label">{scopeLabel} {index + 1} of {steps.length}</span>
          <span className="stepper-progress-pct">{pct}% complete</span>
        </div>
        <div
          className="stepper-progress-track"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="stepper-progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="stepper-dots" aria-hidden="true">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`stepper-dot ${
                i < index ? 'stepper-dot--done' : i === index ? 'stepper-dot--active' : 'stepper-dot--pending'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Step content */}
      <div className="stepper-content">
        {steps[index]}
      </div>

      {/* Navigation footer */}
      <div className="stepper-footer">
        <button
          type="button"
          onClick={goBack}
          disabled={isFirst}
          className="btn btn-ghost"
          aria-label="Go to previous question"
        >
          ← Back
        </button>

        <span className="stepper-footer-center" aria-hidden="true">
          {index + 1} / {steps.length}
        </span>

        <button
          type="button"
          onClick={isNextDisabled ? undefined : goNext}
          className={`btn btn-primary${shaking ? ' shake' : ''}`}
          aria-label={isLast ? finishLabel : 'Continue to next question'}
          disabled={isNextDisabled}
        >
          {isLast ? finishLabel : 'Continue →'}
        </button>
      </div>
    </div>
  )
}

/** Expose shake trigger via ref if needed by parent */
export const Step: React.FC<React.PropsWithChildren> = ({ children }) => (
  <div className="step">{children}</div>
)

export default Stepper
