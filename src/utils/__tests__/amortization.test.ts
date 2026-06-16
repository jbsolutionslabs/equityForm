/**
 * amortization.test.ts
 *
 * Tests for the loan interest upgrade:
 *   Part 1 — Day count fractions (ACT/360, ACT/365, 30/360, ACT/ACT)
 *   Part 2 — Rate curve interpolation + all-in floating rate
 *
 * Every scenario listed in the build guide's "How to know it works" checklist
 * has a corresponding test here.
 */

import { describe, it, expect } from 'vitest'
import {
  dayCountFraction,
  interpolateCurve,
  buildAmortizationSchedule,
} from '../amortization'
import type { DebtInstrument, RateCurve } from '../../state/economicsTypes'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Minimal floating-rate instrument. */
function floatingInstrument(overrides: Partial<DebtInstrument> = {}): DebtInstrument {
  return {
    id:                 'test-floating',
    position:           'senior',
    loanType:           'floating',
    loanAmount:         9_945_000,
    startDate:          '2024-01',
    dayCountConvention: 'actual_360',
    termYears:          5,
    amortizationYears:  30,
    spread:             0.025,          // 2.5%
    ...overrides,
  }
}

/** Minimal fixed-rate instrument. */
function fixedInstrument(overrides: Partial<DebtInstrument> = {}): DebtInstrument {
  return {
    id:                 'test-fixed',
    position:           'senior',
    loanType:           'fixed',
    loanAmount:         1_000_000,
    startDate:          '2024-01',
    dayCountConvention: 'actual_360',
    termYears:          5,
    amortizationYears:  30,
    fixedRate:          0.07,           // 7%
    ...overrides,
  }
}

/** Flat curve — every tenor at the same index rate. */
function flatCurve(indexRate: number): RateCurve {
  return {
    id:            'curve-flat',
    dealId:        'deal-1',
    name:          'Flat Test Curve',
    index:         'TERM_SOFR_1M',
    interpolation: 'FLAT_FORWARD',
    source:        'USER',
    points: [
      { tenorMonths: 1,   rate: indexRate },
      { tenorMonths: 60,  rate: indexRate },
    ],
  }
}

/** Rising SOFR curve: starts at startRate, ends at endRate at 60 months. */
function risingCurve(startRate: number, endRate: number): RateCurve {
  return {
    id:            'curve-rising',
    dealId:        'deal-1',
    name:          'Rising SOFR',
    index:         'TERM_SOFR_1M',
    interpolation: 'LINEAR',
    source:        'USER',
    points: [
      { tenorMonths: 0,  rate: startRate },
      { tenorMonths: 60, rate: endRate   },
    ],
  }
}

// ─── Part 1: Day count fraction ────────────────────────────────────────────────

