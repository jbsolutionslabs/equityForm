import { AppData, Investor } from '../state/store'
import type { EconomicsDeal } from '../state/economicsTypes'

// Placeholder status types for developer tooling
export type PlaceholderStatus =
  | { type: 'input'; path: string }
  | { type: 'derived'; formula: string }
  | { type: 'repeated'; source: string }
  | { type: 'integration'; source: string }
  | { type: 'missing' }

export type PlaceholderMap = Record<string, PlaceholderStatus>

function deriveLastName(full?: string) {
  if (!full) return ''
  const parts = full.trim().split(/\s+/)
  return parts.length > 1 ? parts[parts.length - 1] : parts[0]
}

function roundToTenth(value: unknown) {
  if (value === null || value === undefined || value === '') return value
  const cleaned = typeof value === 'string' ? value.replace(/%/g, '').trim() : value
  const num = Number(cleaned)
  if (Number.isNaN(num)) return value
  return Math.round(num * 10) / 10
}

const EXHIBIT_A_PENDING_MESSAGE = 'To be updated upon execution of subscription agreements by each Member.'

function formatCurrencyLabel(value?: number | null) {
  const num = typeof value === 'number' ? value : Number(value ?? 0)
  if (Number.isNaN(num)) return '$0'
  return `$${num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

function formatOwnershipPct(value?: number | null) {
  const num = typeof value === 'number' ? value : Number(value ?? 0)
  if (Number.isNaN(num)) return '0.00%'
  return `${num.toFixed(2)}%`
}

function getPaidInvestors(data: AppData) {
  const paidIds = new Set(
    data.subscriptions.filter((s) => s.status === 'paid').map((s) => s.investorId),
  )
  return data.investors.filter((inv) => paidIds.has(inv.id))
}

function buildExhibitAContent(data: AppData) {
  if (!data.deal.capTableLockedAt) return EXHIBIT_A_PENDING_MESSAGE

  const paidInvestors = getPaidInvestors(data)
  if (paidInvestors.length === 0) {
    return 'Cap table locked but no Members have confirmed wires yet.'
  }

  const totalUnits = paidInvestors.reduce((sum, inv) => sum + (inv.classAUnits || 0), 0)
  const totalContribution = paidInvestors.reduce((sum, inv) => sum + (inv.subscriptionAmount || 0), 0)

  const rows = [
    'Member — Class A Units — Ownership % — Subscription Amount',
    ...paidInvestors.map((inv) => {
      const units = inv.classAUnits || 0
      const pct = totalUnits > 0 ? (units / totalUnits) * 100 : 0
      return `${inv.fullLegalName} — ${units.toLocaleString()} units — ${formatOwnershipPct(pct)} — ${formatCurrencyLabel(
        inv.subscriptionAmount,
      )}`
    }),
    `TOTAL — ${totalUnits.toLocaleString()} units — 100.00% — ${formatCurrencyLabel(totalContribution)}`,
  ]

  return rows.join('\n')
}

function parseCityStateZip(address?: string) {
  if (!address) return { city: '', state: '', zip: '' }
  const parts = address.split(',').map((p) => p.trim())
  const last = parts[parts.length - 1] || ''
  const m = last.match(/^(.*)\s+([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/)
  if (m) return { city: m[1].trim(), state: m[2].trim(), zip: m[3].trim() }
  const m2 = last.match(/^([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/)
  if (m2) return { city: '', state: m2[1], zip: m2[2] }
  return { city: '', state: '', zip: '' }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function stripParsedCityStateZip(address?: string, parsed?: { city: string; state: string; zip: string }) {
  if (!address) return ''
  if (!parsed) return address.trim()
  const suffixParts = [parsed.city, parsed.state, parsed.zip].filter(Boolean)
  if (suffixParts.length === 0) return address.trim()
  const suffix = suffixParts.join(' ')
  const regex = new RegExp(`[\\s,]*${escapeRegExp(suffix)}\\s*$`)
  const stripped = address.replace(regex, '').replace(/,+\s*$/, '').trim()
  return stripped || address.trim()
}

// Build LP_n entries from investors
function buildLpRows(investors: Investor[]) {
  return investors.map((inv, idx) => ({
    lpIndex: idx + 1,
    LP_NAME: inv.fullLegalName,
    LP_ADDRESS: [inv.streetAddress, inv.city, inv.state, inv.zip].filter(Boolean).join(', '),
    LP_CONTRIBUTION: inv.subscriptionAmount || 0,
    LP_CLASS_A: inv.classAUnits || 0,
    LP_PCT: roundToTenth(inv.ownershipPct ?? 0),
  }))
}

function feeTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    acquisition:       'Acquisition Fee',
    asset_management:  'Asset Management Fee',
    disposition:       'Disposition Fee',
    construction_mgmt: 'Construction Management Fee',
    financing:         'Financing Fee',
    custom:            'Other Fee',
  }
  return labels[type] || type
}

// Main exported function: returns resolved values and a placeholder map
export function generatePlaceholders(data: AppData, economicsDeal?: EconomicsDeal) {
  const placeholders: Record<string, any> = {}
  const map: PlaceholderMap = {}

  // Deal/company placeholders
  placeholders.ENTITY_NAME = data.deal.entityName || ''
  map.ENTITY_NAME = placeholders.ENTITY_NAME ? { type: 'input', path: 'deal.entityName' } : { type: 'missing' }

  placeholders.FORMATION_STATE = data.deal.formationState || ''
  map.FORMATION_STATE = placeholders.FORMATION_STATE ? { type: 'input', path: 'deal.formationState' } : { type: 'missing' }

  placeholders.EFFECTIVE_DATE = data.deal.effectiveDate || ''
  map.EFFECTIVE_DATE = placeholders.EFFECTIVE_DATE ? { type: 'input', path: 'deal.effectiveDate' } : { type: 'missing' }

  placeholders.PRINCIPAL_ADDRESS = data.deal.principalAddress || ''
  map.PRINCIPAL_ADDRESS = placeholders.PRINCIPAL_ADDRESS ? { type: 'input', path: 'deal.principalAddress' } : { type: 'missing' }

  placeholders.GP_ENTITY_NAME = data.deal.gpEntityName || ''
  map.GP_ENTITY_NAME = placeholders.GP_ENTITY_NAME ? { type: 'input', path: 'deal.gpEntityName' } : { type: 'missing' }

  placeholders.GP_ENTITY_STATE = data.deal.gpEntityState || ''
  map.GP_ENTITY_STATE = placeholders.GP_ENTITY_STATE ? { type: 'input', path: 'deal.gpEntityState' } : { type: 'missing' }

  placeholders.REGISTERED_AGENT_NAME = data.deal.registeredAgentName || ''
  map.REGISTERED_AGENT_NAME = data.deal.registeredAgentName
    ? { type: 'input', path: 'deal.registeredAgentName' }
    : { type: 'integration', source: 'registered-agent-providers' }

  placeholders.REGISTERED_AGENT_ADDRESS = data.deal.registeredAgentAddress || ''
  map.REGISTERED_AGENT_ADDRESS = data.deal.registeredAgentAddress
    ? { type: 'input', path: 'deal.registeredAgentAddress' }
    : { type: 'integration', source: 'registered-agent-providers' }

  placeholders.DEAL_PURPOSE = data.deal.dealPurpose || ''
  map.DEAL_PURPOSE = placeholders.DEAL_PURPOSE ? { type: 'input', path: 'deal.dealPurpose' } : { type: 'missing' }

  const parsed = parseCityStateZip(data.deal.propertyAddress)
  const strippedAddress = stripParsedCityStateZip(data.deal.propertyAddress, parsed)
  placeholders.PROPERTY_ADDRESS = strippedAddress || data.deal.propertyAddress || ''
  map.PROPERTY_ADDRESS = placeholders.PROPERTY_ADDRESS ? { type: 'input', path: 'deal.propertyAddress' } : { type: 'missing' }

  placeholders.PROPERTY_CITY = data.deal.propertyCity || parsed.city || ''
  placeholders.PROPERTY_STATE = data.deal.propertyState || parsed.state || ''
  placeholders.PROPERTY_ZIP = data.deal.propertyZip || parsed.zip || ''
  map.PROPERTY_CITY = placeholders.PROPERTY_CITY ? { type: 'derived', formula: 'parseCityStateZip(propertyAddress) or deal.propertyCity' } : { type: 'missing' }
  map.PROPERTY_STATE = placeholders.PROPERTY_STATE ? { type: 'derived', formula: 'parseCityStateZip(propertyAddress) or deal.propertyState' } : { type: 'missing' }
  map.PROPERTY_ZIP = placeholders.PROPERTY_ZIP ? { type: 'derived', formula: 'parseCityStateZip(propertyAddress) or deal.propertyZip' } : { type: 'missing' }

  // Pre-combined property address for templates — avoids trailing commas when parts are empty
  const addrParts: string[] = []
  if (placeholders.PROPERTY_ADDRESS) addrParts.push(placeholders.PROPERTY_ADDRESS)
  if (placeholders.PROPERTY_CITY) addrParts.push(placeholders.PROPERTY_CITY)
  if (placeholders.PROPERTY_STATE && placeholders.PROPERTY_ZIP) {
    addrParts.push(`${placeholders.PROPERTY_STATE} ${placeholders.PROPERTY_ZIP}`)
  } else if (placeholders.PROPERTY_STATE) {
    addrParts.push(placeholders.PROPERTY_STATE)
  } else if (placeholders.PROPERTY_ZIP) {
    addrParts.push(placeholders.PROPERTY_ZIP)
  }
  placeholders.PROPERTY_FULL_ADDRESS = addrParts.join(', ')
  map.PROPERTY_FULL_ADDRESS = { type: 'derived', formula: 'PROPERTY_ADDRESS + PROPERTY_CITY + PROPERTY_STATE + PROPERTY_ZIP' }

  placeholders.PROPERTY_LEGAL_DESCRIPTION = data.deal.propertyLegalDescription || ''
  map.PROPERTY_LEGAL_DESCRIPTION = placeholders.PROPERTY_LEGAL_DESCRIPTION ? { type: 'input', path: 'deal.propertyLegalDescription' } : { type: 'missing' }

  // Offering / compliance
  placeholders.OFFERING_EXEMPTION = data.offering.offeringExemption || ''
  map.OFFERING_EXEMPTION = placeholders.OFFERING_EXEMPTION ? { type: 'input', path: 'offering.offeringExemption' } : { type: 'missing' }

  if (data.offering.offeringExemption === '506(b)') {
    placeholders.OFFERING_EXEMPTION_RULE = 'Rule 506(b) - general solicitation not permitted'
    map.OFFERING_EXEMPTION_RULE = { type: 'derived', formula: "if offeringExemption == '506(b)'" }
  } else if (data.offering.offeringExemption === '506(c)') {
    placeholders.OFFERING_EXEMPTION_RULE = 'Rule 506(c) - general solicitation allowed with verification requirements'
    map.OFFERING_EXEMPTION_RULE = { type: 'derived', formula: "if offeringExemption == '506(c)'" }
  } else {
    placeholders.OFFERING_EXEMPTION_RULE = ''
    map.OFFERING_EXEMPTION_RULE = { type: 'missing' }
  }

  placeholders.SOLICITATION_METHOD = data.offering.solicitationMethod || ''
  map.SOLICITATION_METHOD = placeholders.SOLICITATION_METHOD ? { type: 'input', path: 'offering.solicitationMethod' } : { type: 'missing' }

  placeholders.MIN_INVESTMENT = data.offering.minimumInvestment ?? null
  map.MIN_INVESTMENT = placeholders.MIN_INVESTMENT !== null ? { type: 'input', path: 'offering.minimumInvestment' } : { type: 'missing' }

  placeholders.CLOSING_DATE = data.offering.closingDate || ''
  map.CLOSING_DATE = placeholders.CLOSING_DATE ? { type: 'input', path: 'offering.closingDate' } : { type: 'missing' }

  // Legacy offering-based pref/waterfall (kept for subscription agreement compat)
  placeholders.PREFERRED_RETURN_RATE =
    data.offering.preferredReturnEnabled && data.offering.preferredReturnType !== 'IRR-based'
      ? data.offering.preferredReturnRate ?? null
      : null
  map.PREFERRED_RETURN_RATE = { type: 'derived', formula: 'legacy offering field — OA uses ECON_PREF_RATE' }

  placeholders.PREFERRED_RETURN_ENABLED = data.offering.preferredReturnEnabled ?? false
  placeholders.PREFERRED_RETURN_TYPE = data.offering.preferredReturnType || ''

  placeholders.IRR_RATE = data.offering.preferredReturnEnabled && data.offering.preferredReturnType === 'IRR-based'
    ? data.offering.irrRate ?? null
    : null

  placeholders.GP_PROMOTE = data.offering.gpPromote ?? null
  placeholders.LP_RESIDUAL = typeof data.offering.gpPromote === 'number' ? 100 - data.offering.gpPromote : null

  placeholders.ASSET_MANAGEMENT_FEE_DESCRIPTION = data.offering.assetManagementFeeDescription || ''
  placeholders.ACQUISITION_FEE_DESCRIPTION = data.offering.acquisitionFeeDescription || ''
  placeholders.DISPOSITION_FEE_DESCRIPTION = data.offering.dispositionFeeDescription || ''

  placeholders.CONSENT_THRESHOLD = data.offering.consentThreshold ?? null
  placeholders.REFINANCE_THRESHOLD = data.offering.refinanceThreshold ?? null
  placeholders.AMENDMENT_THRESHOLD = data.offering.amendmentThreshold ?? null
  placeholders.REPORT_PERIOD = data.offering.reportPeriod || ''
  placeholders.REPORT_FREQUENCY = data.offering.reportFrequencyDays ?? null
  placeholders.DISPUTE_RESOLUTION_METHOD = data.offering.disputeResolutionMethod || ''
  placeholders.DISPUTE_RESOLUTION_VENUE = data.offering.disputeResolutionVenue || ''

  // Banking placeholders
  placeholders.BANK_NAME = data.banking.bankName || ''
  placeholders.ACCOUNT_NAME = data.banking.accountName || ''
  placeholders.ACCOUNT_NUMBER = data.banking.accountNumber || ''
  placeholders.ROUTING_NUMBER = data.banking.routingNumber || ''
  map.BANK_NAME = data.banking.bankName ? { type: 'input', path: 'banking.bankName' } : { type: 'integration', source: 'banking-connector' }

  placeholders.EXHIBIT_A_CONTENT = buildExhibitAContent(data)
  map.EXHIBIT_A_CONTENT = { type: 'derived', formula: 'dynamic Exhibit A content reflecting paid Members when cap table locks' }

  // Investors / subscription placeholders
  placeholders.INVESTORS = data.investors.map((i) => ({
    SUBSCRIBER_CONTRIBUTION: i.subscriptionAmount ?? 0,
    SUBSCRIBER_OWNERSHIP_PCT: roundToTenth(i.ownershipPct ?? 0),
    SUBSCRIBER_LAST_NAME: i.derivedLastName ?? deriveLastName(i.fullLegalName),
    FULL_LEGAL_NAME: i.fullLegalName,
    STREET_ADDRESS: i.streetAddress || '',
    CITY: i.city || '',
    STATE: i.state || '',
    ZIP: i.zip || '',
    SIGNER_NAME: i.signerName || '',
  }))
  map.INVESTORS = { type: 'repeated', source: 'data.investors' }

  const lpRows = buildLpRows(data.investors)
  map.LP_n = { type: 'repeated', source: 'generate LP_n from investors array' }
  placeholders.LP_ROWS = lpRows

  placeholders.GP_CLASS_B = 0
  placeholders.GP_PCT = data.offering.gpPromote ?? null

  if (data.investors.length > 0) {
    const first = data.investors[0]
    placeholders.LP_1_NAME = first.fullLegalName
    placeholders.LP_1_ADDRESS = [first.streetAddress, first.city, first.state, first.zip].filter(Boolean).join(', ')
    placeholders.LP_1_CONTRIBUTION = first.subscriptionAmount || 0
    placeholders.LP_1_CLASS_A = first.classAUnits || 0
    placeholders.LP_1_PCT = roundToTenth(first.ownershipPct ?? 0)
  }

  // ── Deal Economics placeholders (Section B: Profit Split + Section C: Fees) ─
  if (economicsDeal?.profitSplit) {
    const { pref, waterfall } = economicsDeal.profitSplit

    placeholders.ECON_PREF_ENABLED = pref.type !== 'none'
    placeholders.ECON_PREF_TYPE    = pref.type
    placeholders.ECON_PREF_RATE    = pref.rate ?? null   // decimal e.g. 0.08
    map.ECON_PREF_RATE = pref.rate != null
      ? { type: 'input', path: 'economicsDeal.profitSplit.pref.rate' }
      : { type: 'missing' }

    placeholders.ECON_WATERFALL_MODE      = waterfall.mode
    placeholders.ECON_SIMPLE_LP_SPLIT     = waterfall.simpleLpSplit ?? null
    placeholders.ECON_SIMPLE_GP_SPLIT     = waterfall.simpleLpSplit != null ? 100 - waterfall.simpleLpSplit : null
    placeholders.ECON_WATERFALL_TIERS     = waterfall.tiers ?? []
    map.ECON_WATERFALL_TIERS = { type: 'derived', formula: 'economicsDeal.profitSplit.waterfall.tiers' }
  } else {
    placeholders.ECON_PREF_ENABLED        = false
    placeholders.ECON_PREF_TYPE           = 'none'
    placeholders.ECON_PREF_RATE           = null
    placeholders.ECON_WATERFALL_MODE      = null
    placeholders.ECON_SIMPLE_LP_SPLIT     = null
    placeholders.ECON_SIMPLE_GP_SPLIT     = null
    placeholders.ECON_WATERFALL_TIERS     = []
  }

  // Enabled fees from Section C — only 'yes' entries with complete data
  if (economicsDeal?.fees) {
    placeholders.ECON_FEES = economicsDeal.fees
      .filter(f => f.enabled === 'yes')
      .map(f => ({
        type:        f.type,
        label:       f.label || feeTypeLabel(f.type),
        basisType:   f.basisType,
        rate:        f.rate,        // decimal e.g. 0.01
        flatAmount:  f.flatAmount,
        notes:       f.notes,
      }))
    map.ECON_FEES = { type: 'derived', formula: 'economicsDeal.fees.filter(enabled=yes)' }
  } else {
    placeholders.ECON_FEES = []
  }

  return { values: placeholders, map }
}

// ── Pre-generation validation ─────────────────────────────────────────────────
// Returns a list of human-readable errors. Empty = safe to generate.
export function validateForGeneration(values: Record<string, any>): string[] {
  const errors: string[] = []

  // Core deal fields
  if (!values.ENTITY_NAME)     errors.push('Entity name is missing (Deal Setup)')
  if (!values.FORMATION_STATE) errors.push('Formation state is missing (Deal Setup)')
  if (!values.GP_ENTITY_NAME)  errors.push('GP entity name is missing (Deal Setup)')
  if (!values.EFFECTIVE_DATE)  errors.push('Effective date is missing (Deal Setup)')

  // Preferred return
  if (values.ECON_PREF_ENABLED && values.ECON_PREF_RATE == null) {
    errors.push('Preferred return is enabled but rate is blank — set it in Section B of Deal Economics')
  }

  // Waterfall
  if (values.ECON_WATERFALL_MODE == null) {
    errors.push('Waterfall configuration is missing — complete Section B of Deal Economics')
  } else if (values.ECON_WATERFALL_MODE === 'simple' && values.ECON_SIMPLE_LP_SPLIT == null) {
    errors.push('Simple waterfall LP split is missing — set it in Section B of Deal Economics')
  } else if (values.ECON_WATERFALL_MODE === 'advanced') {
    const tiers: any[] = values.ECON_WATERFALL_TIERS || []
    if (tiers.length === 0) {
      errors.push('Advanced waterfall has no tiers — add tiers in Section B of Deal Economics')
    }
    tiers.forEach((tier, i) => {
      if (tier.lpSplit == null || tier.gpSplit == null) {
        errors.push(`Waterfall Tier ${i + 1} is missing LP/GP split`)
      }
    })
  }

  // Fees — each enabled fee must have a basis and a rate/amount
  const fees: any[] = values.ECON_FEES || []
  fees.forEach(fee => {
    if (!fee.basisType) {
      errors.push(`${fee.label} fee is enabled but has no basis type selected`)
    } else if (fee.basisType === 'flat' && fee.flatAmount == null) {
      errors.push(`${fee.label} fee is enabled as flat amount but no amount is entered`)
    } else if (fee.basisType !== 'flat' && fee.rate == null) {
      errors.push(`${fee.label} fee is enabled but rate is blank`)
    }
  })

  return errors
}

// Export complete placeholder list for assertions or UI
export const ALL_PLACEHOLDERS = [
  'ENTITY_NAME', 'FORMATION_STATE', 'EFFECTIVE_DATE', 'PRINCIPAL_ADDRESS', 'GP_ENTITY_NAME', 'GP_ENTITY_STATE',
  'REGISTERED_AGENT_NAME', 'REGISTERED_AGENT_ADDRESS', 'DEAL_PURPOSE',
  'PROPERTY_ADDRESS', 'PROPERTY_CITY', 'PROPERTY_STATE', 'PROPERTY_ZIP', 'PROPERTY_FULL_ADDRESS', 'PROPERTY_LEGAL_DESCRIPTION',
  'OFFERING_EXEMPTION', 'OFFERING_EXEMPTION_RULE', 'SOLICITATION_METHOD', 'MIN_INVESTMENT', 'CLOSING_DATE',
  'PREFERRED_RETURN_RATE', 'PREFERRED_RETURN_TYPE', 'IRR_RATE', 'GP_PROMOTE', 'LP_RESIDUAL',
  'ASSET_MANAGEMENT_FEE_DESCRIPTION', 'ACQUISITION_FEE_DESCRIPTION', 'DISPOSITION_FEE_DESCRIPTION',
  'CONSENT_THRESHOLD', 'REFINANCE_THRESHOLD', 'AMENDMENT_THRESHOLD', 'REPORT_PERIOD', 'REPORT_FREQUENCY',
  'DISPUTE_RESOLUTION_METHOD', 'DISPUTE_RESOLUTION_VENUE',
  'BANK_NAME', 'ACCOUNT_NAME', 'ACCOUNT_NUMBER', 'ROUTING_NUMBER',
  'SUBSCRIBER_CONTRIBUTION', 'SUBSCRIBER_OWNERSHIP_PCT', 'SUBSCRIBER_LAST_NAME', 'LP_n', 'GP_CLASS_B', 'GP_PCT',
  'ECON_PREF_ENABLED', 'ECON_PREF_TYPE', 'ECON_PREF_RATE',
  'ECON_WATERFALL_MODE', 'ECON_SIMPLE_LP_SPLIT', 'ECON_SIMPLE_GP_SPLIT', 'ECON_WATERFALL_TIERS',
  'ECON_FEES',
]
