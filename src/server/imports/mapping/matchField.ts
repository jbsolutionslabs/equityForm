import type { CellRecord, ImportFieldRule, MatchResult } from '../../types/importTypes'

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')

const isNumericValue = (value: unknown) => {
  if (typeof value === 'number') return true
  if (typeof value !== 'string') return false
  const cleaned = value.trim().replace(/[$,\s]/g, '')
  return /^\(?-?\d+(\.\d+)?\)?%?$/.test(cleaned)
}

const tokenOverlap = (a: string, b: string) => {
  const tokensA = new Set(a.split(/\s+/).filter(Boolean))
  const tokensB = new Set(b.split(/\s+/).filter(Boolean))
  const intersection = [...tokensA].filter((token) => tokensB.has(token))
  return tokensA.size === 0 ? 0 : intersection.length / tokensA.size
}

const findMatchScore = (label: string, alias: string) => {
  const cleanLabel = normalize(label)
  const cleanAlias = normalize(alias)

  if (!cleanLabel || !cleanAlias) return null
  if (cleanLabel === cleanAlias) return { type: 'exact' as const, score: 0.95 }
  if (cleanLabel.includes(cleanAlias) || cleanAlias.includes(cleanLabel)) {
    return { type: 'alias' as const, score: 0.85 }
  }
  if (tokenOverlap(label.toLowerCase(), alias.toLowerCase()) >= 0.5) {
    return { type: 'fuzzy' as const, score: 0.7 }
  }
  return null
}

export function matchField(rule: ImportFieldRule, records: CellRecord[]): MatchResult[] {
  const matches: MatchResult[] = []

  records.forEach((record) => {
    if (!isNumericValue(record.value)) return
    const rowLabels = record.rowText.length ? record.rowText : record.colText
    rowLabels.forEach((label) => {
      rule.aliases.forEach((alias) => {
        const match = findMatchScore(label, alias)
        if (!match) return
        matches.push({
          record,
          matchedLabel: label,
          matchType: match.type,
          baseScore: match.score,
        })
      })
    })
  })

  return matches
}