describe('dayCountFraction', () => {

  // ── Actual/360 ────────────────────────────────────────────────────────────

  describe('Actual/360', () => {
    it('January has 31 actual days → 31/360', () => {
      const frac = dayCountFraction('2024-01', 'actual_360')
      expect(frac).toBeCloseTo(31 / 360, 10)
    })

    it('April has 30 actual days → 30/360', () => {
      const frac = dayCountFraction('2024-04', 'actual_360')
      expect(frac).toBeCloseTo(30 / 360, 10)
    })

    it('January fraction > April fraction (31-day month > 30-day month)', () => {
      const jan = dayCountFraction('2024-01', 'actual_360')
      const apr = dayCountFraction('2024-04', 'actual_360')
      expect(jan).toBeGreaterThan(apr)
    })

    it('Feb 2024 (leap year, 29 days) → 29/360', () => {
      const frac = dayCountFraction('2024-02', 'actual_360')
      expect(frac).toBeCloseTo(29 / 360, 10)
    })

    it('Feb 2025 (non-leap, 28 days) → 28/360', () => {
      const frac = dayCountFraction('2025-02', 'actual_360')
      expect(frac).toBeCloseTo(28 / 360, 10)
    })

    it('Leap Feb 2024 > non-leap Feb 2025 by exactly 1 day', () => {
      const leapFeb    = dayCountFraction('2024-02', 'actual_360')
      const nonLeapFeb = dayCountFraction('2025-02', 'actual_360')
      expect(leapFeb - nonLeapFeb).toBeCloseTo(1 / 360, 10)
    })

    it('February always shows least interest (shortest month)', () => {
      const feb = dayCountFraction('2025-02', 'actual_360')  // 28 days
      const mar = dayCountFraction('2025-03', 'actual_360')  // 31 days
      const jun = dayCountFraction('2025-06', 'actual_360')  // 30 days
      expect(feb).toBeLessThan(jun)
      expect(jun).toBeLessThan(mar)
    })
  })

  // ── Actual/365 ────────────────────────────────────────────────────────────

  describe('Actual/365', () => {
    it('Feb 2024 (leap year, 29 days) → 29/365, NOT 29/366', () => {
      const frac = dayCountFraction('2024-02', 'actual_365')
      expect(frac).toBeCloseTo(29 / 365, 10)
      // Explicitly confirm 366 is never used
      expect(frac).not.toBeCloseTo(29 / 366, 10)
    })

    it('Feb 2025 (non-leap, 28 days) → 28/365', () => {
      const frac = dayCountFraction('2025-02', 'actual_365')
      expect(frac).toBeCloseTo(28 / 365, 10)
    })

    it('January 2024 → 31/365', () => {
      const frac = dayCountFraction('2024-01', 'actual_365')
      expect(frac).toBeCloseTo(31 / 365, 10)
    })

    it('Leap year Feb and non-leap Feb differ under ACT/365 (both /365)', () => {
      const leap    = dayCountFraction('2024-02', 'actual_365')
      const nonLeap = dayCountFraction('2025-02', 'actual_365')
      // Differ by 1/365 (one extra day in numerator only)
      expect(leap - nonLeap).toBeCloseTo(1 / 365, 10)
    })
  })

  // ── 30/360 ────────────────────────────────────────────────────────────────

  describe('30/360', () => {
    it('Always returns exactly 30/360 for any month', () => {
      const jan = dayCountFraction('2024-01', 'thirty_360')
      const feb = dayCountFraction('2024-02', 'thirty_360')
      const apr = dayCountFraction('2024-04', 'thirty_360')
      expect(jan).toBeCloseTo(30 / 360, 10)
      expect(feb).toBeCloseTo(30 / 360, 10)
      expect(apr).toBeCloseTo(30 / 360, 10)
    })

    it('Leap Feb 2024 and non-leap Feb 2025 are identical under 30/360', () => {
      const leapFeb    = dayCountFraction('2024-02', 'thirty_360')
      const nonLeapFeb = dayCountFraction('2025-02', 'thirty_360')
      expect(leapFeb).toBe(nonLeapFeb)
    })
  })

  // ── Actual/Actual ─────────────────────────────────────────────────────────

  describe('Actual/Actual', () => {
    it('Feb 2024 (leap year) → 29/366', () => {
      const frac = dayCountFraction('2024-02', 'actual_actual')
      expect(frac).toBeCloseTo(29 / 366, 10)
    })

    it('Feb 2025 (non-leap) → 28/365', () => {
      const frac = dayCountFraction('2025-02', 'actual_actual')
      expect(frac).toBeCloseTo(28 / 365, 10)
    })

    it('January 2024 (leap year) → 31/366', () => {
      const frac = dayCountFraction('2024-01', 'actual_actual')
      expect(frac).toBeCloseTo(31 / 366, 10)
    })

    it('January 2025 (non-leap year) → 31/365', () => {
      const frac = dayCountFraction('2025-01', 'actual_actual')
      expect(frac).toBeCloseTo(31 / 365, 10)
    })
  })
})

// ─── Part 2a: Curve interpolation ─────────────────────────────────────────────

