/**
 * waterfallEngine.test.ts — Institutional waterfall engine tests
 *
 * Spec vectors A-E:
 *   A. Operating year distribution (pref → RoC → no promote)
 *   B. Refi cashout, promoteOnRefi=false → RoC only (institutional lookback)
 *   C. Refi-then-sale: terminal promote unlocked
 *   D. Clawback: promoteOnRefi=true + weak sale → GP returns over-collected promote
 *   E. sizeLoan min_of: returns smaller of LTV / DY constraints
 *
 * Supplemental tests:
 *   - calcPrepaymentPenalty (step-down)
 *   - xirr convergence
 *   - annualDebtConstant formula
 *   - accruePref modes
 *   - buildDealWaterfallConfig converter
 */

import { describe, it, expect } from 'vitest'
import {
  distribute,
  sizeLoan,
  calcPrepaymentPenalty,
  xirr,
  annualDebtConstant,
  accruePref,
  buildDealWaterfallConfig,
  computeClawback,
  remainingPrincipal,
} from '../waterfallEngine'
import type {
  DealWaterfallConfig,
  DealWaterfallState,
  ProfitSplitConfig,
} from '../../state/economicsTypes'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<DealWaterfallConfig> = {}): DealWaterfallConfig {
  return {
    lpOwnership:       0.9,
    gpOwnership:       0.1,
    prefRate:          0.08,
    prefType:          'SIMPLE',
    tiers:             [{ lpSplit: 70, gpSplit: 30 }],
    hurdleBasis:       'IRR',
    promoteOnRefi:     false,
    clawback:          false,
    distributeResidual: true,
    ...overrides,
  }
}

function makeState(opts: {
  lpUnreturned?: number;
  gpUnreturned?: number;
  lpAccruedPref?: number;
  gpAccruedPref?: number;
  lpFlows?: { date: string; amount: number }[];
  cumulativeGpPromote?: number;
} = {}): DealWaterfallState {
  const lpUnreturned = opts.lpUnreturned ?? 0
  return {
    lp: {
      unreturnedCapital: lpUnreturned,
      accruedPrefUnpaid: opts.lpAccruedPref ?? 0,
      flows: opts.lpFlows ?? [{ date: '2024-01', amount: -lpUnreturned }],
    },
    gp: {
      unreturnedCapital: opts.gpUnreturned ?? 0,
      accruedPrefUnpaid: opts.gpAccruedPref ?? 0,
      flows: [],
    },
    cumulativeGpPromote: opts.cumulativeGpPromote ?? 0,
  }
}

// ─── Vector A — Operating year distribution ───────────────────────────────────

describe('Vector A — operating year: pref → RoC → no promote', () => {

  it('allocates pref first, then RoC pro-rata; no promote (capital not yet returned)', () => {
    // LP 90% / GP 10%; equity = $5,355,000
    const config = makeConfig({ lpOwnership: 0.9, gpOwnership: 0.1 })
    const state  = makeState({
      lpUnreturned: 4_819_500,
      gpUnreturned: 535_500,
      lpAccruedPref: 385_560,
    })

    const { result, newState } = distribute(1_206_028, config, state, { allowPromote: true, date: '2025-01' })

    // LP gets all accrued pref first
    expect(result.lpPref).toBeCloseTo(385_560, 0)

    // After pref: 1,206,028 - 385,560 = 820,468; LP gets 90%, GP gets 10%
    expect(result.lpRoC).toBeCloseTo(820_468 * 0.9, 0) // ≈ 738,421
    expect(result.gpRoC).toBeCloseTo(820_468 * 0.1, 0) // ≈ 82,047

    // No promote: capital not fully returned
    expect(result.lpPromote).toBe(0)
    expect(result.gpPromote).toBe(0)

    // Total distributed ≤ cash in
    const lpTotal = result.lpPref + result.lpRoC + result.lpPromote
    const gpTotal = result.gpRoC + result.gpPromote
    expect(lpTotal + gpTotal).toBeCloseTo(1_206_028, 0)

    // New unreturned capital = 5,355,000 - 820,468 = 4,534,532
    const newUnreturned = newState.lp.unreturnedCapital + newState.gp.unreturnedCapital
    expect(newUnreturned).toBeCloseTo(4_534_532, 0)

    // Accrued pref cleared
    expect(newState.lp.accruedPrefUnpaid).toBeCloseTo(0, 0)

    // proposed flag always true
    expect(result.proposed).toBe(true)
  })

})

// ─── Vector B — Refi: promoteOnRefi=false → RoC only ────────────────────────

