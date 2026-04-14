/**
 * Legal Formation API Client
 *
 * Mock implementations of Delaware formation APIs (CT Corp / Incorp).
 * Production: replace each mock function body with the real API call.
 * Signatures and return types match the expected production contract so
 * integration requires only swapping the implementation, not the interface.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export type NameAvailabilityResult =
  | { status: 'available'; name: string }
  | { status: 'taken';     name: string; suggestions: string[] }
  | { status: 'similar';   name: string; similarTo: string; suggestions: string[] }

export type RegisteredAgentProvider = {
  id:           'northwest' | 'incorp' | 'ctcorp'
  name:         string
  tagline:      string
  annualFee:    number
  deAddress:    string
  logoInitials: string
  accentColor:  string
}

export type RegisteredAgentConfirmation = {
  confirmationId:    string
  providerId:        string
  providerName:      string
  deAddress:         string
  provisionedAt:     string
  annualRenewalDate: string
}

export type CertOfFormationResult = {
  confirmationNumber:      string
  entityName:              string
  agentName:               string
  agentAddress:            string
  filingType:              'standard' | 'same_day'
  fee:                     number
  submittedAt:             string
  estimatedCompletionDate: string
  status:                  'submitted'
}

export type ForeignQualStateInfo = {
  stateCode:     string
  stateName:     string
  filingFee:     number
  estimatedDays: number
  apiSupported:  boolean
  notes?:        string
}

export type ForeignQualResult = {
  confirmationId:          string
  stateCode:               string
  stateName:               string
  filingMethod:            'api' | 'manual'
  submittedAt:             string
  estimatedCompletionDate: string
  status:                  'submitted'
}

// ── Registered Agent Providers ────────────────────────────────────────────

export const REGISTERED_AGENTS: RegisteredAgentProvider[] = [
  {
    id:           'northwest',
    name:         'Northwest Registered Agent',
    tagline:      'Privacy-focused · No junk mail policy · First year included',
    annualFee:    125,
    deAddress:    '8 The Green, Suite A, Dover, DE 19901',
    logoInitials: 'NW',
    accentColor:  '#1e40af',
  },
  {
    id:           'incorp',
    name:         'Incorp Services',
    tagline:      'Technology-forward · Real-time document alerts · Mobile app',
    annualFee:    99,
    deAddress:    '919 North Market Street, Suite 950, Wilmington, DE 19801',
    logoInitials: 'IN',
    accentColor:  '#0f766e',
  },
  {
    id:           'ctcorp',
    name:         'CT Corporation',
    tagline:      'Preferred by law firms · Enterprise-grade · Institutional sponsors',
    annualFee:    280,
    deAddress:    '1209 Orange Street, Wilmington, DE 19801',
    logoInitials: 'CT',
    accentColor:  '#7c3aed',
  },
]

// ── State Requirements Table (all 50 states) ──────────────────────────────

export const STATE_REQUIREMENTS: Record<string, ForeignQualStateInfo> = {
  AL: { stateCode: 'AL', stateName: 'Alabama',        filingFee: 150, estimatedDays: 7,  apiSupported: false },
  AK: { stateCode: 'AK', stateName: 'Alaska',         filingFee: 350, estimatedDays: 10, apiSupported: false },
  AZ: { stateCode: 'AZ', stateName: 'Arizona',        filingFee: 150, estimatedDays: 5,  apiSupported: true  },
  AR: { stateCode: 'AR', stateName: 'Arkansas',       filingFee: 270, estimatedDays: 7,  apiSupported: false },
  CA: { stateCode: 'CA', stateName: 'California',     filingFee: 70,  estimatedDays: 3,  apiSupported: true  },
  CO: { stateCode: 'CO', stateName: 'Colorado',       filingFee: 100, estimatedDays: 2,  apiSupported: true  },
  CT: { stateCode: 'CT', stateName: 'Connecticut',    filingFee: 120, estimatedDays: 5,  apiSupported: true  },
  DE: { stateCode: 'DE', stateName: 'Delaware',       filingFee: 0,   estimatedDays: 0,  apiSupported: true,
        notes: 'Entity formed in Delaware — no foreign qualification required.' },
  FL: { stateCode: 'FL', stateName: 'Florida',        filingFee: 125, estimatedDays: 3,  apiSupported: true  },
  GA: { stateCode: 'GA', stateName: 'Georgia',        filingFee: 225, estimatedDays: 5,  apiSupported: true  },
  HI: { stateCode: 'HI', stateName: 'Hawaii',         filingFee: 50,  estimatedDays: 10, apiSupported: false },
  ID: { stateCode: 'ID', stateName: 'Idaho',          filingFee: 100, estimatedDays: 7,  apiSupported: false },
  IL: { stateCode: 'IL', stateName: 'Illinois',       filingFee: 150, estimatedDays: 10, apiSupported: false },
  IN: { stateCode: 'IN', stateName: 'Indiana',        filingFee: 105, estimatedDays: 3,  apiSupported: true  },
  IA: { stateCode: 'IA', stateName: 'Iowa',           filingFee: 100, estimatedDays: 5,  apiSupported: false },
  KS: { stateCode: 'KS', stateName: 'Kansas',         filingFee: 165, estimatedDays: 5,  apiSupported: false },
  KY: { stateCode: 'KY', stateName: 'Kentucky',       filingFee: 90,  estimatedDays: 5,  apiSupported: false },
  LA: { stateCode: 'LA', stateName: 'Louisiana',      filingFee: 100, estimatedDays: 10, apiSupported: false },
  ME: { stateCode: 'ME', stateName: 'Maine',          filingFee: 250, estimatedDays: 7,  apiSupported: false },
  MD: { stateCode: 'MD', stateName: 'Maryland',       filingFee: 100, estimatedDays: 5,  apiSupported: true  },
  MA: { stateCode: 'MA', stateName: 'Massachusetts',  filingFee: 500, estimatedDays: 5,  apiSupported: false,
        notes: 'Annual report required within 60 days of registration.' },
  MI: { stateCode: 'MI', stateName: 'Michigan',       filingFee: 50,  estimatedDays: 3,  apiSupported: true  },
  MN: { stateCode: 'MN', stateName: 'Minnesota',      filingFee: 135, estimatedDays: 5,  apiSupported: false },
  MS: { stateCode: 'MS', stateName: 'Mississippi',    filingFee: 250, estimatedDays: 7,  apiSupported: false },
  MO: { stateCode: 'MO', stateName: 'Missouri',       filingFee: 105, estimatedDays: 5,  apiSupported: false },
  MT: { stateCode: 'MT', stateName: 'Montana',        filingFee: 70,  estimatedDays: 5,  apiSupported: false },
  NE: { stateCode: 'NE', stateName: 'Nebraska',       filingFee: 120, estimatedDays: 5,  apiSupported: false },
  NV: { stateCode: 'NV', stateName: 'Nevada',         filingFee: 425, estimatedDays: 3,  apiSupported: true  },
  NH: { stateCode: 'NH', stateName: 'New Hampshire',  filingFee: 100, estimatedDays: 7,  apiSupported: false },
  NJ: { stateCode: 'NJ', stateName: 'New Jersey',     filingFee: 125, estimatedDays: 5,  apiSupported: true  },
  NM: { stateCode: 'NM', stateName: 'New Mexico',     filingFee: 100, estimatedDays: 5,  apiSupported: false },
  NY: { stateCode: 'NY', stateName: 'New York',       filingFee: 250, estimatedDays: 7,  apiSupported: false,
        notes: 'NY LLCs must publish notice in two newspapers for 6 consecutive weeks.' },
  NC: { stateCode: 'NC', stateName: 'North Carolina', filingFee: 250, estimatedDays: 5,  apiSupported: false },
  ND: { stateCode: 'ND', stateName: 'North Dakota',   filingFee: 135, estimatedDays: 7,  apiSupported: false },
  OH: { stateCode: 'OH', stateName: 'Ohio',           filingFee: 99,  estimatedDays: 3,  apiSupported: true  },
  OK: { stateCode: 'OK', stateName: 'Oklahoma',       filingFee: 300, estimatedDays: 7,  apiSupported: false },
  OR: { stateCode: 'OR', stateName: 'Oregon',         filingFee: 275, estimatedDays: 5,  apiSupported: true  },
  PA: { stateCode: 'PA', stateName: 'Pennsylvania',   filingFee: 250, estimatedDays: 7,  apiSupported: false },
  RI: { stateCode: 'RI', stateName: 'Rhode Island',   filingFee: 150, estimatedDays: 5,  apiSupported: false },
  SC: { stateCode: 'SC', stateName: 'South Carolina', filingFee: 110, estimatedDays: 5,  apiSupported: false },
  SD: { stateCode: 'SD', stateName: 'South Dakota',   filingFee: 165, estimatedDays: 3,  apiSupported: false },
  TN: { stateCode: 'TN', stateName: 'Tennessee',      filingFee: 300, estimatedDays: 5,  apiSupported: false },
  TX: { stateCode: 'TX', stateName: 'Texas',          filingFee: 750, estimatedDays: 5,  apiSupported: false,
        notes: 'Texas charges $750 for foreign LLC registration.' },
  UT: { stateCode: 'UT', stateName: 'Utah',           filingFee: 70,  estimatedDays: 3,  apiSupported: true  },
  VT: { stateCode: 'VT', stateName: 'Vermont',        filingFee: 125, estimatedDays: 5,  apiSupported: false },
  VA: { stateCode: 'VA', stateName: 'Virginia',       filingFee: 100, estimatedDays: 3,  apiSupported: true  },
  WA: { stateCode: 'WA', stateName: 'Washington',     filingFee: 200, estimatedDays: 3,  apiSupported: true  },
  WV: { stateCode: 'WV', stateName: 'West Virginia',  filingFee: 150, estimatedDays: 7,  apiSupported: false },
  WI: { stateCode: 'WI', stateName: 'Wisconsin',      filingFee: 100, estimatedDays: 5,  apiSupported: false },
  WY: { stateCode: 'WY', stateName: 'Wyoming',        filingFee: 100, estimatedDays: 5,  apiSupported: false },
}

// ── Internal helpers ──────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function generateNameSuggestions(name: string): string[] {
  const base = name.replace(/\s*(LLC|L\.L\.C\.|Inc\.?|Corp\.?|LP|LLP)\s*$/i, '').trim()
  return [`${base} I LLC`, `${base} Holdings LLC`, `${base} Capital LLC`]
}

// ── API Functions ─────────────────────────────────────────────────────────

/**
 * Check Delaware entity name availability.
 * Production: POST to CT Corp / Incorp name-availability endpoint.
 */
