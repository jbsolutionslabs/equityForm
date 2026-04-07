// Render the Operating Agreement and per-investor Subscription Agreements

function fmtCurrency(n: any, includeSymbol = true) {
  if (n === null || n === undefined || n === '') return ''
  const num = Number(n)
  if (isNaN(num)) return String(n)
  const formatted = num.toLocaleString(undefined, { maximumFractionDigits: 2 })
  return includeSymbol ? `$${formatted}` : formatted
}

function fmtPercent(n: any, includeSymbol = true) {
  if (n === null || n === undefined || n === '') return ''
  const cleaned = typeof n === 'string' ? n.replace(/%/g, '').trim() : n
  const num = Number(cleaned)
  if (isNaN(num)) return includeSymbol ? `${cleaned}%` : String(cleaned)
  const rounded = (Math.round(num * 10) / 10).toFixed(1)
  return includeSymbol ? `${rounded}%` : rounded
}

function replaceTokens(template: string, values: Record<string, any>, investor?: Record<string, any>) {
  return template.replace(/\[([A-Z0-9_]+)\]/g, (match, token, offset, full) => {
    const nextChar = full[offset + match.length]
    const prevChar = full[offset - 1]
    const includePercent = nextChar !== '%'
    const includeCurrency = prevChar !== '$'

    // per-investor overrides
    if (investor && investor[token] !== undefined) {
      const v = investor[token]
      if (token.includes('CONTRIBUTION')) return fmtCurrency(v, includeCurrency)
      if (token.includes('PCT') || token.includes('RATE') || token.includes('PROMOTE')) return fmtPercent(v, includePercent)
      return String(v)
    }

    const v = values[token]
    if (v === undefined || v === null || v === '') return ''
    if (token.includes('CONTRIBUTION') || token === 'MIN_INVESTMENT' || token === 'REFINANCE_THRESHOLD') return fmtCurrency(v, includeCurrency)
    if (token.includes('PCT') || token.includes('RATE') || token.includes('PROMOTE') || token === 'LP_RESIDUAL') return fmtPercent(v, includePercent)
    return String(v)
  })
}

function buildPreferredReturnDefinition(values: Record<string, any>) {
  const prefEnabled = !!values.PREFERRED_RETURN_ENABLED
  if (!prefEnabled) return ''
  const prefType = (values.PREFERRED_RETURN_TYPE || '').toLowerCase()
  if (prefType === 'irr-based') {
    return `2.7  "IRR"

means internal rate of return, computed using [IRR_RATE]% per annum, compounded monthly, based on a 365-day calendar year for the actual number of days elapsed, taking into account the timing and amounts of all Capital Contributions and distributions. IRR shall be calculated using the Excel IRR function or similar method.`
  }
  const carryText = prefType === 'non-cumulative'
    ? 'Non-cumulative preferred return is earned only in periods where cash is actually distributed; unpaid amounts do not carry forward.'
    : 'Unpaid preferred return accrues and carries forward each month until fully paid.'
  return `2.7  "Preferred Return" (Flat Annual Rate)

means a flat annual rate of [PREFERRED_RETURN_RATE]% on unreturned Capital Contributions of each Class A Member. ${carryText}`
}

function buildWaterfallSection(values: Record<string, any>) {
  const prefEnabled = !!values.PREFERRED_RETURN_ENABLED
  if (prefEnabled) {
    return `(a)  Class A Preferred Return: First, 100% to the Class A Members, pro rata based on Class A Units held, until each Class A Member has received cumulative distributions equal to the Preferred Return on such Member's Capital Contribution;

(b)  Return of Capital: Second, 100% to the Class A Members, pro rata based on Class A Units held, until each Class A Member has received cumulative distributions equal to such Member's aggregate Capital Contributions;

(c)  Promote Split: Thereafter, [GP_PROMOTE]% to the Class B Members, pro rata based on Class B Units held, and [LP_RESIDUAL]% to the Class A Members, pro rata based on Class A Units held.`
  }
  return `(a)  Return of Capital: First, 100% to the Class A Members, pro rata based on Class A Units held, until each Class A Member has received cumulative distributions equal to such Member's aggregate Capital Contributions;

(b)  Promote Split: Thereafter, [GP_PROMOTE]% to the Class B Members, pro rata based on Class B Units held, and [LP_RESIDUAL]% to the Class A Members, pro rata based on Class A Units held.`
}