describe('Vector B — refi cashout, institutional lookback (no promote)', () => {

  it('distributes refi cashout as RoC only when promoteOnRefi=false', () => {
    // State after Vector A: unreturned = 4,534,532; pref cleared
    const config = makeConfig({ lpOwnership: 0.9, gpOwnership: 0.1, promoteOnRefi: false })
    const state  = makeState({
      lpUnreturned: 4_819_500 - Math.round(820_468 * 0.9), // ≈ 4,081,079
      gpUnreturned: 535_500 - Math.round(820_468 * 0.1),   // ≈ 453,453
      lpAccruedPref: 0,
    })

    // MIN_OF refi: 65% LTV on $16M = $10.4M; old balloon $9.5M; refi costs 1% = $104K
    // cashOut = 10,400,000 - 9,500,000 - 104,000 = 796,000
    const newLoan   = sizeLoan('ltv', 0.65, { value: 16_000_000 }) // 10,400,000
    const refiCosts = newLoan * 0.01                                 // 104,000
    const cashOut   = newLoan - 9_500_000 - refiCosts                // 796,000

    const { result, newState } = distribute(cashOut, config, state, { allowPromote: false, date: '2026-01' })

    // No promote (allowPromote=false)
    expect(result.lpPromote).toBe(0)
    expect(result.gpPromote).toBe(0)
    expect(result.lpPref).toBe(0) // pref was cleared

    // After: unreturned should decrease by cashOut
    const newUnreturned = newState.lp.unreturnedCapital + newState.gp.unreturnedCapital
    expect(newUnreturned).toBeCloseTo(4_534_532 - cashOut, 0) // ≈ 3,738,532
  })

})

// ─── Vector C — Refi-then-sale: terminal promote unlocked ────────────────────

describe('Vector C — terminal sale after refi: full promote tier unlocks', () => {

  it('returns all remaining capital then splits promote at 50/50', () => {
    // State after refi (Vector B): unreturned = 3,738,532
    // Simulate exact state (LP 90%, GP 10% of 3,738,532)
    const lpUnreturned = 3_738_532 * 0.9  // 3,364,678.8
    const gpUnreturned = 3_738_532 * 0.1  // 373,853.2

    const config = makeConfig({
      lpOwnership: 0.9,
      gpOwnership: 0.1,
      tiers: [{ lpSplit: 50, gpSplit: 50 }], // 50/50 promote
    })
    const state = makeState({
      lpUnreturned,
      gpUnreturned,
      lpAccruedPref: 0,
    })

    // Sale: NOI $1.5M @ 6.0% cap = $25M; costs $500K; balloon $10.1M
    const grossValue   = 1_500_000 / 0.06  // 25,000,000
    const closingCosts = 500_000
    const netBeforePayoff = grossValue - closingCosts // 24,500,000
    const balloon = 10_100_000
    const netProceeds = netBeforePayoff - balloon      // 14,400,000

    const { result } = distribute(netProceeds, config, state, { allowPromote: true, date: '2029-01' })

    // All unreturned capital returned first
    expect(result.lpRoC).toBeCloseTo(lpUnreturned, 0)
    expect(result.gpRoC).toBeCloseTo(gpUnreturned, 0)

    // Remaining = 14,400,000 - 3,738,532 = 10,661,468 → 50/50 split
    const remainingAfterRoC = netProceeds - 3_738_532
    expect(result.lpPromote).toBeCloseTo(remainingAfterRoC * 0.5, 0)
    expect(result.gpPromote).toBeCloseTo(remainingAfterRoC * 0.5, 0)

    // LP total = lpRoC + lpPromote ≈ 8,695,413; GP ≈ 5,704,587
    const lpTotal = result.lpRoC + result.lpPromote
    const gpTotal = result.gpRoC + result.gpPromote
    expect(lpTotal).toBeCloseTo(8_695_413, -2) // within $100
    expect(gpTotal).toBeCloseTo(5_704_587, -2)
    expect(lpTotal + gpTotal).toBeCloseTo(netProceeds, 0)
  })

})

// ─── Vector D — Clawback ─────────────────────────────────────────────────────

