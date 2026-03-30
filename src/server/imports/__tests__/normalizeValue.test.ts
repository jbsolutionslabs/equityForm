import { describe, expect, it } from 'vitest'
import { normalizeValue } from '../normalization/normalizeValue'

describe('normalizeValue', () => {
  it('converts parentheses to absolute numbers for required fields', () => {
    const value = normalizeValue('(5,000)', { fieldKey: 'vacancyLoss', importMode: 'LATEST_MONTH' })
    expect(value).toBe(5000)
  })
})