export function generateOperatingAgreementText(values: Record<string, any>) {
  const prefDefinition = buildPreferredReturnDefinition(values)
  const prefDefinitionBlock = prefDefinition ? `${prefDefinition}

` : ''
  const waterfallSection = buildWaterfallSection(values)
  const template = `THE MEMBERSHIP INTERESTS EVIDENCED BY THIS AGREEMENT HAVE NOT BEEN REGISTERED WITH THE SECURITIES AND EXCHANGE COMMISSION, BUT HAVE BEEN ISSUED PURSUANT TO EXEMPTIONS UNDER THE FEDERAL SECURITIES ACT OF 1933, AS AMENDED. THE SALE, TRANSFER, PLEDGE, HYPOTHECATION, OR OTHER DISPOSITION OF ANY OF THESE MEMBERSHIP INTERESTS IS RESTRICTED AND MAY NOT BE ACCOMPLISHED EXCEPT IN ACCORDANCE WITH THIS AGREEMENT, AND AN APPLICABLE REGISTRATION STATEMENT OR AN OPINION OF COUNSEL SATISFACTORY TO THE COMPANY THAT A REGISTRATION STATEMENT IS NOT NECESSARY.

THIS OPERATING AGREEMENT (this "Agreement") is entered into and effective as of [EFFECTIVE_DATE], by and among [GP_ENTITY_NAME], a [GP_ENTITY_STATE] limited liability company (the "Managing Member" or "General Partner"), and each of the persons or entities who execute a Subscription Agreement and are listed on Exhibit A attached hereto (collectively, the "Members").

ARTICLE I — FORMATION

1.1  Formation.

The Members hereby form a limited liability company (the "Company") pursuant to the laws of the State of [FORMATION_STATE] upon the terms and conditions set forth in this Agreement. The rights and obligations of the Members shall be as provided in the applicable laws of [FORMATION_STATE] governing limited liability companies, except as otherwise expressly provided herein.

1.2  Name.

The name of the Company shall be [ENTITY_NAME], or such other name as the Managing Member may select from time to time in compliance with applicable law.

1.3  Principal Place of Business; Registered Agent.

The principal place of business of the Company shall be [PRINCIPAL_ADDRESS]. The Company's registered agent and registered office in [FORMATION_STATE] shall be [REGISTERED_AGENT_NAME] at [REGISTERED_AGENT_ADDRESS].

1.4  Purpose.

The purpose of the Company is to [DEAL_PURPOSE], and to engage in any and all activities necessary, convenient, or incidental thereto, including without limitation the acquisition, ownership, financing, development, improvement, leasing, operation, maintenance, and ultimate sale or disposition of the Property (as defined herein).

1.5  Term.

The Company shall continue in existence until dissolved in accordance with the provisions of this Agreement or as required by applicable law.

1.6  Fiscal Year.

The fiscal year of the Company shall end on December 31 of each year, or such other date as determined by the Managing Member with consent of the Members.

ARTICLE II — DEFINITIONS

${prefDefinitionBlock}2.11  "Preferred Return"

means a [PREFERRED_RETURN_RATE]% [PREFERRED_RETURN_TYPE] preferred return on unreturned Capital Contributions of each Class A Member, accruing from the date of such Member's Capital Contribution.

2.12  "Property"

means the real property located at [PROPERTY_ADDRESS], [PROPERTY_CITY], [PROPERTY_STATE] [PROPERTY_ZIP], together with all improvements thereon and all personal property used in connection therewith, as more particularly described in Exhibit B.

6.4  Distributions of Net Cash Flow.

Subject to Section 6.6 and any applicable restrictions imposed by lenders, the Managing Member shall cause the Company to distribute Net Cash Flow, to the extent available, in the following order and priority:

${waterfallSection}

ARTICLE IX — MISCELLANEOUS

9.2  Governing Law.

This Agreement shall be governed by and construed in accordance with the laws of the State of [FORMATION_STATE], without regard to its conflicts of laws principles.

9.3  Dispute Resolution.

Any dispute arising out of or relating to this Agreement shall be resolved by [DISPUTE_RESOLUTION_METHOD] in [DISPUTE_RESOLUTION_VENUE]. The prevailing party shall be entitled to recover its reasonable attorneys' fees and costs.

EXHIBIT A

MEMBERS, CAPITAL CONTRIBUTIONS, AND UNITS

[EXHIBIT_A_CONTENT]

EXHIBIT B

LEGAL DESCRIPTION OF PROPERTY

[PROPERTY_LEGAL_DESCRIPTION]
`
  return replaceTokens(template, values)
}