describe('Vector D — clawback: over-collected promote returned at terminal sale', () => {

  it('returns clawback > 0 when LP did not hit hurdle and GP collected promote at refi', () => {
    const config = makeConfig({
      promoteOnRefi: true,
      clawback: true,
      tiers: [{ irrHurdle: 0.08, lpSplit: 70, gpSplit: 30 }],
    })

    // LP invested $1M, received back $800K — did NOT achieve 8% IRR
    const state = makeState({
      lpUnreturned: 0,
      gpUnreturned: 0,
      lpFlows: [
        { date: '2020-01', amount: -1_000_000 }, // LP equity in
        { date: '2023-01', amount:   800_000 },  // weak sale proceeds back to LP
      ],
      cumulativeGpPromote: 50_000, // GP collected $50K promote at refi
    })

    const clawback = computeClawback(config, state)
    expect(clawback).toBeGreaterThan(0)
    expect(clawback).toBe(50_000) // full clawback since LP missed hurdle
  })

  it('returns 0 clawback when LP exceeded hurdle', () => {
    const config = makeConfig({ clawback: true, tiers: [{ irrHurdle: 0.08, lpSplit: 70, gpSplit: 30 }] })

    // LP invested $1M, received back $1.3M over 3 years — well above 8% hurdle
    const state = makeState({
      lpFlows: [
        { date: '2020-01', amount: -1_000_000 },
        { date: '2023-01', amount:  1_300_000 },
      ],
      cumulativeGpPromote: 30_000,
    })

    const clawback = computeClawback(config, state)
    expect(clawback).toBe(0)
  })

  it('returns 0 clawback when clawback is disabled', () => {
    const config = makeConfig({ clawback: false, promoteOnRefi: true })
    const state  = makeState({ cumulativeGpPromote: 100_000 })
    expect(computeClawback(config, state)).toBe(0)
  })

})

// ─── Vector E — sizeLoan min_of ───────────────────────────────────────────────

describe('Vector E — sizeLoan min_of: returns the smallest constraint', () => {

  it('debt_yield 10% on $2M NOI → $20M', () => {
    expect(sizeLoan('debt_yield', 0.10, { noi: 2_000_000 })).toBeCloseTo(20_000_000, 0)
  })

  it('LTV 65% on $18M property → $11.7M', () => {
    expect(sizeLoan('ltv', 0.65, { value: 18_000_000 })).toBeCloseTo(11_700_000, 0)
  })

  it('min_of returns $11.7M (LTV) over $20M (DY) — smaller wins', () => {
    const result = sizeLoan('min_of', 0, {
      noi:       2_000_000,
      dyTarget:  0.10,       // DY constraint → $20M
      value:     18_000_000,
      ltvTarget: 0.65,       // LTV constraint → $11.7M
    })
    expect(result).toBeCloseTo(11_700_000, 0)
  })

  it('min_of with only one constraint returns that constraint', () => {
    const result = sizeLoan('min_of', 0, { value: 10_000_000, ltvTarget: 0.70 })
    expect(result).toBeCloseTo(7_000_000, 0)
  })

})

// ─── calcPrepaymentPenalty ────────────────────────────────────────────────────

describe('calcPrepaymentPenalty()', () => {

  it('step-down 3%/2%/1%: month 6 (year 0) → 3%', () => {
    expect(
      calcPrepaymentPenalty({ prepaymentPenaltyType: 'step_down', prepaymentPenaltySchedule: '3,2,1' }, 6, 1_000_000),
    ).toBeCloseTo(30_000, 0)
  })

  it('step-down: month 18 (year 1) → 2%', () => {
    expect(
      calcPrepaymentPenalty({ prepaymentPenaltyType: 'step_down', prepaymentPenaltySchedule: '3,2,1' }, 18, 1_000_000),
    ).toBeCloseTo(20_000, 0)
  })

  it('step-down: month 37 (beyond schedule) → 0', () => {
    expect(
      calcPrepaymentPenalty({ prepaymentPenaltyType: 'step_down', prepaymentPenaltySchedule: '3,2,1' }, 37, 1_000_000),
    ).toBe(0)
  })

  it('none → 0', () => {
    expect(calcPrepaymentPenalty({ prepaymentPenaltyType: 'none' }, 12, 500_000)).toBe(0)
  })

})

// ─── xirr ────────────────────────────────────────────────────────────────────