export async function checkEntityNameDE(name: string): Promise<NameAvailabilityResult> {
  await delay(900 + Math.random() * 500)

  const normalized = name.trim()
  if (!normalized) throw new Error('Entity name is required')

  // Mock: names that are already taken
  const takenNames = [
    'Acme Capital LLC',
    'Oak Street Holdings LLC',
    'Blue Ridge Partners LLC',
    'Summit Ventures LLC',
    'Maple Hill LLC',
  ]
  if (takenNames.some((t) => t.toLowerCase() === normalized.toLowerCase())) {
    return { status: 'taken', name: normalized, suggestions: generateNameSuggestions(normalized) }
  }

  // Mock: first-word triggers a "too similar" warning
  const similarTriggers = ['apex', 'pinnacle', 'horizon', 'meridian', 'nexus']
  const firstWord = normalized.split(/\s+/)[0].toLowerCase()
  if (similarTriggers.includes(firstWord)) {
    return {
      status:      'similar',
      name:        normalized,
      similarTo:   `${normalized.split(/\s+/)[0]} Capital LLC`,
      suggestions: generateNameSuggestions(normalized),
    }
  }

  return { status: 'available', name: normalized }
}

/**
 * Provision a registered agent via partner API.
 * Production: POST to CT Corp / Incorp agent-provisioning endpoint.
 */