export function generateOperatingAgreementHtml(values: Record<string, any>) {
  // render a simple HTML document designed for printing to PDF
  const bodyText = generateOperatingAgreementText(values)
  const title = values.ENTITY_NAME || 'Operating Agreement'
  const html = `<!doctype html>
  <html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      @page { size: letter; margin: 0.9in; }
      body {
        font-family: 'Georgia', 'Times New Roman', serif;
        font-size: 11.5pt;
        color: #111;
        line-height: 1.7;
      }
      .doc-cover {
        text-align: center;
        padding-bottom: 16px;
        margin-bottom: 24px;
        border-bottom: 2px solid #111;
      }
      .doc-title {
        font-size: 18pt;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .doc-entity {
        margin-top: 6px;
        font-size: 13pt;
        font-weight: 600;
      }
      .doc-subtitle {
        margin-top: 4px;
        font-size: 10.5pt;
        color: #444;
      }
      .doc-meta {
        margin-top: 12px;
        font-size: 10.5pt;
      }
      .doc-body {
        white-space: pre-wrap;
        word-wrap: break-word;
      }
    </style>
  </head>
  <body>
    <div class="doc-cover">
      <div class="doc-title">Operating Agreement</div>
      <div class="doc-entity">${escapeHtml(values.ENTITY_NAME || '')}</div>
      <div class="doc-subtitle">A ${escapeHtml(values.FORMATION_STATE || '')} Limited Liability Company</div>
      <div class="doc-meta"><strong>Effective Date:</strong> ${escapeHtml(values.EFFECTIVE_DATE || '')}</div>
    </div>
    <div class="doc-body">${escapeHtml(bodyText)}</div>
  </body>
  </html>`

  return html
}

