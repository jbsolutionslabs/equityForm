import { AppData, Investor } from '../state/store'

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

function parseCityStateZip(address?: string) {
  // very simple heuristic: look for last comma-separated parts
  if (!address) return { city: '', state: '', zip: '' }
  const parts = address.split(',').map((p) => p.trim())
  const last = parts[parts.length - 1] || ''
  // try match "City ST ZIP" or "ST ZIP"
  const m = last.match(/^(.*)\s+([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/)
  if (m) return { city: m[1].trim(), state: m[2].trim(), zip: m[3].trim() }
  const m2 = last.match(/^([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/)
  if (m2) return { city: '', state: m2[1], zip: m2[2] }
  return { city: '', state: '', zip: '' }
}

// Build LP_n entries from investors
function buildLpRows(investors: Investor[]) {
  return investors.map((inv, idx) => ({
    lpIndex: idx + 1,
    LP_NAME: inv.fullLegalName,
    LP_ADDRESS: [inv.streetAddress, inv.city, inv.state, inv.zip].filter(Boolean).join(', '),
    LP_CONTRIBUTION: inv.subscriptionAmount || 0,
    LP_CLASS_A: inv.classAUnits || 0,
    LP_PCT: inv.ownershipPct || 0,
  }))
}

// Main exported function: returns resolved values and a placeholder map
export function generatePlaceholders(data: AppData) {
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

  // registered agent - reserved for future integration but editable
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

  placeholders.PROPERTY_ADDRESS = data.deal.propertyAddress || ''
  map.PROPERTY_ADDRESS = placeholders.PROPERTY_ADDRESS ? { type: 'input', path: 'deal.propertyAddress' } : { type: 'missing' }

  // parse city/state/zip from property address when possible
  const parsed = parseCityStateZip(data.deal.propertyAddress)
  placeholders.PROPERTY_CITY = data.deal.propertyCity || parsed.city || ''
  placeholders.PROPERTY_STATE = data.deal.propertyState || parsed.state || ''
  placeholders.PROPERTY_ZIP = data.deal.propertyZip || parsed.zip || ''
  map.PROPERTY_CITY = placeholders.PROPERTY_CITY ? { type: 'derived', formula: 'parseCityStateZip(propertyAddress) or deal.propertyCity' } : { type: 'missing' }
  map.PROPERTY_STATE = placeholders.PROPERTY_STATE ? { type: 'derived', formula: 'parseCityStateZip(propertyAddress) or deal.propertyState' } : { type: 'missing' }
  map.PROPERTY_ZIP = placeholders.PROPERTY_ZIP ? { type: 'derived', formula: 'parseCityStateZip(propertyAddress) or deal.propertyZip' } : { type: 'missing' }

  placeholders.PROPERTY_LEGAL_DESCRIPTION = data.deal.propertyLegalDescription || ''
  map.PROPERTY_LEGAL_DESCRIPTION = placeholders.PROPERTY_LEGAL_DESCRIPTION ? { type: 'input', path: 'deal.propertyLegalDescription' } : { type: 'missing' }

  // Offering / compliance
  placeholders.OFFERING_EXEMPTION = data.offering.offeringExemption || ''
  map.OFFERING_EXEMPTION = placeholders.OFFERING_EXEMPTION ? { type: 'input', path: 'offering.offeringExemption' } : { type: 'missing' }

  // derive rule text from exemption
  if (data.offering.offeringExemption === '506(b)') {
    placeholders.OFFERING_EXEMPTION_RULE = 'Rule 506(b) - general solicitation not permitted'
    map.OFFERING_EXEMPTION_RULE = { type: 'derived', formula: "if offeringExemption == '506(b)' then 'Rule 506(b) - general solicitation not permitted'" }
  } else if (data.offering.offeringExemption === '506(c)') {
    placeholders.OFFERING_EXEMPTION_RULE = 'Rule 506(c) - general solicitation allowed with verification requirements'
    map.OFFERING_EXEMPTION_RULE = { type: 'derived', formula: "if offeringExemption == '506(c)' then 'Rule 506(c) - verification required'" }
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

  placeholders.PREFERRED_RETURN_RATE = data.offering.preferredReturnRate ?? null
  map.PREFERRED_RETURN_RATE = data.offering.preferredReturnEnabled ? { type: 'input', path: 'offering.preferredReturnRate' } : { type: 'derived', formula: 'preferred return disabled' }

  placeholders.PREFERRED_RETURN_TYPE = data.offering.preferredReturnType || ''
  map.PREFERRED_RETURN_TYPE = placeholders.PREFERRED_RETURN_TYPE ? { type: 'input', path: 'offering.preferredReturnType' } : { type: 'missing' }

  placeholders.IRR_RATE = data.offering.irrRate ?? null
  map.IRR_RATE = placeholders.PREFERRED_RETURN_TYPE === 'IRR-based' ? { type: 'input', path: 'offering.irrRate' } : { type: 'derived', formula: 'only required for IRR-based preferred return' }

  placeholders.GP_PROMOTE = data.offering.gpPromote ?? null
  map.GP_PROMOTE = placeholders.GP_PROMOTE !== null ? { type: 'input', path: 'offering.gpPromote' } : { type: 'missing' }

  // LP_RESIDUAL = 100 - GP_PROMOTE
  placeholders.LP_RESIDUAL = (typeof data.offering.gpPromote === 'number' && data.offering.gpPromote !== null) ? 100 - data.offering.gpPromote : null
  map.LP_RESIDUAL = placeholders.LP_RESIDUAL !== null ? { type: 'derived', formula: '100 - GP_PROMOTE' } : { type: 'missing' }

  placeholders.ASSET_MANAGEMENT_FEE_DESCRIPTION = data.offering.assetManagementFeeDescription || ''
  map.ASSET_MANAGEMENT_FEE_DESCRIPTION = placeholders.ASSET_MANAGEMENT_FEE_DESCRIPTION ? { type: 'input', path: 'offering.assetManagementFeeDescription' } : { type: 'missing' }

  placeholders.ACQUISITION_FEE_DESCRIPTION = data.offering.acquisitionFeeDescription || ''
  map.ACQUISITION_FEE_DESCRIPTION = placeholders.ACQUISITION_FEE_DESCRIPTION ? { type: 'input', path: 'offering.acquisitionFeeDescription' } : { type: 'missing' }

  placeholders.DISPOSITION_FEE_DESCRIPTION = data.offering.dispositionFeeDescription || ''
  map.DISPOSITION_FEE_DESCRIPTION = placeholders.DISPOSITION_FEE_DESCRIPTION ? { type: 'input', path: 'offering.dispositionFeeDescription' } : { type: 'missing' }

  placeholders.CONSENT_THRESHOLD = data.offering.consentThreshold ?? null
  map.CONSENT_THRESHOLD = placeholders.CONSENT_THRESHOLD !== null ? { type: 'input', path: 'offering.consentThreshold' } : { type: 'missing' }

  placeholders.REFINANCE_THRESHOLD = data.offering.refinanceThreshold ?? null
  map.REFINANCE_THRESHOLD = placeholders.REFINANCE_THRESHOLD !== null ? { type: 'input', path: 'offering.refinanceThreshold' } : { type: 'missing' }

  placeholders.AMENDMENT_THRESHOLD = data.offering.amendmentThreshold ?? null
  map.AMENDMENT_THRESHOLD = placeholders.AMENDMENT_THRESHOLD !== null ? { type: 'input', path: 'offering.amendmentThreshold' } : { type: 'missing' }

  placeholders.REPORT_PERIOD = data.offering.reportPeriod || ''
  map.REPORT_PERIOD = placeholders.REPORT_PERIOD ? { type: 'input', path: 'offering.reportPeriod' } : { type: 'missing' }

  placeholders.REPORT_FREQUENCY = data.offering.reportFrequencyDays ?? null
  map.REPORT_FREQUENCY = placeholders.REPORT_FREQUENCY !== null ? { type: 'input', path: 'offering.reportFrequencyDays' } : { type: 'missing' }

  placeholders.DISPUTE_RESOLUTION_METHOD = data.offering.disputeResolutionMethod || ''
  map.DISPUTE_RESOLUTION_METHOD = placeholders.DISPUTE_RESOLUTION_METHOD ? { type: 'input', path: 'offering.disputeResolutionMethod' } : { type: 'missing' }

  placeholders.DISPUTE_RESOLUTION_VENUE = data.offering.disputeResolutionVenue || ''
  map.DISPUTE_RESOLUTION_VENUE = placeholders.DISPUTE_RESOLUTION_VENUE ? { type: 'input', path: 'offering.disputeResolutionVenue' } : { type: 'missing' }

  // Banking placeholders (integration-backed)
  placeholders.BANK_NAME = data.banking.bankName || ''
  map.BANK_NAME = data.banking.bankName ? { type: 'input', path: 'banking.bankName' } : { type: 'integration', source: 'banking-connector' }

  placeholders.ACCOUNT_NAME = data.banking.accountName || ''
  map.ACCOUNT_NAME = data.banking.accountName ? { type: 'input', path: 'banking.accountName' } : { type: 'integration', source: 'banking-connector' }

  placeholders.ACCOUNT_NUMBER = data.banking.accountNumber || ''
  map.ACCOUNT_NUMBER = data.banking.accountNumber ? { type: 'input', path: 'banking.accountNumber' } : { type: 'integration', source: 'banking-connector' }

  placeholders.ROUTING_NUMBER = data.banking.routingNumber || ''
  map.ROUTING_NUMBER = data.banking.routingNumber ? { type: 'input', path: 'banking.routingNumber' } : { type: 'integration', source: 'banking-connector' }

  // Investors / subscription placeholders
  placeholders.INVESTORS = data.investors.map((i) => ({
    SUBSCRIBER_CONTRIBUTION: i.subscriptionAmount ?? 0,
    SUBSCRIBER_OWNERSHIP_PCT: i.ownershipPct ?? 0,
    SUBSCRIBER_LAST_NAME: i.derivedLastName ?? deriveLastName(i.fullLegalName),
    FULL_LEGAL_NAME: i.fullLegalName,
    STREET_ADDRESS: i.streetAddress || '',
    CITY: i.city || '',
    STATE: i.state || '',
    ZIP: i.zip || '',
    SIGNER_NAME: i.signerName || '',
  }))
  map.INVESTORS = { type: 'repeated', source: 'data.investors' }

  // LP_n rows
  const lpRows = buildLpRows(data.investors)
  map.LP_n = { type: 'repeated', source: 'generate LP_n from investors array' }
  placeholders.LP_ROWS = lpRows

  // Potential GP / cap table placeholders (placeholder values for now)
  placeholders.GP_CLASS_B = 0
  map.GP_CLASS_B = { type: 'derived', formula: 'cap table logic (future)' }

  placeholders.GP_PCT = data.offering.gpPromote ?? null
  map.GP_PCT = placeholders.GP_PCT !== null ? { type: 'derived', formula: 'GP promote as placeholder for GP pct (future cap table)' } : { type: 'missing' }

  // Individual subscriber placeholders (example for first investor)
  if (data.investors.length > 0) {
    const first = data.investors[0]
    placeholders.LP_1_NAME = first.fullLegalName
    placeholders.LP_1_ADDRESS = [first.streetAddress, first.city, first.state, first.zip].filter(Boolean).join(', ')
    placeholders.LP_1_CONTRIBUTION = first.subscriptionAmount || 0
    placeholders.LP_1_CLASS_A = first.classAUnits || 0
    placeholders.LP_1_PCT = first.ownershipPct || 0
    map.LP_1_NAME = { type: 'repeated', source: 'investors[0].fullLegalName' }
    map.LP_1_ADDRESS = { type: 'repeated', source: 'investors[0].address fields' }
    map.LP_1_CONTRIBUTION = { type: 'repeated', source: 'investors[0].subscriptionAmount' }
    map.LP_1_CLASS_A = { type: 'repeated', source: 'investors[0].classAUnits' }
    map.LP_1_PCT = { type: 'repeated', source: 'investors[0].ownershipPct' }
  }

  return { values: placeholders, map }
}

// Export complete placeholder list for assertions or UI
export const ALL_PLACEHOLDERS = [
  'ENTITY_NAME', 'FORMATION_STATE', 'EFFECTIVE_DATE', 'PRINCIPAL_ADDRESS', 'GP_ENTITY_NAME', 'GP_ENTITY_STATE', 'REGISTERED_AGENT_NAME', 'REGISTERED_AGENT_ADDRESS', 'DEAL_PURPOSE', 'PROPERTY_ADDRESS', 'PROPERTY_CITY', 'PROPERTY_STATE', 'PROPERTY_ZIP', 'PROPERTY_LEGAL_DESCRIPTION',
  'OFFERING_EXEMPTION', 'OFFERING_EXEMPTION_RULE', 'SOLICITATION_METHOD', 'MIN_INVESTMENT', 'CLOSING_DATE', 'PREFERRED_RETURN_RATE', 'PREFERRED_RETURN_TYPE', 'IRR_RATE', 'GP_PROMOTE', 'LP_RESIDUAL', 'ASSET_MANAGEMENT_FEE_DESCRIPTION', 'ACQUISITION_FEE_DESCRIPTION', 'DISPOSITION_FEE_DESCRIPTION', 'CONSENT_THRESHOLD', 'REFINANCE_THRESHOLD', 'AMENDMENT_THRESHOLD', 'REPORT_PERIOD', 'REPORT_FREQUENCY', 'DISPUTE_RESOLUTION_METHOD', 'DISPUTE_RESOLUTION_VENUE',
  'BANK_NAME', 'ACCOUNT_NAME', 'ACCOUNT_NUMBER', 'ROUTING_NUMBER',
  'SUBSCRIBER_CONTRIBUTION', 'SUBSCRIBER_OWNERSHIP_PCT', 'SUBSCRIBER_LAST_NAME', 'LP_n', 'GP_CLASS_B', 'GP_PCT',
]