describe('xirr()', () => {

  it('-100 at date 0, +120 two years later → ≈ 9.54%', () => {
    const result = xirr([
      { date: '2024-01', amount: -100 },
      { date: '2026-01', amount:  120 },
    ])
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

// ─── annualDebtConstant ───────────────────────────────────────────────────────

describe('annualDebtConstant()', () => {

  it('6.5% rate, 360 months → ≈ 0.07579', () => {
    expect(annualDebtConstant(0.065, 360)).toBeCloseTo(0.07579, 3)
  })

  it('zero rate → 12/n = 1.0 for 12-month term', () => {
    expect(annualDebtConstant(0, 12)).toBeCloseTo(1.0, 5)
  })

})

// ─── accruePref ───────────────────────────────────────────────────────────────

describe('accruePref()', () => {

  it('SIMPLE: accrues on unreturned capital only', () => {
    const config = makeConfig({ prefRate: 0.08, prefType: 'SIMPLE' })
    const state  = makeState({ lpUnreturned: 1_000_000 })

    const newState = accruePref(config, state, 1.0) // 1 year
    expect(newState.lp.accruedPrefUnpaid).toBeCloseTo(80_000, 0) // 8% × $1M
  })

  it('COMPOUND: accrues on capital + outstanding pref', () => {
    const config = makeConfig({ prefRate: 0.08, prefType: 'COMPOUND' })
    const state  = makeState({ lpUnreturned: 1_000_000, lpAccruedPref: 80_000 })

    const newState = accruePref(config, state, 1.0)
    // 8% × (1,000,000 + 80,000) = 86,400
    expect(newState.lp.accruedPrefUnpaid).toBeCloseTo(80_000 + 86_400, 0)
  })

  it('zero prefRate → no change', () => {
    const config = makeConfig({ prefRate: 0 })
    const state  = makeState({ lpUnreturned: 1_000_000 })
    const newState = accruePref(config, state, 1.0)
    expect(newState.lp.accruedPrefUnpaid).toBe(0)
  })

})

// ─── buildDealWaterfallConfig ─────────────────────────────────────────────────

describe('buildDealWaterfallConfig()', () => {

  it('converts simple mode ProfitSplitConfig correctly', () => {
    const split: ProfitSplitConfig = {
      pref: { type: 'simple', rate: 0.08 },
      waterfall: { mode: 'simple', simpleLpSplit: 80 },
    }
    const cfg = buildDealWaterfallConfig(split, 0.9)

    expect(cfg.lpOwnership).toBe(0.9)
    expect(cfg.gpOwnership).toBeCloseTo(0.1, 10)
    expect(cfg.prefRate).toBe(0.08)
    expect(cfg.tiers).toHaveLength(1)
    expect(cfg.tiers[0].lpSplit).toBe(80)
    expect(cfg.tiers[0].gpSplit).toBe(20)
    expect(cfg.promoteOnRefi).toBe(false)
    expect(cfg.clawback).toBe(false)
  })

  it('passes promoteOnRefi and hasClawback from WaterfallConfig', () => {
    const split: ProfitSplitConfig = {
      pref: { type: 'simple', rate: 0.08 },
      waterfall: { mode: 'simple', simpleLpSplit: 70, promoteOnRefi: true, hasClawback: true },
    }
    const cfg = buildDealWaterfallConfig(split, 0.85)
    expect(cfg.promoteOnRefi).toBe(true)
    expect(cfg.clawback).toBe(true)
  })

})

// ─── distribute: edge cases ───────────────────────────────────────────────────

describe('distribute() edge cases', () => {

  it('no-pref deal: cash goes directly to RoC then promote', () => {
    const config = makeConfig({ prefRate: 0 })
    const state  = makeState({ lpUnreturned: 1_000_000, gpUnreturned: 111_111 })

    const { result } = distribute(200_000, config, state, { allowPromote: true })

    expect(result.lpPref).toBe(0)
    expect(result.lpRoC).toBeCloseTo(200_000 * 0.9, 0)
    expect(result.gpRoC).toBeCloseTo(200_000 * 0.1, 0)
    expect(result.lpPromote).toBe(0)
  })

  it('full capital return: promote tier activates with 80/20 split', () => {
    const config = makeConfig({
      lpOwnership: 0.8,
      gpOwnership: 0.2,
      tiers: [{ lpSplit: 80, gpSplit: 20 }],
    })
    // All capital already returned
    const state = makeState({ lpUnreturned: 0, gpUnreturned: 0, lpAccruedPref: 0 })

    const { result } = distribute(500_000, config, state, { allowPromote: true })

    expect(result.lpRoC).toBe(0)
    expect(result.gpRoC).toBe(0)
    expect(result.lpPromote).toBeCloseTo(500_000 * 0.8, 0)
    expect(result.gpPromote).toBeCloseTo(500_000 * 0.2, 0)
  })

  it('allowPromote=false skips promote even when capital is fully returned', () => {
    const config = makeConfig({ tiers: [{ lpSplit: 70, gpSplit: 30 }] })
    const state  = makeState({ lpUnreturned: 0, gpUnreturned: 0, lpAccruedPref: 0 })

    const { result } = distribute(100_000, config, state, { allowPromote: false })

    expect(result.lpPromote).toBe(0)
    expect(result.gpPromote).toBe(0)
    // Cash goes nowhere (no pref, no RoC, no promote) → retained
    const totalOut = result.lpPref + result.lpRoC + result.lpPromote + result.gpRoC + result.gpPromote
    expect(totalOut).toBe(0)
  })

})