function escapeHtml(s: any) {
  if (s === null || s === undefined) return ''
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function generateSubscriptionAgreementText(values: Record<string, any>, investor: Record<string, any>) {
  const template = `THIS SUBSCRIPTION AND PARTICIPATION AGREEMENT (this "Agreement") is entered into as of the date indicated on the signature page by and between [ENTITY_NAME], a [FORMATION_STATE] limited liability company (the "Company"), managed by [GP_ENTITY_NAME] (the "Managing Member"), and the undersigned subscriber (the "Subscriber").\n\nARTICLE I — SUBSCRIPTION\n\n1.1  Subscription for Units.\n\nSubject to the terms and conditions of this Agreement and the Operating Agreement of the Company (the "Operating Agreement"), Subscriber hereby irrevocably subscribes for and agrees to purchase Class A Units of the Company representing a [SUBSCRIBER_OWNERSHIP_PCT]% membership interest in the Company, in exchange for a Capital Contribution of $[SUBSCRIBER_CONTRIBUTION] (the "Subscription Amount").\n\n1.2  Payment of Subscription Amount.\n\nSubscriber shall pay the Subscription Amount by wire transfer or ACH transfer to the following account:\n\nBank Name:  [BANK_NAME]\nAccount Name:  [ACCOUNT_NAME]\nAccount Number:  [ACCOUNT_NUMBER]\nRouting Number:  [ROUTING_NUMBER]\nReference:  [ENTITY_NAME] — [SUBSCRIBER_LAST_NAME]\n\nPayment shall be made no later than [CLOSING_DATE]. The Company shall have no obligation to admit Subscriber as a Member until the Subscription Amount has been received in full in immediately available funds.\n\nSUBSCRIBER INFORMATION\n\nFull Legal Name of Subscriber:  ___________________________________\n\nSubscription Amount: $  [SUBSCRIBER_CONTRIBUTION]\n\nClass A Units Subscribed:  [SUBSCRIBER_OWNERSHIP_PCT]\n\nSUBSCRIBER SIGNATURE\n\nBy executing below, Subscriber agrees to be bound by the terms of this Agreement and the Operating Agreement.\n`;

  return replaceTokens(template, values, investor)
}

export function generateSubscriptionAgreementHtml(values: Record<string, any>, investor: Record<string, any>) {
  const bodyText = generateSubscriptionAgreementText(values, investor)
  const subscriberName = investor.FULL_LEGAL_NAME || investor.SUBSCRIBER_NAME || investor.SUBSCRIBER_LAST_NAME || ''
  const subscriptionAmount = investor.SUBSCRIBER_CONTRIBUTION ?? ''
  const ownershipPct = investor.SUBSCRIBER_OWNERSHIP_PCT ?? ''
  const html = `<!doctype html>
  <html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(values.ENTITY_NAME || 'Subscription Agreement')}</title>
    <style>
      @page { size: letter; margin: 0.9in; }
      body {
        font-family: 'Georgia', 'Times New Roman', serif;
        font-size: 11.5pt;
        color: #111;
        line-height: 1.7;
      }
      .doc-cover {
        text-align: center;
        padding-bottom: 16px;
        margin-bottom: 24px;
        border-bottom: 2px solid #111;
      }
      .doc-title {
        font-size: 18pt;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .doc-entity {
        margin-top: 6px;
        font-size: 13pt;
        font-weight: 600;
      }
      .doc-subtitle {
        margin-top: 4px;
        font-size: 10.5pt;
        color: #444;
      }
      .doc-meta-grid {
        margin-top: 16px;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px 18px;
        font-size: 10.5pt;
        text-align: left;
      }
      .doc-meta-label { font-weight: 700; color: #111; }
      .doc-body {
        white-space: pre-wrap;
        word-wrap: break-word;
      }
    </style>
  </head>
  <body>
    <div class="doc-cover">
      <div class="doc-title">Subscription Agreement</div>
      <div class="doc-entity">${escapeHtml(values.ENTITY_NAME || '')},</div>
      <div class="doc-subtitle">A ${escapeHtml(values.FORMATION_STATE || '')} Limited Liability Company</div>
      <div class="doc-meta-grid">
        <div><span class="doc-meta-label">Subscriber:</span> ${escapeHtml(subscriberName)}</div>
        <div><span class="doc-meta-label">Offering Exemption:</span> ${escapeHtml(values.OFFERING_EXEMPTION || '')}</div>
        <div><span class="doc-meta-label">Subscription Amount:</span> ${escapeHtml(fmtCurrency(subscriptionAmount, true))}</div>
        <div><span class="doc-meta-label">Ownership:</span> ${escapeHtml(fmtPercent(ownershipPct, true))}</div>
      </div>
    </div>
    <div class="doc-body">${escapeHtml(bodyText)}</div>
  </body>
  </html>`

  return html
}

export function generateAllSubscriptionTexts(values: Record<string, any>) {
  const investors: any[] = values.INVESTORS || []
  return investors.map((inv, idx) => ({
    investorIndex: idx + 1,
    text: generateSubscriptionAgreementText(values, inv),
  }))
}

export default {
  generateOperatingAgreementText,
  generateSubscriptionAgreementText,
  generateSubscriptionAgreementHtml,
  generateAllSubscriptionTexts,
}
