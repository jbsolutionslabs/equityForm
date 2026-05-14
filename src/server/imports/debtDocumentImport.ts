import mammoth from 'mammoth'
import * as pdfjsLib from 'pdfjs-dist'
import type { DebtInstrument, LoanPosition } from '../../state/economicsTypes'

const ALLOWED_CATEGORY_KEYS = [
  'senior_mortgage',
  'mezzanine',
  'preferred_equity',
] as const

type AllowedCategoryKey = typeof ALLOWED_CATEGORY_KEYS[number]

const WORD_NUMBERS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
}

export interface ImportedDebtInstrumentCandidate {
  title: string
  confidence: number
  sourceExcerpt: string
  instrument: Omit<DebtInstrument, 'id'>
}

function parseCurrency(raw?: string | null): number | null {
  if (!raw) return null
  const compact = raw.trim().replace(/[$,\s]/g, '')
  const match = compact.match(/^(-?\d+(?:\.\d+)?)([mMbB])?$/)
  if (!match) return null
  const amount = Number(match[1])
  if (!Number.isFinite(amount)) return null
  const suffix = match[2]?.toLowerCase()
  if (suffix === 'm') return amount * 1_000_000
  if (suffix === 'b') return amount * 1_000_000_000
  return amount
}

function parsePercent(raw?: string | null): number | undefined {
  if (!raw) return undefined
  const n = Number(raw.replace(/[%,\s]/g, ''))
  if (!Number.isFinite(n)) return undefined
  return n / 100
}

function parseTermYears(sectionText: string): number | undefined {
  const numeric = sectionText.match(/term[^\n\r]{0,120}?(\d{1,2})\s*\(?\d*\)?\s*years?/i)
  if (numeric) return Number(numeric[1])
  const wordy = sectionText.match(/term[^\n\r]{0,120}?(one|two|three|four|five|six|seven|eight|nine|ten)\s*\(?\d*\)?\s*years?/i)
  if (wordy) return WORD_NUMBERS[wordy[1].toLowerCase()]
  return undefined
}

function detectStartDate(): string {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  return `${yyyy}-${mm}`
}

function buildBaseInstrument(position: LoanPosition): Omit<DebtInstrument, 'id'> {
  return {
    position,
    loanType: position === 'pref_equity' ? 'fixed' : 'fixed',
    lender: '',
    loanAmount: 0,
    loanAmountMode: 'manual',
    loanAmountLtcPct: 0,
    startDate: detectStartDate(),
    termYears: 5,
    amortizationYears: position === 'pref_equity' ? undefined : 30,
    fixedRate: 0,
    chathamEnabled: true,
    isRecourse: false,
  }
}

function toCategoryPosition(category: AllowedCategoryKey): LoanPosition {
  if (category === 'senior_mortgage') return 'senior'
  if (category === 'mezzanine') return 'subordinate'
  return 'pref_equity'
}

function detectAllowedCategory(labelOrText: string): AllowedCategoryKey | null {
  const t = labelOrText.toLowerCase()
  if (/senior\s+(mortgage\s+)?loan|senior\s+mortgage|1st\s+lien/.test(t)) return 'senior_mortgage'
  if (/mezzanine\s+loan|\bmezz\b/.test(t)) return 'mezzanine'
  if (/preferred\s+equity|\bpref\s+equity\b/.test(t)) return 'preferred_equity'
  return null
}

function extractCapitalStackOverviewBlock(text: string): string {
  const startMatch = text.match(/capital\s+stack\s+overview/i)
  if (startMatch?.index == null) {
    return text
  }
  const start = startMatch.index
  const remainder = text.slice(start)
  const endMatch = remainder.match(/indicative\s+senior\s+loan\s+terms|part\s+i-[a-c]|part\s+ii-[a-c]/i)
  const end = endMatch?.index != null ? start + endMatch.index : Math.min(text.length, start + 4500)
  return text.slice(start, end)
}

function extractAmountNearLabel(text: string, labelPattern: RegExp): number | null {
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i += 1) {
    if (!labelPattern.test(lines[i])) continue
    const windowText = lines.slice(i, Math.min(lines.length, i + 3)).join(' ')
    const amountMatch = windowText.match(/\$\s*\d[\d,]*(?:\.\d+)?\s*[mMbB]?/)
    const amount = parseCurrency(amountMatch?.[0])
    if (amount != null) return amount
  }
  return null
}

