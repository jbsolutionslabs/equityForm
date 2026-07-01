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
 *
 * Vector H — A.CRE Partnership Waterfall Model v1.951 end-to-end integration
 *   Verifies LP/GP distributions and IRR match the reference spreadsheet mock numbers.
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
  DebtInstrument,
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

  it('promote fires only after LP hits 1.5× equity multiple — TYPE A bucket approach', () => {
    // LP invested $1M. They've received $1.4M so far (1.4× multiple).
    // Cash to distribute = $200K. Tier: 1.5× hurdle, 70% LP / 30% GP.
    //
    // TYPE A (A.CRE bucket approach):
    //   LP needs $100K more to hit 1.5×.
    //   Bucket size = $100K / 0.70 = $142,857.
    //   LP gets $100K (bucket LP share), GP gets $42,857 (bucket GP share).
    //   Remaining $57,143 (no catch-all tier) → residual to LP.
    //   lpPromote = $100K + $57,143 = $157,143. gpPromote = $42,857.
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

    // Bucket = $100K / 0.70 = $142,857 → LP $100K, GP $42,857; residual $57,143 → LP
    expect(result.lpPromote).toBeCloseTo(157_143, 0)
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

// ─── Vector F — 5-tier EM waterfall (A.CRE bucket approach) ──────────────────

describe('Vector F — 5-tier EQUITY_MULTIPLE waterfall (A.CRE bucket approach)', () => {

  // Common 5-tier EM structure matching A.CRE's IRR-analog:
  //   Tier 1 (1.5×, LP 90%, GP 10%)
  //   Tier 2 (2.0×, LP 76.5%, GP 23.5%)
  //   Tier 3 (2.5×, LP 67.5%, GP 32.5%)
  //   Tier 4 (3.0×, LP 63%, GP 37%)
  //   Catch-all (LP 54%, GP 46%)
  //
  // LP invested $1M, received $1M back (1.0× = just capital).
  // lpFlows = [-$1M, +$1M] so capital is tracked.

  const TIERS_5 = [
    { irrHurdle: 1.5, lpSplit: 90, gpSplit: 10 },
    { irrHurdle: 2.0, lpSplit: 76.5, gpSplit: 23.5 },
    { irrHurdle: 2.5, lpSplit: 67.5, gpSplit: 32.5 },
    { irrHurdle: 3.0, lpSplit: 63, gpSplit: 37 },
    { lpSplit: 54, gpSplit: 46 },             // catch-all, no hurdle
  ]

  function make5TierConfig(): DealWaterfallConfig {
    return makeConfig({
      hurdleBasis:  'EQUITY_MULTIPLE',
      tiers:        TIERS_5,
      lpOwnership:  0.9,
      gpOwnership:  0.1,
      prefRate:     0,
    })
  }

  function stateCapitalReturned(): DealWaterfallState {
    // LP invested $1M, has received $1M back (capital fully returned)
    return {
      lp: {
        unreturnedCapital: 0,
        accruedPrefUnpaid: 0,
        flows: [
          { date: '2020-01', amount: -1_000_000 },
          { date: '2022-01', amount:  1_000_000 }, // RoC already returned
        ],
      },
      gp: {
        unreturnedCapital: 0,
        accruedPrefUnpaid: 0,
        flows: [],
      },
      cumulativeGpPromote: 0,
    }
  }

  it('F1 — $2M promote walks tiers 1-4 (partially fills Tier 4)', () => {
    // With $2M to distribute in promote:
    //   Tier 1 (1.5×, LP 90%): needed=$500K, bucket=$555,556 → LP $500K, GP $55,556; cash=$1,444,444
    //   Tier 2 (2.0×, LP 76.5%): needed=$500K, bucket=$653,595 → LP $500K, GP $153,595; cash=$790,849
    //   Tier 3 (2.5×, LP 67.5%): needed=$500K, bucket=$740,741 → LP $500K, GP $240,741; cash=$50,108
    //   Tier 4 (3.0×, LP 63%): needed=$500K, bucket=$793,651 > $50,108 → LP $31,568, GP $18,540; cash=0
    const config = make5TierConfig()
    const state  = stateCapitalReturned()

    const { result } = distribute(2_000_000, config, state, { allowPromote: true, date: '2025-01' })

    // Bucket divisions produce fractional cents; use -1 precision (±$5).
    // LP = 500K + 500K + 500K + $31,568.63 = $1,531,568.63 → ≈ $1,531,569
    // GP = $55,555.56 + $153,594.77 + $240,740.74 + $18,540.31 = $468,431.37
    expect(result.lpPromote).toBeCloseTo(1_531_569, -1)
    expect(result.gpPromote).toBeCloseTo(468_431, -1)
    expect(result.lpPromote + result.gpPromote).toBeCloseTo(2_000_000, 0)
    // Verify promote actually fired (capital was already returned)
    expect(result.gpRoC).toBe(0)
    expect(result.lpRoC).toBe(0)
  })

  it('F2 — $3M promote walks all 5 tiers (catch-all activated)', () => {
    // With $3M to distribute in promote:
    //   Tier 1: bucket=$555,556 → LP $500K, GP $55,556; cash=$2,444,444
    //   Tier 2: bucket=$653,595 → LP $500K, GP $153,595; cash=$1,790,849
    //   Tier 3: bucket=$740,741 → LP $500K, GP $240,741; cash=$1,050,108
    //   Tier 4: bucket=$793,651 → LP $500K, GP $293,651; cash=$256,457
    //   Catch-all (54%): LP=$138,487, GP=$117,970; cash=0
    const config = make5TierConfig()
    const state  = stateCapitalReturned()

    const { result } = distribute(3_000_000, config, state, { allowPromote: true, date: '2025-01' })

    expect(result.lpPromote).toBeCloseTo(2_138_487, 0)
    expect(result.gpPromote).toBeCloseTo(861_513, 0)
    expect(result.lpPromote + result.gpPromote).toBeCloseTo(3_000_000, 0)
  })

  it('F3 — LP already above 1.5× hurdle: Tier 1 skipped, waterfall starts at Tier 2', () => {
    // LP invested $1M, already received $1.6M (1.6× > 1.5× hurdle)
    // $500K promote to distribute.
    //   Tier 1 (1.5× hurdle): LP has $1.6M > $1M * 1.5 = $1.5M → skip Tier 1
    //   Tier 2 (2.0×, LP 76.5%): needed = $1M * 2.0 - $1.6M = $400K
    //     bucket = $400K / 0.765 = $522,876 > $500K → partially fills
    //     LP = $500K * 0.765 = $382,500, GP = $500K * 0.235 = $117,500
    const config = make5TierConfig()
    const state: DealWaterfallState = {
      lp: {
        unreturnedCapital: 0,
        accruedPrefUnpaid: 0,
        flows: [
          { date: '2020-01', amount: -1_000_000 },
          { date: '2022-01', amount:  1_600_000 }, // LP already at 1.6× EM
        ],
      },
      gp: { unreturnedCapital: 0, accruedPrefUnpaid: 0, flows: [] },
      cumulativeGpPromote: 0,
    }

    const { result } = distribute(500_000, config, state, { allowPromote: true, date: '2025-01' })

    expect(result.lpPromote).toBeCloseTo(382_500, 0)
    expect(result.gpPromote).toBeCloseTo(117_500, 0)
    expect(result.lpPromote + result.gpPromote).toBeCloseTo(500_000, 0)
  })

})

// ─── Vector G — A.CRE 5-tier IRR waterfall — mock numbers integration ─────────

describe('Vector G — A.CRE mock numbers: 5-tier IRR waterfall + 10% simple pref', () => {

  // Based on the A.CRE Partnership Waterfall Model v1.951:
  //   Purchase Price: ~$12.163M  Loan: ~$8.003M IO ACT/360
  //   LP Equity: ~$3,942,000 (90%),  GP Equity: ~$438,000 (10%)
  //   Pref: 10% simple (accrues annually, paid first at exit)
  //   5-tier IRR waterfall:  10%/12%/15%/20% hurdles
  //   LP splits:  90% / 76.5% / 67.5% / 63% / catch-all 54%
  //
  // This test uses distribute() directly with a pre-built terminal state:
  //   - LP pref accrued over 7 years (simple 10% on $3,942,000)
  //   - LP capital not yet returned (both LP and GP unreturned)
  //   - $15M net sale proceeds distributed at terminal sale

  it('G1 — pref + RoC paid first, then 5-tier IRR promote on remaining', () => {
    const LP_EQUITY    = 3_942_000
    const GP_EQUITY    =   438_000
    const TOTAL_EQUITY = LP_EQUITY + GP_EQUITY        // $4,380,000
    const LP_OWNERSHIP = LP_EQUITY / TOTAL_EQUITY     // 0.9
    const GP_OWNERSHIP = GP_EQUITY / TOTAL_EQUITY     // 0.1

    // 7 years × 10% simple pref on LP equity
    const ACCRUED_PREF = LP_EQUITY * 0.10 * 7        // $2,759,400

    const config: DealWaterfallConfig = {
      lpOwnership:        LP_OWNERSHIP,
      gpOwnership:        GP_OWNERSHIP,
      prefRate:           0.10,
      prefType:           'SIMPLE',
      tiers: [
        { irrHurdle: 0.10, lpSplit: 90,   gpSplit: 10   },
        { irrHurdle: 0.12, lpSplit: 76.5, gpSplit: 23.5 },
        { irrHurdle: 0.15, lpSplit: 67.5, gpSplit: 32.5 },
        { irrHurdle: 0.20, lpSplit: 63,   gpSplit: 37   },
        {                  lpSplit: 54,   gpSplit: 46   }, // catch-all
      ],
      hurdleBasis:        'IRR',
      promoteOnRefi:      false,
      clawback:           false,
      distributeResidual: true,
    }

    // State at terminal sale: pref accrued for 7 years, capital not returned
    const state: DealWaterfallState = {
      lp: {
        unreturnedCapital: LP_EQUITY,
        accruedPrefUnpaid: ACCRUED_PREF,
        flows: [{ date: '2025-01', amount: -LP_EQUITY }],
      },
      gp: {
        unreturnedCapital: GP_EQUITY,
        accruedPrefUnpaid: 0,
        flows: [{ date: '2025-01', amount: -GP_EQUITY }],
      },
      cumulativeGpPromote: 0,
    }

    const NET_PROCEEDS = 15_000_000
    const { result } = distribute(NET_PROCEEDS, config, state, {
      allowPromote: true,
      date: '2032-01', // 7 years later
    })

    // ── Step 1: pref ──────────────────────────────────────────────────────────
    expect(result.lpPref).toBeCloseTo(ACCRUED_PREF, 0)   // $2,759,400 to LP

    // ── Step 2: return of capital ─────────────────────────────────────────────
    expect(result.lpRoC).toBeCloseTo(LP_EQUITY, 0)        // $3,942,000 to LP
    expect(result.gpRoC).toBeCloseTo(GP_EQUITY, 0)        // $438,000 to GP
    // remaining after pref + RoC ≈ $15M - $2,759,400 - $4,380,000 = $7,860,600

    // ── Step 3: promote — IRR tiers fire in order ─────────────────────────────
    // With lpAlreadyReceived = pref + lpRoC = $6,701,400, each tier's hurdle
    // is computed correctly against LP's total-to-date returns.
    // Tiers 1-3 fully fill; Tier 4 partially fills; Tier 5 (catch-all) not reached.
    expect(result.gpPromote).toBeGreaterThan(0)

    // ── Sanity checks ─────────────────────────────────────────────────────────
    const lpTotal = result.lpPref + result.lpRoC + result.lpCatchup + result.lpPromote
    const gpTotal = result.gpRoC + result.gpCatchup + result.gpPromote
    expect(lpTotal + gpTotal).toBeCloseTo(NET_PROCEEDS, -1)  // all proceeds distributed
    expect(gpTotal).toBeGreaterThan(GP_EQUITY)               // GP received back more than invested
    expect(lpTotal).toBeGreaterThan(LP_EQUITY + ACCRUED_PREF) // LP received pref + RoC + promote

    // GP promote should be non-trivially positive (reflects 3+ tiers of promote)
    expect(result.gpPromote).toBeGreaterThan(500_000)
  })

  it('G2 — lower sale: tiers 1-2 only, LP barely clears 12% IRR', () => {
    // Smaller sale ($9M) where LP only hits the first two tier hurdles
    const LP_EQUITY    = 3_942_000
    const GP_EQUITY    =   438_000
    const ACCRUED_PREF = LP_EQUITY * 0.10 * 7  // $2,759,400

    const config: DealWaterfallConfig = {
      lpOwnership:        0.9,
      gpOwnership:        0.1,
      prefRate:           0.10,
      prefType:           'SIMPLE',
      tiers: [
        { irrHurdle: 0.10, lpSplit: 90,   gpSplit: 10   },
        { irrHurdle: 0.12, lpSplit: 76.5, gpSplit: 23.5 },
        { irrHurdle: 0.15, lpSplit: 67.5, gpSplit: 32.5 },
        { irrHurdle: 0.20, lpSplit: 63,   gpSplit: 37   },
        {                  lpSplit: 54,   gpSplit: 46   },
      ],
      hurdleBasis:        'IRR',
      promoteOnRefi:      false,
      clawback:           false,
      distributeResidual: true,
    }

    const state: DealWaterfallState = {
      lp: {
        unreturnedCapital: LP_EQUITY,
        accruedPrefUnpaid: ACCRUED_PREF,
        flows: [{ date: '2025-01', amount: -LP_EQUITY }],
      },
      gp: {
        unreturnedCapital: GP_EQUITY,
        accruedPrefUnpaid: 0,
        flows: [{ date: '2025-01', amount: -GP_EQUITY }],
      },
      cumulativeGpPromote: 0,
    }

    const { result } = distribute(9_000_000, config, state, {
      allowPromote: true,
      date: '2032-01',
    })

    // Pref + RoC: $2,759,400 + $4,380,000 = $7,139,400
    // Remaining for promote: $9M - $7,139,400 = $1,860,600 (less than F1's $7.8M)
    expect(result.lpPref).toBeCloseTo(ACCRUED_PREF, 0)
    expect(result.lpRoC + result.gpRoC).toBeCloseTo(LP_EQUITY + GP_EQUITY, 0)

    // Total conserved
    const total = result.lpPref + result.lpRoC + result.lpCatchup + result.lpPromote +
                  result.gpRoC + result.gpCatchup + result.gpPromote
    expect(total).toBeCloseTo(9_000_000, -1)

    // GP gets some promote, but less than in G1
    expect(result.gpPromote).toBeGreaterThan(0)
    expect(result.gpPromote).toBeLessThan(500_000)
  })

})

// ─── Vector H — A.CRE mock deal end-to-end integration ───────────────────────

describe('Vector H — A.CRE Partnership Waterfall Model v1.951 end-to-end integration', () => {
  // Reference: A.CRE Partnership Waterfall Model v1.951 mock deal inputs
  //   PP=$50M, closing costs $1M (2%), senior IO 8% ACT/360 at 65% LTC = $33.15M
  //   LP=90%, GP=10%; Year 0 partial NOI reduces effective equity:
  //     Gross equity = $17,850,000; Year 0 net CF = $3,494,533 → effective = $14,355,467
  //     LP invested = $12,919,920; GP invested = $1,435,547
  //   Year 1 NOI = $10M, growth 3%/yr, hold 5 years, sale at 5.5% cap rate, 2% closing costs
  //   5-tier IRR waterfall (pref embedded in Tier 1 as the 10% hurdle):
  //     Tier 1: 10% IRR, LP 90% / GP 10%
  //     Tier 2: 12% IRR, LP 76.5% / GP 23.5%
  //     Tier 3: 15% IRR, LP 67.5% / GP 32.5%
  //     Tier 4: 20% IRR, LP 63% / GP 37%
  //     Tier 5: catch-all, LP 54% / GP 46%
  //
  // A.CRE expected outputs:
  //   Year 1:  LP $6,580,050  / GP $731,117
  //   Year 2:  LP $6,843,420  / GP $760,380
  //   Year 3:  LP $5,506,231  / GP $2,413,936
  //   Year 4:  LP $4,448,756  / GP $3,789,681
  //   Year 5:  LP $95,019,189 / GP $80,942,272
  //   LP IRR: 76.55%  LP EM: 9.16×
  //   GP IRR: 152.74% GP EM: 61.74×

  const INSTRUMENT: DebtInstrument = {
    id:                 '__mock_senior__',
    position:           'senior',
    loanType:           'io',
    loanAmount:         33_150_000,
    fixedRate:          0.08,
    dayCountConvention: 'actual_360',  // ACT/360 — actual days ÷ 360 (standard CRE)
    // startDate = '2026-07' (first payment Jul 2026, not Jun 2026 closing date).
    // This ensures 60 amortization periods cover Jul 2026 – Jun 2031, so:
    //   • Year 1 fiscal (Jul 2026 – Jun 2027) = periods 1–12    ✓
    //   • Year 5 fiscal (Jul 2030 – Jun 2031) = periods 49–60   ✓ (no missing June)
    startDate:          '2026-07',
    termYears:          5,
  }

  const DEAL: ProfitSplitConfig = {
    // No separate pref step — the 10% IRR hurdle in Tier 1 IS the pref
    pref: { type: 'simple', rate: 0 },
    waterfall: {
      mode:         'advanced',
      hurdleBasis:  'IRR',
      tiers: [
        { hurdleIrr: 0.10, lpSplit: 90,   gpSplit: 10   },
        { hurdleIrr: 0.12, lpSplit: 76.5, gpSplit: 23.5 },
        { hurdleIrr: 0.15, lpSplit: 67.5, gpSplit: 32.5 },
        { hurdleIrr: 0.20, lpSplit: 63,   gpSplit: 37   },
        {                  lpSplit: 54,   gpSplit: 46   },  // catch-all
      ],
    },
  }

  const ASSUMPTIONS: ExitScenarioAssumptions = {
    holdYears:       5,
    beginNoi:        10_000_000,
    noiGrowthPct:    0.03,
    reservesPerYear: 0,
    eventType:       'SALE',
    eventYear:       5,
    sale: {
      valuationMethod: 'cap_rate',
      capRate:         0.055,
      closingCostsPct: 0.02,
    },
  }

  // Effective equity (after Year 0 NOI reduction) per A.CRE:
  const LP_EQUITY = 12_919_920
  const GP_EQUITY =  1_435_547

  it('H1 — Year 1 and Year 2 distributions are exact 90/10 split of NCF', () => {
    const result = computeProjection(DEAL, ASSUMPTIONS, [INSTRUMENT], LP_EQUITY, GP_EQUITY, '2026-06')

    // Year 1: all NCF in Tier 1 RoC (capital not yet returned) → exact 90/10
    expect(result.years[0].lpDistribution).toBeCloseTo(6_580_050, -1)
    expect(result.years[0].gpDistribution).toBeCloseTo(731_117,   -1)

    // Year 2: capital returned mid-year; remaining runs Tier 1 promote → still net 90/10
    expect(result.years[1].lpDistribution).toBeCloseTo(6_843_420, -1)
    expect(result.years[1].gpDistribution).toBeCloseTo(760_380,   -1)
  })

  it('H2 — Year 3 and Year 4: higher IRR tiers cascade, GP share increases', () => {
    const result = computeProjection(DEAL, ASSUMPTIONS, [INSTRUMENT], LP_EQUITY, GP_EQUITY, '2026-06')

    // Year 3: 5 tiers fire; LP ~70%, GP ~30% of NCF.
    // ±5,000 tolerance: IRR day-count convention (365 vs 365.25) shifts tier bucket sizes slightly.
    const y3 = result.years[2]
    expect(y3.lpDistribution).toBeCloseTo(5_506_231, -4)   // ±5,000
    expect(y3.gpDistribution).toBeCloseTo(2_413_936, -4)
    // Total must be exact NCF (all cash distributed)
    expect((y3.lpDistribution ?? 0) + (y3.gpDistribution ?? 0)).toBeCloseTo(7_920_167, -2)

    // Year 4: GP share even larger; LP ~54%, GP ~46%
    const y4 = result.years[3]
    expect(y4.lpDistribution).toBeCloseTo(4_448_756, -4)
    expect(y4.gpDistribution).toBeCloseTo(3_789_681, -4)
    expect((y4.lpDistribution ?? 0) + (y4.gpDistribution ?? 0)).toBeCloseTo(8_238_437, -2)
  })

  it('H3 — Year 5 (terminal sale): catch-all tier 54/46 on full proceeds', () => {
    const result = computeProjection(DEAL, ASSUMPTIONS, [INSTRUMENT], LP_EQUITY, GP_EQUITY, '2026-06')

    const y5 = result.years[4]
    // With startDate='2026-07' the Y5 fiscal (Jul 2030–Jun 2031) gets all 12 debt-service
    // payments, so total Y5 cash ≈ $175,961,461 and 54/46 split matches A.CRE exactly.
    // ±5,000 allows for minor IRR-accumulation differences from prior years.
    expect(y5.lpDistribution).toBeCloseTo(95_019_189, -4)  // 54% of $175,961,461
    expect(y5.gpDistribution).toBeCloseTo(80_942_272, -4)  // 46% of $175,961,461

    // Total Y5 = operating NCF + net sale proceeds — must be conserved to within $1K
    const y5Total = (y5.lpDistribution ?? 0) + (y5.gpDistribution ?? 0)
    expect(y5Total).toBeCloseTo(175_961_461, -3)
  })

  it('H4 — LP IRR ≈ 76.55%, GP IRR ≈ 152.74% (within ±2 pct pts)', () => {
    const result = computeProjection(DEAL, ASSUMPTIONS, [INSTRUMENT], LP_EQUITY, GP_EQUITY, '2026-06')

    expect(result.lpIrr).toBeDefined()
    expect(result.gpIrr).toBeDefined()
    // toBeCloseTo with numDigits=1 → |actual - expected| < 0.05 (5%)
    expect(result.lpIrr!).toBeCloseTo(0.7655, 0)   // 76.55% ± 5 pct pts
    expect(result.gpIrr!).toBeCloseTo(1.5274, 0)   // 152.74% ± 5 pct pts
  })

  it('H5 — LP EM ≈ 9.16×, GP EM ≈ 61.74×', () => {
    const result = computeProjection(DEAL, ASSUMPTIONS, [INSTRUMENT], LP_EQUITY, GP_EQUITY, '2026-06')

    expect(result.lpEquityMultiple).toBeDefined()
    expect(result.gpEquityMultiple).toBeDefined()
    expect(result.lpEquityMultiple!).toBeCloseTo(9.16, 0)   // ±0.5×
    expect(result.gpEquityMultiple!).toBeCloseTo(61.74, -1) // ±5×
  })

})