describe('interpolateCurve', () => {
  const curve: RateCurve = {
    id:            'c1',
    dealId:        'd1',
    name:          'Test Curve',
    index:         'TERM_SOFR_1M',
    interpolation: 'FLAT_FORWARD',
    source:        'USER',
    points: [
      { tenorMonths: 6,  rate: 0.043 },  // 4.3% at 6M
      { tenorMonths: 12, rate: 0.041 },  // 4.1% at 1Y
      { tenorMonths: 60, rate: 0.039 },  // 3.9% at 5Y
    ],
  }

  describe('FLAT_FORWARD (stair-step)', () => {
    it('Before first point → uses first point rate', () => {
      expect(interpolateCurve(curve, 0)).toBeCloseTo(0.043, 6)
      expect(interpolateCurve(curve, 3)).toBeCloseTo(0.043, 6)
    })

    it('At exact tenor → uses that rate', () => {
      expect(interpolateCurve(curve, 6)).toBeCloseTo(0.043, 6)
      expect(interpolateCurve(curve, 12)).toBeCloseTo(0.041, 6)
    })

    it('Between points → uses the lower bracket (stair-step)', () => {
      // Between 6M (4.3%) and 12M (4.1%) → should be 4.3% (lower bracket)
      expect(interpolateCurve(curve, 9)).toBeCloseTo(0.043, 6)
      // Between 12M (4.1%) and 60M (3.9%) → should be 4.1%
      expect(interpolateCurve(curve, 36)).toBeCloseTo(0.041, 6)
    })

    it('After last point → uses last point rate', () => {
      expect(interpolateCurve(curve, 72)).toBeCloseTo(0.039, 6)
      expect(interpolateCurve(curve, 120)).toBeCloseTo(0.039, 6)
    })
  })

  describe('LINEAR', () => {
    const linCurve: RateCurve = { ...curve, interpolation: 'LINEAR' }

    it('At exact tenor → uses that rate', () => {
      expect(interpolateCurve(linCurve, 6)).toBeCloseTo(0.043, 6)
      expect(interpolateCurve(linCurve, 12)).toBeCloseTo(0.041, 6)
    })

    it('Midpoint between two points → arithmetic average', () => {
      // Midpoint of 6M (4.3%) and 12M (4.1%) is at 9M → (4.3 + 4.1) / 2 = 4.2%
      expect(interpolateCurve(linCurve, 9)).toBeCloseTo(0.042, 6)
    })

    it('25% of the way through → correct linear interpolation', () => {
      // 6M → 12M: rate goes from 4.3 to 4.1 over 6 months
      // At 7.5M (25% of way): 4.3 - 0.25 × 0.2 = 4.25%
      expect(interpolateCurve(linCurve, 7.5)).toBeCloseTo(0.0425, 6)
    })

    it('Before first point → first rate (no extrapolation back)', () => {
      expect(interpolateCurve(linCurve, 0)).toBeCloseTo(0.043, 6)
    })

    it('After last point → last rate (no extrapolation forward)', () => {
      expect(interpolateCurve(linCurve, 100)).toBeCloseTo(0.039, 6)
    })
  })

  it('Empty curve → returns 0', () => {
    const empty: RateCurve = { ...curve, points: [] }
    expect(interpolateCurve(empty, 12)).toBe(0)
  })

  it('Single-point curve → always returns that rate', () => {
    const single: RateCurve = { ...curve, points: [{ tenorMonths: 12, rate: 0.05 }] }
    expect(interpolateCurve(single, 1)).toBeCloseTo(0.05, 6)
    expect(interpolateCurve(single, 12)).toBeCloseTo(0.05, 6)
    expect(interpolateCurve(single, 100)).toBeCloseTo(0.05, 6)
  })
})

// ─── Part 2b: Wells Fargo example — the stated bug fix ───────────────────────