function extractRateNearLabel(text: string, labelPattern: RegExp): number | undefined {
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i += 1) {
    if (!labelPattern.test(lines[i])) continue
    const windowText = lines.slice(i, Math.min(lines.length, i + 3)).join(' ')
    const pct = windowText.match(/(\d{1,2}(?:\.\d{1,4})?)\s*%/)
    if (pct?.[1]) return parsePercent(pct[1])
  }
  return undefined
}

function parseCapitalStackOverview(text: string): ImportedDebtInstrumentCandidate[] {
  const block = extractCapitalStackOverviewBlock(text)
  const categories: Array<{ key: AllowedCategoryKey; label: string; labelRegex: RegExp }> = [
    { key: 'senior_mortgage', label: 'Senior Mortgage Loan', labelRegex: /senior\s+(mortgage\s+)?loan/i },
    { key: 'mezzanine', label: 'Mezzanine Loan', labelRegex: /mezzanine\s+loan|\bmezz\b/i },
    { key: 'preferred_equity', label: 'Preferred Equity', labelRegex: /preferred\s+equity|\bpref\s+equity\b/i },
  ]

  return categories
    .map(({ key, label, labelRegex }) => {
      const position = toCategoryPosition(key)
      const instrument = buildBaseInstrument(position)
      instrument.lender = label

      const amount = extractAmountNearLabel(block, labelRegex)
      if (amount != null) instrument.loanAmount = amount

      const rate = extractRateNearLabel(block, labelRegex)
      if (position === 'pref_equity') {
        instrument.prefEquityRate = rate
        instrument.prefEquityCompounding = 'quarterly'
      } else if (rate != null) {
        instrument.fixedRate = rate
      }

      if (!instrument.loanAmount) return null

      return {
        title: `Capital Stack Overview — ${label}`,
        confidence: 0.97,
        sourceExcerpt: block.slice(0, 300).replace(/\s+/g, ' ').trim(),
        instrument,
      }
    })
    .filter((x): x is ImportedDebtInstrumentCandidate => !!x)
}

