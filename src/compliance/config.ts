import type { ComplianceEntityType } from './types'

export const DE_TIMEZONE = 'America/New_York'

export type ComplianceRule = {
  deadlineMonth: number
  deadlineDay: number
  amountLabel: string
  latePenalty: string
  paymentLink: string
  instructionLink: string
  entityTypeLabel: string
}

export const DE_ENTITY_SEARCH_URL = 'https://icis.corp.delaware.gov/eCorp/EntitySearch/NameSearch.aspx'

export const COMPLIANCE_RULES: Record<ComplianceEntityType, ComplianceRule> = {
  llc: {
    deadlineMonth: 6,
    deadlineDay: 1,
    amountLabel: '$300',
    latePenalty: '$200 + 1.5%/mo interest',
    paymentLink: 'https://corp.delaware.gov/paytaxes/',
    instructionLink: 'https://corp.delaware.gov/alt-entitytaxinstructions/',
    entityTypeLabel: 'LLC / LP / GP',
  },
  corp: {
    deadlineMonth: 3,
    deadlineDay: 1,
    amountLabel: '$175 minimum + $50 report fee',
    latePenalty: '$200 + 1.5%/mo interest',
    paymentLink: 'https://corp.delaware.gov/paycorptaxes/',
    instructionLink: 'https://corp.delaware.gov/paycorptaxes/',
    entityTypeLabel: 'Domestic Corp',
  },
  foreign_corp: {
    deadlineMonth: 6,
    deadlineDay: 30,
    amountLabel: '$125',
    latePenalty: '$125 penalty',
    paymentLink: 'https://corp.delaware.gov/paycorptaxes/',
    instructionLink: 'https://corp.delaware.gov/paycorptaxes/',
    entityTypeLabel: 'Foreign Corp',
  },
}

export const REMINDER_DAYS = [30, 7, 0] as const