describe('Wells Fargo example ($9.945M, SOFR + 2.5%, ACT/360)', () => {
  const loan = floatingInstrument()  // $9,945,000 at SOFR + 2.5%, starts Jan 2024

  it('WITHOUT a curve: first-month interest uses spread alone (legacy ~2.5%)', () => {
    // Old bug: only the 2.5% spread is used when no curve and no manualRate
    const schedule = buildAmortizationSchedule(loan)
    const row1     = schedule.rows[0]
    // $9,945,000 × 2.5% × 31/360 ≈ $21,384 (spread only, ACT/360)
    const expected = 9_945_000 * 0.025 * (31 / 360)
    expect(row1.interest).toBeCloseTo(expected, 0)
  })

  it('WITH a flat SOFR curve at 4.5%: all-in = 4.5% + 2.5% = 7.0%', () => {
    const curve    = flatCurve(0.045)
    const schedule = buildAmortizationSchedule(loan, curve)
    const row1     = schedule.rows[0]

    // Jan 2024 has 31 days
    // $9,945,000 × 7% × 31/360 = $59,946.25
    const expected = 9_945_000 * 0.07 * (31 / 360)
    expect(row1.interest).toBeCloseTo(expected, 0)
    expect(row1.interest).toBeGreaterThan(59_900)
    expect(row1.interest).toBeLessThan(60_000)
  })

  it('Jan interest > Apr interest at same all-in rate (31 days vs 30 days)', () => {
    // Use IO loan with rateIsFloating so balance stays flat (no principal payments),
    // isolating the day-count effect. rateIsFloating: true makes the IO builder use the curve.
    const ioLoan   = floatingInstrument({ loanType: 'io', rateIsFloating: true })
    const curve    = flatCurve(0.045)
    const schedule = buildAmortizationSchedule(ioLoan, curve)
    const jan      = schedule.rows[0]  // 2024-01, 31 days
    const apr      = schedule.rows[3]  // 2024-04, 30 days
    expect(jan.interest).toBeGreaterThan(apr.interest)
    // With flat balance, difference is exactly 1 day of interest at 7% ÷ 360
    const oneDayOfInterest = 9_945_000 * 0.07 / 360
    expect(jan.interest - apr.interest).toBeCloseTo(oneDayOfInterest, 0)
  })

  it('Leap Feb 2024 has more interest than non-leap Feb 2025', () => {
    // Same loan; same balance is unlikely after 13 months, so test dayCountFraction directly
    // (The interest difference is 1 day × rate × balance / 360)
    const curve    = flatCurve(0.045)
    const schedule = buildAmortizationSchedule(loan, curve)
    const feb2024  = schedule.rows[1]   // period 2 = 2024-02
    const feb2025  = schedule.rows[13]  // period 14 = 2025-02

    // Balances differ after amortization, so compare fractions directly
    const frac2024 = 29 / 360
    const frac2025 = 28 / 360
    const rate     = 0.07

    // Feb 2024 interest per $1 of balance should be greater (29 vs 28 days)
    expect(feb2024.interest / feb2024.beginBalance).toBeCloseTo(rate * frac2024, 8)
    expect(feb2025.interest / feb2025.beginBalance).toBeCloseTo(rate * frac2025, 8)
    expect(feb2024.interest / feb2024.beginBalance).toBeGreaterThan(
      feb2025.interest / feb2025.beginBalance
    )
  })
})

// ─── Part 2c: Rate curve scenarios ───────────────────────────────────────────