function parseSection(sectionName: string, sectionText: string): ImportedDebtInstrumentCandidate | null {
  const lowerName = sectionName.toLowerCase()
  const position: LoanPosition =
    lowerName.includes('mezz') ? 'subordinate' :
    lowerName.includes('preferred') ? 'pref_equity' :
    'senior'

  const instrument = buildBaseInstrument(position)
  const confidenceSignals: number[] = []

  const lenderMatch = sectionText.match(/^\s*([A-Z][A-Za-z0-9&.,\-\s]{2,80}?)(?:\("|\(“|\()?/m)
  if (lenderMatch?.[1]) {
    instrument.lender = lenderMatch[1].trim()
    confidenceSignals.push(0.1)
  }

  const amountMatch = sectionText.match(/(?:Loan Amount|Investment Amount|Senior Loan|Mezzanine Loan|Preferred Equity)[^\n\r$]{0,60}(\$\s*\d[\d,]*(?:\.\d+)?\s*[mMbB]?)/i)
    ?? sectionText.match(/(\$\s*\d[\d,]*(?:\.\d+)?\s*[mMbB]?)/)
  const amount = parseCurrency(amountMatch?.[1])
  if (amount != null) {
    instrument.loanAmount = amount
    confidenceSignals.push(0.35)
  }

  const termYears = parseTermYears(sectionText)
  if (termYears) {
    instrument.termYears = termYears
    confidenceSignals.push(0.15)
  }

  const fixedRateMatch = sectionText.match(/(?:Interest Rate|Preferred Return)[^\n\r]{0,80}?(\d{1,2}(?:\.\d{1,4})?)\s*%/i)
  const spreadBpsMatch = sectionText.match(/\+\s*(\d{2,4})\s*bps/i)
  const spreadPctMatch = sectionText.match(/Spread[^\n\r]{0,40}?(\d{1,2}(?:\.\d{1,4})?)\s*%/i)

  const hasSofr = /\bsofr\b/i.test(sectionText)
  const interestOnly = /interest-only|interest only/i.test(sectionText)
  const prefReturn = /preferred return/i.test(sectionText)

  if (position === 'pref_equity') {
    instrument.position = 'pref_equity'
    if (fixedRateMatch?.[1]) {
      instrument.prefEquityRate = parsePercent(fixedRateMatch[1])
      confidenceSignals.push(0.2)
    }
    instrument.prefEquityCompounding = /compounded monthly/i.test(sectionText) ? 'monthly' : 'quarterly'
  } else if (hasSofr || spreadBpsMatch || spreadPctMatch) {
    instrument.loanType = interestOnly ? 'io' : 'floating'
    instrument.index = 'SOFR'
    if (spreadBpsMatch?.[1]) {
      instrument.spread = Number(spreadBpsMatch[1]) / 10_000
      confidenceSignals.push(0.2)
    } else if (spreadPctMatch?.[1]) {
      instrument.spread = parsePercent(spreadPctMatch[1])
      confidenceSignals.push(0.15)
    }
  } else {
    instrument.loanType = interestOnly ? 'io' : 'fixed'
    if (fixedRateMatch?.[1]) {
      instrument.fixedRate = parsePercent(fixedRateMatch[1])
      confidenceSignals.push(0.2)
    }
  }

  if (prefReturn) confidenceSignals.push(0.05)
  if (interestOnly) confidenceSignals.push(0.05)

  const confidence = Math.min(0.98, 0.3 + confidenceSignals.reduce((sum, v) => sum + v, 0))
  if (!instrument.loanAmount) return null

  return {
    title: sectionName,
    confidence,
    sourceExcerpt: sectionText.slice(0, 360).replace(/\s+/g, ' ').trim(),
    instrument,
  }
}

function extractCandidateSections(text: string): Array<{ title: string; body: string }> {
  const headingRegex = /(PART\s+I-[A-C]:[^\n\r]+|Senior Mortgage Loan Term Sheet|Mezzanine Loan Term Sheet|Preferred Equity Term Sheet)/gi
  const matches = Array.from(text.matchAll(headingRegex))
  if (!matches.length) return [{ title: 'Detected Debt Terms', body: text }]

  const sections: Array<{ title: string; body: string }> = []
  for (let i = 0; i < matches.length; i += 1) {
    const start = matches[i].index ?? 0
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? text.length) : text.length
    const title = matches[i][0]
    const body = text.slice(start, end)
    sections.push({ title, body })
  }
  return sections
}

async function extractTextFromPdf(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const pdf = await pdfjsLib.getDocument({ data: bytes, disableWorker: true }).promise
  const pages: string[] = []
  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    pages.push(content.items.map((item: any) => item.str ?? '').join(' '))
  }
  return pages.join('\n\n')
}

async function extractTextFromDocx(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer })
  return result.value
}

export async function extractTextFromDebtDocument(file: File): Promise<string> {
  const lower = file.name.toLowerCase()
  if (lower.endsWith('.pdf')) return extractTextFromPdf(file)
  if (lower.endsWith('.docx')) return extractTextFromDocx(file)
  throw new Error('Unsupported file type. Please upload a PDF or DOCX document.')
}

export function importDebtInstrumentsFromText(text: string): ImportedDebtInstrumentCandidate[] {
  const overviewCandidates = parseCapitalStackOverview(text)
  if (overviewCandidates.length) {
    return overviewCandidates
  }

  const sections = extractCandidateSections(text)
  const parsed = sections
    .map((section) => parseSection(section.title, section.body))
    .filter((entry): entry is ImportedDebtInstrumentCandidate => !!entry)
    .filter((entry) => detectAllowedCategory(`${entry.title} ${entry.sourceExcerpt}`) !== null)

  const dedupedByCategory = new Map<AllowedCategoryKey, ImportedDebtInstrumentCandidate>()
  parsed
    .sort((a, b) => b.confidence - a.confidence)
    .forEach((candidate) => {
      const category = detectAllowedCategory(`${candidate.title} ${candidate.sourceExcerpt}`)
      if (!category) return
      if (!dedupedByCategory.has(category)) dedupedByCategory.set(category, candidate)
    })

  return Array.from(dedupedByCategory.values())
}
