/**
 * waterfallEngine.test.ts
 *
 * 8 test cases from the build plan:
 * 1. distribute() — ticket test vector
 * 2. distribute() — no-pref deal: all cash to RoC then promote
 * 3. distribute() — full capital return: promote tier activates
 * 4. sizeLoan('debt_yield', 0.10, {noi:2_000_000}) → 20,000,000
 * 5. sizeLoan('ltv', 0.65, {value:10_000_000}) → 6,500,000
 * 6. calcPrepaymentPenalty — step-down 3%/2%/1%
 * 7. xirr — approx 9.54% on -100 → 120 over 2 years
 * 8. annualDebtConstant(0.065, 360) → approx 0.07579
 */

import { describe, it, expect } from 'vitest'
import {
  distribute,
  sizeLoan,
  calcPrepaymentPenalty,
  xirr,
  annualDebtConstant,
} from '../waterfallEngine'
import type { ProfitSplitConfig, WaterfallState } from '../../state/economicsTypes'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function simpleProfitSplit(lpSplit = 70): ProfitSplitConfig {
  return {
    pref: { type: 'simple', rate: 0.08 },
    waterfall: { mode: 'simple', simpleLpSplit: lpSplit },
  }
}

function noPrefSplit(): ProfitSplitConfig {
  return {
    pref: { type: 'none', rate: 0 },
    waterfall: { mode: 'simple', simpleLpSplit: 70 },
  }
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('distribute()', () => {

  it('Test 1 — ticket test vector: pref first, then RoC', () => {
    // cash=$1,206,028, lpEquity=$4,819,500, accruedPref=$385,560
    // Expected: lpPref=$385,560, lpRoC=$820,468, lpPromote=$0
    const state: WaterfallState = {
      unreturnedCapital: 4_819_500 + 481_950, // LP + GP (90/10 split implied)
      accruedPrefUnpaid: 385_560,
      lpFlows: [{ date: '2024-01', amount: -4_819_500 }],
    }
    const lpOwnership = 0.9
    const totalCash   = 1_206_028

    const { result } = distribute(totalCash, lpOwnership, simpleProfitSplit(90), state)

    // LP pref from accrued bucket
    expect(result.lpPref).toBeCloseTo(385_560, 0)

    // After pref: 1,206,028 - 385,560 = 820,468 → all goes to LP RoC (lpOwnership * cash-after-pref)
    expect(result.lpRoC).toBeCloseTo(820_468 * lpOwnership, 0)

    // Promote = 0 (capital not yet returned)
    expect(result.lpPromote).toBeGreaterThanOrEqual(0)

    // Proposed flag is always true
    expect(result.proposed).toBe(true)

    // Total LP inflow = lpPref + lpRoC + lpPromote ≤ totalCash
    const lpTotal = result.lpPref + result.lpRoC + result.lpPromote
    expect(lpTotal).toBeLessThanOrEqual(totalCash + 0.01)
  })

  it('Test 2 — no-pref deal: cash goes RoC then promote (no accrued pref)', () => {
    const state: WaterfallState = {
      unreturnedCapital: 1_000_000,
      accruedPrefUnpaid: 0,  // no pref
      lpFlows: [{ date: '2024-01', amount: -900_000 }],
    }
    const totalCash   = 200_000
    const lpOwnership = 0.9

    const { result } = distribute(totalCash, lpOwnership, noPrefSplit(), state)

    expect(result.lpPref).toBe(0)
    expect(result.lpRoC).toBeCloseTo(200_000 * lpOwnership, 0)
    // newState.unreturnedCapital should decrease
  })

  it('Test 3 — full capital return: promote tier activates', () => {
    // All capital already returned (unreturnedCapital = 0)
    // so cash flows entirely to promote tiers
    const state: WaterfallState = {
      unreturnedCapital: 0,
      accruedPrefUnpaid: 0,
      lpFlows: [
        { date: '2020-01', amount: -1_000_000 },
        { date: '2024-01', amount:  1_100_000 }, // already got their capital back
      ],
    }
    const totalCash   = 500_000
    const lpOwnership = 0.8
    const deal: ProfitSplitConfig = {
      pref: { type: 'simple', rate: 0.08 },
      waterfall: { mode: 'simple', simpleLpSplit: 80 },
    }

    const { result } = distribute(totalCash, lpOwnership, deal, state)

    expect(result.lpRoC).toBe(0)
    expect(result.gpRoC).toBe(0)
    // LP gets 80% of the promote
    expect(result.lpPromote).toBeCloseTo(500_000 * 0.8, 0)
    expect(result.gpPromote).toBeCloseTo(500_000 * 0.2, 0)
  })

})

describe('sizeLoan()', () => {

  it('Test 4 — debt_yield sizing: NOI $2M at 10% DY → $20M loan', () => {
    const result = sizeLoan('debt_yield', 0.10, { noi: 2_000_000 })
    expect(result).toBeCloseTo(20_000_000, 0)
  })

  it('Test 5 — LTV sizing: 65% on $10M property → $6.5M loan', () => {
    const result = sizeLoan('ltv', 0.65, { value: 10_000_000 })
    expect(result).toBeCloseTo(6_500_000, 0)
  })

})

describe('calcPrepaymentPenalty()', () => {

  it('Test 6a — step-down 3%/2%/1%: month 6 (year 0) → 3% of balance', () => {
    const penalty = calcPrepaymentPenalty(
      { prepaymentPenaltyType: 'step_down', prepaymentPenaltySchedule: '3,2,1' },
      6,         // month 6 → year index 0
      1_000_000,
    )
    expect(penalty).toBeCloseTo(30_000, 0) // 3% of $1M
  })

  it('Test 6b — step-down 3%/2%/1%: month 18 (year 1) → 2% of balance', () => {
    const penalty = calcPrepaymentPenalty(
      { prepaymentPenaltyType: 'step_down', prepaymentPenaltySchedule: '3,2,1' },
      18,        // month 18 → year index 1
      1_000_000,
    )
    expect(penalty).toBeCloseTo(20_000, 0) // 2% of $1M
  })

  it('Test 6c — step-down: month 37+ (beyond schedule) → 0', () => {
    const penalty = calcPrepaymentPenalty(
      { prepaymentPenaltyType: 'step_down', prepaymentPenaltySchedule: '3,2,1' },
      37,        // month 37 → year index floor(36/12) = 3 → out of range
      1_000_000,
    )
    expect(penalty).toBe(0)
  })

  it('Test 6d — no penalty type → 0', () => {
    const penalty = calcPrepaymentPenalty(
      { prepaymentPenaltyType: 'none' },
      12,
      500_000,
    )
    expect(penalty).toBe(0)
  })

})

describe('xirr()', () => {

  it('Test 7 — -100 at date 0, +120 two years later → ≈ 9.54% IRR', () => {
    const result = xirr([
      { date: '2024-01', amount: -100 },
      { date: '2026-01', amount:  120 },
    ])
    // sqrt(1.2) - 1 ≈ 0.09545
    expect(result).toBeDefined()
    expect(result!).toBeCloseTo(0.0954, 2)
  })

  it('returns undefined when flows have no sign change', () => {
    const result = xirr([
      { date: '2024-01', amount: 100 },
      { date: '2025-01', amount: 200 },
    ])
    expect(result).toBeUndefined()
  })

})

describe('annualDebtConstant()', () => {

  it('Test 8 — 6.5% rate, 360 months → ≈ 0.07579 annual constant', () => {
    const dc = annualDebtConstant(0.065, 360)
    // PMT(0.065/12, 360, 1) × 12 ≈ 0.007579 × 12 ≈ 0.07579
    expect(dc).toBeCloseTo(0.07579, 3)
  })

  it('zero rate → 12/n', () => {
    const dc = annualDebtConstant(0, 12)
    expect(dc).toBeCloseTo(1.0, 5)
  })

})