describe('Floating schedule with rate curve', () => {
  it('Rising SOFR → interest amount increases each month (on flat balance IO loan)', () => {
    // Use IO loan so balance stays flat, isolating the rate effect
    const loan = floatingInstrument({
      loanType:           'io',
      termYears:          5,
      dayCountConvention: 'thirty_360',  // 30/360 so months are equal; only rate changes
    })
    const curve    = risingCurve(0.03, 0.055)  // SOFR rises 3% → 5.5% over 60 months (LINEAR)
    const schedule = buildAmortizationSchedule(loan, curve)

    // With LINEAR interpolation and rising rate, each successive period should
    // have higher (or equal) interest
    for (let i = 1; i < schedule.rows.length; i++) {
      expect(schedule.rows[i].interest).toBeGreaterThanOrEqual(schedule.rows[i - 1].interest)
    }
  })

  it('Flat curve at rate R = same interest as fixed loan at R% (30/360)', () => {
    // With 30/360 and a flat SOFR curve, the floating schedule should exactly
    // match a fixed-rate loan at (SOFR + spread)
    const fixedRate = 0.07  // 7% all-in
    const spread    = 0.025 // 2.5% spread
    const sofr      = fixedRate - spread // 4.5% SOFR

    const floatLoan  = floatingInstrument({
      loanAmount:         1_000_000,
      startDate:          '2024-01',
      dayCountConvention: 'thirty_360',
      termYears:          5,
      amortizationYears:  30,
    })
    const fixedLoan  = fixedInstrument({
      loanAmount:         1_000_000,
      startDate:          '2024-01',
      dayCountConvention: 'thirty_360',
      termYears:          5,
      amortizationYears:  30,
      fixedRate,
    })

    const curve     = flatCurve(sofr)
    const floatSch  = buildAmortizationSchedule(floatLoan, curve)
    const fixedSch  = buildAmortizationSchedule(fixedLoan)

    // Every row's interest should match (within floating-point precision)
    floatSch.rows.forEach((row, i) => {
      expect(row.interest).toBeCloseTo(fixedSch.rows[i].interest, 2)
    })
  })

  it('Floor clamps index before adding spread', () => {
    // SOFR curve shows 1% but floor is 2% → effective index = 2%, all-in = 4.5%
    const loan = floatingInstrument({
      loanAmount:         1_000_000,
      dayCountConvention: 'thirty_360',
      termYears:          1,
      amortizationYears:  30,
      spread:             0.025,
      floor:              0.02,   // 2% floor on index
    })
    const lowSofrCurve: RateCurve = {
      ...flatCurve(0.01),  // SOFR at 1% (below floor)
      id: 'low-sofr',
    }
    const schedule  = buildAmortizationSchedule(loan, lowSofrCurve)
    const row1      = schedule.rows[0]

    // Should use floor (2%) + spread (2.5%) = 4.5% all-in, not 1% + 2.5% = 3.5%
    const expectedAtFloor = 1_000_000 * 0.045 * (30 / 360)
    const expectedNoFloor = 1_000_000 * 0.035 * (30 / 360)
    expect(row1.interest).toBeCloseTo(expectedAtFloor, 2)
    expect(row1.interest).not.toBeCloseTo(expectedNoFloor, 0)
  })

  it('Cap clamps all-in rate after adding spread', () => {
    // SOFR = 8% + spread 2.5% = 10.5% all-in, but cap = 9%
    const loan = floatingInstrument({
      loanAmount:         1_000_000,
      dayCountConvention: 'thirty_360',
      termYears:          1,
      amortizationYears:  30,
      spread:             0.025,
      cap:                0.09,   // 9% cap on all-in
    })
    const highSofrCurve: RateCurve = {
      ...flatCurve(0.08),
      id: 'high-sofr',
    }
    const schedule = buildAmortizationSchedule(loan, highSofrCurve)
    const row1     = schedule.rows[0]

    // Should use cap 9%, not 10.5%
    const expectedAtCap  = 1_000_000 * 0.09 * (30 / 360)
    const expectedNoCap  = 1_000_000 * 0.105 * (30 / 360)
    expect(row1.interest).toBeCloseTo(expectedAtCap, 2)
    expect(row1.interest).not.toBeCloseTo(expectedNoCap, 0)
  })

  it('manualRate used as all-in fallback when no curve provided', () => {
    const loan = floatingInstrument({
      loanAmount:         1_000_000,
      dayCountConvention: 'thirty_360',
      termYears:          1,
      amortizationYears:  30,
      manualRate:         0.07,  // 7% all-in flat
      spread:             0.025,
    })
    const schedule = buildAmortizationSchedule(loan)
    const row1     = schedule.rows[0]

    // Should use manualRate (7%) not spread (2.5%)
    const expected = 1_000_000 * 0.07 * (30 / 360)
    expect(row1.interest).toBeCloseTo(expected, 2)
  })
})

// ─── Schedule integrity (totals balance) ─────────────────────────────────────

