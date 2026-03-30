import type { ImportFieldRule, MatchResult } from '../../types/importTypes'

const normalize = (value: string) => value.toLowerCase()

export function scoreConfidence(
  rule: ImportFieldRule,
  match: MatchResult,
  allMatches: MatchResult[],
): number {
  let score = match.baseScore

  if (rule.sheetHints?.length) {
    const matched = rule.sheetHints.some((hint) => normalize(match.record.sheetName).includes(normalize(hint)))
    if (matched) score += 0.05
  }

  if (rule.sectionHints?.length) {
    const rowText = match.record.rowText.join(' ').toLowerCase()
    const colText = match.record.colText.join(' ').toLowerCase()
    const matched = rule.sectionHints.some(
      (hint) => rowText.includes(normalize(hint)) || colText.includes(normalize(hint)),
    )
    if (matched) score += 0.03
  }

  const duplicates = allMatches.filter((candidate) => candidate.record.address === match.record.address).length
  if (duplicates > 1) score -= 0.05

  return Math.max(0, Math.min(0.99, score))
}