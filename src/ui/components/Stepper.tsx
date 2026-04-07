import React, { useState } from 'react'

type StepperProps = React.PropsWithChildren<{
  startIndex?: number
  onFinish?: () => void
  finishLabel?: string
  nextDisabled?: (index: number) => boolean
}>

export const Stepper: React.FC<StepperProps> = ({
  children,
  startIndex = 0,
  onFinish,
  finishLabel = 'Finish',
  nextDisabled,
}) => {
  const steps = React.Children.toArray(children)
  const [index, setIndex]   = useState(startIndex)
  const [shaking, setShaking] = useState(false)

  const isFirst = index === 0
  const isLast  = index === steps.length - 1
  const pct     = Math.round(((index + 1) / steps.length) * 100)
  const isNextDisabled = nextDisabled ? nextDisabled(index) : false

  const goNext = () => {
    if (isNextDisabled) {
      triggerShake()
      return
    }
    if (!isLast) {
      setIndex((i) => i + 1)
    } else if (onFinish) {
      onFinish()
    }
  }

  const goBack = () => {
    if (!isFirst) setIndex((i) => i - 1)
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
          <span className="stepper-progress-label">Question {index + 1} of {steps.length}</span>
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