export async function provisionRegisteredAgent(
  _entityName: string,
  providerId: 'northwest' | 'incorp' | 'ctcorp',
): Promise<RegisteredAgentConfirmation> {
  await delay(1400 + Math.random() * 600)

  const provider = REGISTERED_AGENTS.find((a) => a.id === providerId)!
  const now = new Date()
  const renewal = new Date(now)
  renewal.setFullYear(renewal.getFullYear() + 1)

  return {
    confirmationId:    `RA-${providerId.toUpperCase()}-${Date.now().toString(36).toUpperCase().slice(-8)}`,
    providerId:        provider.id,
    providerName:      provider.name,
    deAddress:         provider.deAddress,
    provisionedAt:     now.toISOString(),
    annualRenewalDate: renewal.toISOString(),
  }
}

/**
 * File Certificate of Formation with Delaware Division of Corporations.
 * Production: POST to CT Corp / Incorp filing endpoint.
 */
export async function fileCertOfFormation(params: {
  entityName:   string
  agentName:    string
  agentAddress: string
  filingType:   'standard' | 'same_day'
}): Promise<CertOfFormationResult> {
  await delay(params.filingType === 'same_day' ? 700 : 1600)

  const fee = params.filingType === 'same_day' ? 500 : 90
  const now = new Date()
  const completion = new Date(now)
  completion.setDate(completion.getDate() + (params.filingType === 'same_day' ? 1 : 3))
  // Skip weekends
  while (completion.getDay() === 0 || completion.getDay() === 6) {
    completion.setDate(completion.getDate() + 1)
  }

  return {
    confirmationNumber:      `DE-${Date.now().toString(36).toUpperCase().slice(-8)}`,
    entityName:              params.entityName,
    agentName:               params.agentName,
    agentAddress:            params.agentAddress,
    filingType:              params.filingType,
    fee,
    submittedAt:             now.toISOString(),
    estimatedCompletionDate: completion.toISOString(),
    status:                  'submitted',
  }
}

/**
 * File Foreign Qualification in the property's state.
 * Production: POST to CT Corp / Incorp multi-state filing endpoint.
 */
export async function fileForeignQualification(params: {
  entityName:   string
  stateCode:    string
  agentName:    string
  agentAddress: string
}): Promise<ForeignQualResult> {
  const stateInfo = STATE_REQUIREMENTS[params.stateCode.toUpperCase()]
  if (!stateInfo) throw new Error(`Unknown state: ${params.stateCode}`)

  await delay(1100 + Math.random() * 700)

  const now = new Date()
  const completion = new Date(now)
  completion.setDate(completion.getDate() + stateInfo.estimatedDays)

  return {
    confirmationId:          `FQ-${params.stateCode.toUpperCase()}-${Date.now().toString(36).toUpperCase().slice(-8)}`,
    stateCode:               params.stateCode,
    stateName:               stateInfo.stateName,
    filingMethod:            stateInfo.apiSupported ? 'api' : 'manual',
    submittedAt:             now.toISOString(),
    estimatedCompletionDate: completion.toISOString(),
    status:                  'submitted',
  }
}
