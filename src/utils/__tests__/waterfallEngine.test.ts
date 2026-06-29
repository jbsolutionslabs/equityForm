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
 *   - computeProjection: Step 3 (combined distribution), saleAfterRefi
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
  computeProjection,
} from '../waterfallEngine'
import { computeSourcesAndUses } from '../sourcesAndUses'
import type {
  DealWaterfallConfig,
  DealWaterfallState,
  ProfitSplitConfig,
  ExitScenarioAssumptions,
  CapitalStack,
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

// ─── hurdleBasis = EQUITY_MULTIPLE ───────────────────────────────────────────

describe('distribute() — hurdleBasis EQUITY_MULTIPLE', () => {

  it('band model: tier 70/30 split applies when LP in 1.4–1.5× range', () => {
    // Band model (institutional): the LP/GP split applies to the ENTIRE band of LP
    // returns between hurdles — not just the above-hurdle residual.
    // LP invested $1M, has $1.4M so far (1.4×). Cash = $200K. Tier: 1.5×, 70/30.
    // Band to fill: LP needs $100K LP-dollars → bucket = $100K/0.70 = $142,857 total
    //   → LP $100K, GP $42,857 in-band.
    // Remaining $57,143: no catch-all tier → LP gets residual.
    const config = makeConfig({
      hurdleBasis: 'EQUITY_MULTIPLE',
      tiers: [{ irrHurdle: 1.5, lpSplit: 70, gpSplit: 30 }],
      lpOwnership: 1.0,
      gpOwnership: 0.0,
    })
    const state = makeState({ lpUnreturned: 0, gpUnreturned: 0, lpAccruedPref: 0 })
    const stateWithFlows = {
      ...state,
      lp: { ...state.lp, flows: [{ date: '2024-01', amount: -1_000_000 }, { date: '2025-01', amount: 1_400_000 }] },
    }

    const { result } = distribute(200_000, config, stateWithFlows, { allowPromote: true, date: '2026-01' })

    // Bucket fills: LP $100K, GP $42,857. Residual $57,143 → LP.
    // gpPromote = $42,857; lpPromote = $100K (in-band) + $57K (residual) ≈ $157,143
    expect(result.gpPromote).toBeCloseTo(42_857, 0)
    expect(result.lpPromote + result.gpPromote).toBeCloseTo(200_000, 0)
  })

  it('no promote when LP is below equity multiple (capital not fully returned)', () => {
    // LP invested $1M, received $0. $500K to distribute. 1.5× hurdle.
    // Capital not fully returned → promote gate blocks.
    const config = makeConfig({
      hurdleBasis: 'EQUITY_MULTIPLE',
      tiers: [{ irrHurdle: 1.5, lpSplit: 70, gpSplit: 30 }],
    })
    const state = makeState({ lpUnreturned: 1_000_000, gpUnreturned: 0 })
    const stateWithFlows = {
      ...state,
      lp: { ...state.lp, flows: [{ date: '2024-01', amount: -1_000_000 }] },
    }

    const { result } = distribute(500_000, config, stateWithFlows, { allowPromote: true, date: '2025-01' })

    expect(result.lpPromote).toBe(0)
    expect(result.gpPromote).toBe(0)
  })

})

// ─── Vectors F1/F2/F3 — Multi-tier equity multiple promote walk ───────────────
//
// 3-tier structure:
//   Tier 1: 1.5× hurdle, 80/20 (LP 80%, GP 20%)
//   Tier 2: 2.0× hurdle, 70/30 (LP 70%, GP 30%)
//   Tier 3: no hurdle (catch-all), 50/50
//
// LP invested $9M (90%), GP invested $1M (10%). Total equity = $10M.
//
// RoC is always returned first: LP $9M, GP $1M.
// Promote fires on remaining cash only after all capital is returned.

describe('Vectors F1/F2/F3 — multi-tier equity multiple promote walk', () => {

  // ─── Shared setup ──────────────────────────────────────────────────────────

  function makeEmTiers() {
    return makeConfig({
      hurdleBasis:  'EQUITY_MULTIPLE',
      lpOwnership:  0.9,
      gpOwnership:  0.1,
      tiers: [
        { irrHurdle: 1.5, lpSplit: 80, gpSplit: 20 },   // Tier 1: 1.0–1.5×
        { irrHurdle: 2.0, lpSplit: 70, gpSplit: 30 },   // Tier 2: 1.5–2.0×
        { irrHurdle: null, lpSplit: 50, gpSplit: 50 },  // Tier 3: 2.0×+
      ],
    })
  }

  function makeEmState() {
    return makeState({
      lpUnreturned:  9_000_000,
      gpUnreturned:  1_000_000,
      lpAccruedPref: 0,
      lpFlows: [{ date: '2024-01', amount: -9_000_000 }],
    })
  }

  // ─── Vector F1 — $13M cash: stays within Tier 1 band (1.27× LP multiple) ─

  it('F1: $13M — promote stays in Tier 1 (80/20); LP total $11.4M (1.27×)', () => {
    // After RoC ($10M): $3M remaining. Tier 1 band needs $4.5M LP → bucket $5.625M.
    // $3M < $5.625M → tier 1 not filled; split all $3M at 80/20.
    // LP: $9M + $2.4M = $11.4M (1.267×). GP: $1M + $0.6M = $1.6M.
    const { result } = distribute(13_000_000, makeEmTiers(), makeEmState(), {
      allowPromote: true,
      date: '2029-01',
    })

    expect(result.lpRoC).toBeCloseTo(9_000_000, 0)
    expect(result.gpRoC).toBeCloseTo(1_000_000, 0)
    const lpTotal = result.lpRoC + result.lpPromote
    const gpTotal = result.gpRoC + result.gpPromote
    expect(lpTotal).toBeCloseTo(11_400_000, 0)
    expect(gpTotal).toBeCloseTo(1_600_000, 0)
    expect(lpTotal + gpTotal).toBeCloseTo(13_000_000, 0)
  })

  // ─── Vector F2 — $18M cash: Tier 1 full, Tier 2 partial (1.69× LP multiple) ─

  it('F2: $18M — promote walks Tier 1 and into Tier 2; LP total $15,162,500 (1.69×)', () => {
    // After RoC ($10M): $8M remaining.
    // Tier 1 (1.5×, 80/20): LP needs $4.5M → bucket $5.625M → LP $4.5M, GP $1.125M; cash $2.375M
    // Tier 2 (2.0×, 70/30): LP needs $4.5M → bucket $6.43M; $2.375M < bucket → split all 70/30
    //   → LP $2.375M × 0.7 = $1,662,500; GP $712,500.
    // LP total: $9M + $4.5M + $1,662,500 = $15,162,500. GP: $1M + $1,125K + $712.5K = $2,837,500.
    const { result } = distribute(18_000_000, makeEmTiers(), makeEmState(), {
      allowPromote: true,
      date: '2029-01',
    })

    const lpTotal = result.lpRoC + result.lpPromote
    const gpTotal = result.gpRoC + result.gpPromote
    expect(lpTotal).toBeCloseTo(15_162_500, -1)  // within $10
    expect(gpTotal).toBeCloseTo(2_837_500, -1)
    expect(lpTotal + gpTotal).toBeCloseTo(18_000_000, 0)
  })

  // ─── Vector F3 — $30M cash: all 3 tiers (2.44× LP multiple) ─────────────────
  // This was "the live bug": old engine returned flat 80/20 instead of walking tiers.

  it('F3: $30M — promote walks all 3 tiers; LP total $21,973,214 (2.44×)', () => {
    // After RoC ($10M): $20M remaining.
    // Tier 1 (1.5×, 80/20): bucket $5.625M → LP $4.5M, GP $1.125M; cash $14.375M
    // Tier 2 (2.0×, 70/30): bucket $6,428,571 → LP $4.5M, GP $1,928,571; cash $7,946,429
    // Tier 3 (catch-all, 50/50): $7,946,429 × 50/50 → LP $3,973,214, GP $3,973,214
    // LP total: $9M + $4.5M + $4.5M + $3,973,214 = $21,973,214
    // GP total: $1M + $1,125K + $1,928,571 + $3,973,214 = $8,026,786
    const { result } = distribute(30_000_000, makeEmTiers(), makeEmState(), {
      allowPromote: true,
      date: '2029-01',
    })

    const lpTotal = result.lpRoC + result.lpPromote
    const gpTotal = result.gpRoC + result.gpPromote
    expect(lpTotal).toBeCloseTo(21_973_214, -1)  // within $10
    expect(gpTotal).toBeCloseTo(8_026_786, -1)
    expect(lpTotal + gpTotal).toBeCloseTo(30_000_000, 0)
  })

})

// ─── Vector H — Sources & Uses leverage metrics ────────────────────────────────

describe('Vector H — Sources & Uses: LTC uses total uses as denominator', () => {

  it('LTC = totalDebt / totalUses (not purchasePrice); LTV = seniorDebt / purchasePrice', () => {
    // purchasePrice = $19M, closingCosts = $1M → totalUses = $20M
    // seniorDebt = $13M → LTC = 13/20 = 65%; LTV = 13/19 = 68.42%
    // equity (residual) = $20M - $13M = $7M
    const stack: CapitalStack = {
      purchasePrice:    19_000_000,
      closingCosts:      1_000_000,
      operatingReserves: 0,
      capexReserves:     0,
      otherUses:         0,
      instruments: [
        {
          id:         'senior-1',
          position:   'senior',
          loanType:   'io',
          loanAmount: 13_000_000,
          startDate:  '2026-06',
          termYears:  5,
          fixedRate:  0.065,
        },
      ],
    }

    const { uses, sources, ltv, ltc } = computeSourcesAndUses(stack)

    expect(uses.total).toBeCloseTo(20_000_000, 0)
    expect(sources.totalDebt).toBeCloseTo(13_000_000, 0)
    expect(sources.equity).toBeCloseTo(7_000_000, 0)

    // LTC = debt / total uses (NOT purchase price)
    expect(ltc).toBeCloseTo(0.65, 4)        // 65.0%

    // LTV = senior debt / purchase price
    expect(ltv).toBeCloseTo(13 / 19, 4)     // 68.42%
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
    expect(cfg.clawback).toBe(true) // spec default: on (dormant unless promoteOnRefi=true)
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

// ─── computeProjection — Step 3 combined distribution ─────────────────────────

describe('computeProjection() — Step 3: NCF + sale proceeds in one distribute call', () => {

  it('sale year: total distributed equals operating NCF + net proceeds (no debt)', () => {
    const deal: ProfitSplitConfig = {
      pref: { type: 'simple', rate: 0.08 },
      waterfall: { mode: 'simple', simpleLpSplit: 70 },
    }
    const assumptions: ExitScenarioAssumptions = {
      holdYears:       3,
      beginNoi:        600_000,
      noiGrowthPct:    0,
      reservesPerYear: 0,
      eventType:       'SALE',
      eventYear:       3,
      sale: {
        valuationMethod: 'direct',
        directValue:     6_000_000,    // $6M sale price
        closingCostsPct: 0,            // no closing costs for clean math
      },
    }
    const lpEquity = 900_000
    const gpEquity = 100_000

    const result = computeProjection(deal, assumptions, [], lpEquity, gpEquity, '2024-01')

    expect(result.years).toHaveLength(3)
    expect(result.years[2].event?.type).toBe('SALE')

    const exitYear    = result.years[2]
    const dist        = exitYear.event?.proposedDistribution
    expect(dist).toBeDefined()

    // With no debt, sale netProceeds = $6M (directValue, no selling costs, no loan payoff)
    // Combined = $600K NCF + $6M = $6.6M total in year 3
    const totalDist = (dist!.lpPref + dist!.lpRoC + dist!.lpPromote +
                       dist!.gpRoC  + dist!.gpCatchup + dist!.gpPromote + dist!.retained)
    expect(totalDist).toBeCloseTo(6_600_000, -1)
  })

  it('sale year: retained ≈ 0 when all capital is returned (total in = total out)', () => {
    const deal: ProfitSplitConfig = {
      pref: { type: 'simple', rate: 0.05 },
      waterfall: { mode: 'simple', simpleLpSplit: 80 },
    }
    const assumptions: ExitScenarioAssumptions = {
      holdYears:       5,
      beginNoi:        500_000,
      noiGrowthPct:    0,
      reservesPerYear: 0,
      eventType:       'SALE',
      eventYear:       5,
      sale: {
        valuationMethod: 'direct',
        directValue:     4_000_000,
        closingCostsPct: 0,
      },
    }

    const result = computeProjection(deal, assumptions, [], 900_000, 100_000, '2024-01')

    const exitDist = result.years[4].event?.proposedDistribution
    expect(exitDist).toBeDefined()
    expect(exitDist!.retained).toBeCloseTo(0, -1)
  })

  it('saleAfterRefi: sale in year 5 uses new loan balance from year-3 refi', () => {
    const deal: ProfitSplitConfig = {
      pref: { type: 'simple', rate: 0.08 },
      waterfall: { mode: 'simple', simpleLpSplit: 70 },
    }
    const assumptions: ExitScenarioAssumptions = {
      holdYears:       5,
      beginNoi:        1_000_000,
      noiGrowthPct:    0,
      reservesPerYear: 0,
      eventType:       'REFI',
      eventYear:       3,
      refi: {
        sizingMethod:      'debt_yield',
        target:            0.10,          // DY 10% → newLoan = 1M/0.10 = $10M
        newRate:           0.06,
        newAmortYears:     30,
        newTermYears:      10,
        cashOutDistribute: false,         // no cash-out for clean test
        refiCostPct:       0.00,
        noi:               1_000_000,     // unused if target method doesn't need noi
      } as ExitScenarioAssumptions['refi'],
      saleAfterRefi: {
        saleYear: 5,
        sale: {
          valuationMethod: 'direct',
          directValue:     12_000_000,
          closingCostsPct: 0,
        },
      },
    }

    const result = computeProjection(deal, assumptions, [], 1_000_000, 111_111, '2024-01')

    // Year 3 event = REFI
    expect(result.years[2].event?.type).toBe('REFI')
    // Year 5 event = SALE (from saleAfterRefi)
    expect(result.years[4].event?.type).toBe('SALE')
    // Sale balloon should come from the refi loan (< original $10M if it amortized 2 years)
    const saleBalloon = result.years[4].event!.loanPayoffs.reduce((s, lp) => s + lp.balance, 0)
    expect(saleBalloon).toBeGreaterThan(0)
    expect(saleBalloon).toBeLessThan(10_000_000) // amortized down from $10M over 2 years
  })

})