describe('Schedule totals integrity (interest + principal = payments)', () => {
  it('Fixed rate loan: sum of interest + sum of principal = sum of payments', () => {
    const loan     = fixedInstrument()
    const schedule = buildAmortizationSchedule(loan)
    const sumInt   = schedule.rows.reduce((s, r) => s + r.interest,  0)
    const sumPrin  = schedule.rows.reduce((s, r) => s + r.principal, 0)
    const sumPay   = schedule.rows.reduce((s, r) => s + r.payment,   0)

    expect(sumInt  + sumPrin).toBeCloseTo(sumPay, 2)
    expect(schedule.totalInterest  + schedule.totalPrincipal).toBeCloseTo(schedule.totalPayments, 2)
  })

  it('Floating loan with curve: totals balance', () => {
    const loan     = floatingInstrument({ loanAmount: 1_000_000, termYears: 5, amortizationYears: 30 })
    const curve    = flatCurve(0.045)
    const schedule = buildAmortizationSchedule(loan, curve)
    const sumInt   = schedule.rows.reduce((s, r) => s + r.interest,  0)
    const sumPrin  = schedule.rows.reduce((s, r) => s + r.principal, 0)
    const sumPay   = schedule.rows.reduce((s, r) => s + r.payment,   0)

    expect(sumInt  + sumPrin).toBeCloseTo(sumPay, 2)
    expect(schedule.totalInterest  + schedule.totalPrincipal).toBeCloseTo(schedule.totalPayments, 2)
  })

  it('IO loan: totalPrincipal = 0, totalPayments = totalInterest', () => {
    const loan     = floatingInstrument({ loanType: 'io', termYears: 3, dayCountConvention: 'thirty_360' })
    const curve    = flatCurve(0.045)
    const schedule = buildAmortizationSchedule(loan, curve)

    expect(schedule.totalPrincipal).toBe(0)
    expect(schedule.totalPayments).toBeCloseTo(schedule.totalInterest, 2)
  })

  it('Each row: payment = interest + principal', () => {
    const loan     = fixedInstrument({ dayCountConvention: 'actual_360' })
    const schedule = buildAmortizationSchedule(loan)

    schedule.rows.forEach((row, i) => {
      expect(row.payment).toBeCloseTo(row.interest + row.principal, 6,
        `Row ${i + 1}: payment (${row.payment}) should equal interest (${row.interest}) + principal (${row.principal})`
      )
    })
  })

  it('Loan fully amortizes: end balance of last row ≈ 0 (30/360 so PMT and day-count match exactly)', () => {
    // ACT/360 creates a small residue because PMT uses rate/12 but interest
    // uses actual days. 30/360 = exactly 1/12 every month → guaranteed zero balance.
    const loan     = fixedInstrument({ termYears: 5, amortizationYears: 5, dayCountConvention: 'thirty_360' })
    const schedule = buildAmortizationSchedule(loan)
    const lastRow  = schedule.rows[schedule.rows.length - 1]
    expect(lastRow.endBalance).toBeCloseTo(0, 0)
  })
})

// ─── Day count: cross-convention sanity ──────────────────────────────────────

describe('Cross-convention interest comparison on fixed loan', () => {
  it('ACT/360 > 30/360 for long months (31-day month)', () => {
    const base = { loanAmount: 1_000_000, startDate: '2024-01', termYears: 1, amortizationYears: 30, fixedRate: 0.07 }
    const act360 = buildAmortizationSchedule(fixedInstrument({ ...base, dayCountConvention: 'actual_360' }))
    const t360   = buildAmortizationSchedule(fixedInstrument({ ...base, dayCountConvention: 'thirty_360' }))

    // Jan has 31 actual days: 31/360 > 30/360
    expect(act360.rows[0].interest).toBeGreaterThan(t360.rows[0].interest)
  })

  it('ACT/360 < 30/360 for short months (28-day Feb)', () => {
    const base = { loanAmount: 1_000_000, startDate: '2025-02', termYears: 1, amortizationYears: 30, fixedRate: 0.07 }
    const act360 = buildAmortizationSchedule(fixedInstrument({ ...base, dayCountConvention: 'actual_360' }))
    const t360   = buildAmortizationSchedule(fixedInstrument({ ...base, dayCountConvention: 'thirty_360' }))

    // Feb 2025 has 28 actual days: 28/360 < 30/360
    expect(act360.rows[0].interest).toBeLessThan(t360.rows[0].interest)
  })

  it('ACT/365: Jan interest is less than ACT/360 (larger denominator)', () => {
    const base = { loanAmount: 1_000_000, startDate: '2024-01', termYears: 1, amortizationYears: 30, fixedRate: 0.07 }
    const act360 = buildAmortizationSchedule(fixedInstrument({ ...base, dayCountConvention: 'actual_360' }))
    const act365 = buildAmortizationSchedule(fixedInstrument({ ...base, dayCountConvention: 'actual_365' }))

    // 31/360 > 31/365
    expect(act360.rows[0].interest).toBeGreaterThan(act365.rows[0].interest)
  })
})
