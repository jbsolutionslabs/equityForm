// Render the Operating Agreement and per-investor Subscription Agreements

function fmtCurrency(n: any) {
  if (n === null || n === undefined || n === '') return ''
  const num = Number(n)
  if (isNaN(num)) return String(n)
  return '$' + num.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function fmtPercent(n: any) {
  if (n === null || n === undefined || n === '') return ''
  const num = Number(n)
  if (isNaN(num)) return String(n)
  return num + '%'
}

function replaceTokens(template: string, values: Record<string, any>, investor?: Record<string, any>) {
  return template.replace(/\[([A-Z0-9_]+)\]/g, (_, token) => {
    // per-investor overrides
    if (investor && investor[token] !== undefined) {
      const v = investor[token]
      if (token.includes('CONTRIBUTION')) return fmtCurrency(v)
      if (token.includes('PCT') || token.includes('RATE') || token.includes('PROMOTE')) return fmtPercent(v)
      return String(v)
    }

    const v = values[token]
    if (v === undefined || v === null || v === '') return ''
    if (token.includes('CONTRIBUTION') || token === 'MIN_INVESTMENT' || token === 'REFINANCE_THRESHOLD') return fmtCurrency(v)
    if (token.includes('PCT') || token.includes('RATE') || token.includes('PROMOTE') || token === 'LP_RESIDUAL') return fmtPercent(v)
    return String(v)
  })
}

export function generateOperatingAgreementText(values: Record<string, any>) {
  const template = `EQUITYFORM

FORM TEMPLATE — OPERATING AGREEMENT

OPERATING AGREEMENT

OF

[ENTITY_NAME], LLC

A [FORMATION_STATE] Limited Liability Company

\n+Effective Date: [EFFECTIVE_DATE]\n\n\n+THE MEMBERSHIP INTERESTS EVIDENCED BY THIS AGREEMENT HAVE NOT BEEN REGISTERED WITH THE SECURITIES AND EXCHANGE COMMISSION, BUT HAVE BEEN ISSUED PURSUANT TO EXEMPTIONS UNDER THE FEDERAL SECURITIES ACT OF 1933, AS AMENDED. THE SALE, TRANSFER, PLEDGE, HYPOTHECATION, OR OTHER DISPOSITION OF ANY OF THESE MEMBERSHIP INTERESTS IS RESTRICTED AND MAY NOT BE ACCOMPLISHED EXCEPT IN ACCORDANCE WITH THIS AGREEMENT, AND AN APPLICABLE REGISTRATION STATEMENT OR AN OPINION OF COUNSEL SATISFACTORY TO THE COMPANY THAT A REGISTRATION STATEMENT IS NOT NECESSARY.

THIS OPERATING AGREEMENT (this "Agreement") is entered into and effective as of [EFFECTIVE_DATE], by and among [GP_ENTITY_NAME], a [GP_ENTITY_STATE] limited liability company (the "Managing Member" or "General Partner"), and each of the persons or entities who execute a Subscription Agreement and are listed on Exhibit A attached hereto (collectively, the "Members").

ARTICLE I — FORMATION

1.1  Formation.

The Members hereby form a limited liability company (the "Company") pursuant to the laws of the State of [FORMATION_STATE] upon the terms and conditions set forth in this Agreement. The rights and obligations of the Members shall be as provided in the applicable laws of [FORMATION_STATE] governing limited liability companies, except as otherwise expressly provided herein.

1.2  Name.

The name of the Company shall be [ENTITY_NAME], LLC, or such other name as the Managing Member may select from time to time in compliance with applicable law.

1.3  Principal Place of Business; Registered Agent.

The principal place of business of the Company shall be [PRINCIPAL_ADDRESS]. The Company's registered agent and registered office in [FORMATION_STATE] shall be [REGISTERED_AGENT_NAME] at [REGISTERED_AGENT_ADDRESS].

1.4  Purpose.

The purpose of the Company is to [DEAL_PURPOSE], and to engage in any and all activities necessary, convenient, or incidental thereto, including without limitation the acquisition, ownership, financing, development, improvement, leasing, operation, maintenance, and ultimate sale or disposition of the Property (as defined herein).

1.5  Term.

The Company shall continue in existence until dissolved in accordance with the provisions of this Agreement or as required by applicable law.

1.6  Fiscal Year.

The fiscal year of the Company shall end on December 31 of each year, or such other date as determined by the Managing Member with consent of the Members.

ARTICLE II — DEFINITIONS

...

2.7  "IRR"

means internal rate of return, computed using [IRR_RATE]% per annum, compounded monthly, based on a 365-day calendar year for the actual number of days elapsed, taking into account the timing and amounts of all Capital Contributions and distributions. IRR shall be calculated using the Excel IRR function or similar method.

2.11  "Preferred Return"

means a [PREFERRED_RETURN_RATE]% [PREFERRED_RETURN_TYPE] preferred return on unreturned Capital Contributions of each Class A Member, accruing from the date of such Member's Capital Contribution.

2.12  "Property"

means the real property located at [PROPERTY_ADDRESS], [PROPERTY_CITY], [PROPERTY_STATE] [PROPERTY_ZIP], together with all improvements thereon and all personal property used in connection therewith, as more particularly described in Exhibit B.

...

6.4  Distributions of Net Cash Flow.

Subject to Section 6.6 and any applicable restrictions imposed by lenders, the Managing Member shall cause the Company to distribute Net Cash Flow, to the extent available, in the following order and priority:

(a)  Class A Preferred Return: First, 100% to the Class A Members, pro rata based on Class A Units held, until each Class A Member has received cumulative distributions equal to the Preferred Return on such Member's Capital Contribution;

(b)  Return of Capital: Second, 100% to the Class A Members, pro rata based on Class A Units held, until each Class A Member has received cumulative distributions equal to such Member's aggregate Capital Contributions;

(c)  Promote Split: Thereafter, [GP_PROMOTE]% to the Class B Members, pro rata based on Class B Units held, and [LP_RESIDUAL]% to the Class A Members, pro rata based on Class A Units held.

...

ARTICLE IX — MISCELLANEOUS

9.2  Governing Law.

This Agreement shall be governed by and construed in accordance with the laws of the State of [FORMATION_STATE], without regard to its conflicts of laws principles.

9.3  Dispute Resolution.

Any dispute arising out of or relating to this Agreement shall be resolved by [DISPUTE_RESOLUTION_METHOD] in [DISPUTE_RESOLUTION_VENUE]. The prevailing party shall be entitled to recover its reasonable attorneys' fees and costs.

EXHIBIT A

MEMBERS, CAPITAL CONTRIBUTIONS, AND UNITS

[LP_1_NAME]
[LP_1_ADDRESS]

[LP_1_CONTRIBUTION]

[LP_1_CLASS_A]
—

[LP_1_PCT]%

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
      @page { size: letter; margin: 1in; }
      body { font-family: 'Times New Roman', Times, serif; font-size: 12pt; color: #000; }
      h1 { text-align: center; font-size: 16pt; font-weight: bold; }
      h2 { text-align: center; font-size: 12pt; }
      pre { white-space: pre-wrap; word-wrap: break-word; }
      .effective-date { margin-bottom: 12px; }
    </style>
  </head>
  <body>
    <h1>OPERATING AGREEMENT</h1>
    <h2>OF<br/>${escapeHtml(values.ENTITY_NAME || '')}, LLC</h2>
    <div class="effective-date"><strong>Effective Date:</strong> ${escapeHtml(values.EFFECTIVE_DATE || '')}</div>
    <pre>${escapeHtml(bodyText)}</pre>
  </body>
  </html>`

  return html
}

function escapeHtml(s: any) {
  if (s === null || s === undefined) return ''
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function generateSubscriptionAgreementText(values: Record<string, any>, investor: Record<string, any>) {
  const template = `EQUITYFORM\n\n+FORM TEMPLATE — SUBSCRIPTION AGREEMENT\n\n+SUBSCRIPTION AND PARTICIPATION AGREEMENT\n\n+\n+[ENTITY_NAME], LLC\n\n+A [FORMATION_STATE] Limited Liability Company\n\n+Minimum Investment: [MIN_INVESTMENT]\n+\n+Offering Exemption: [OFFERING_EXEMPTION]\n+\n+\n+THIS SUBSCRIPTION AND PARTICIPATION AGREEMENT (this "Agreement") is entered into as of the date indicated on the signature page by and between [ENTITY_NAME], LLC, a [FORMATION_STATE] limited liability company (the "Company"), managed by [GP_ENTITY_NAME] (the "Managing Member"), and the undersigned subscriber (the "Subscriber").\n+\n+ARTICLE I — SUBSCRIPTION\n+\n+1.1  Subscription for Units.\n+\n+Subject to the terms and conditions of this Agreement and the Operating Agreement of the Company (the "Operating Agreement"), Subscriber hereby irrevocably subscribes for and agrees to purchase Class A Units of the Company representing a [SUBSCRIBER_OWNERSHIP_PCT]% membership interest in the Company, in exchange for a Capital Contribution of $[SUBSCRIBER_CONTRIBUTION] (the "Subscription Amount").\n+\n+1.2  Payment of Subscription Amount.\n+\n+Subscriber shall pay the Subscription Amount by wire transfer or ACH transfer to the following account:\n+\n+Bank Name:  [BANK_NAME]\n+Account Name:  [ACCOUNT_NAME]\n+Account Number:  [ACCOUNT_NUMBER]\n+Routing Number:  [ROUTING_NUMBER]\n+Reference:  [ENTITY_NAME] — [SUBSCRIBER_LAST_NAME]\n+\n+Payment shall be made no later than [CLOSING_DATE]. The Company shall have no obligation to admit Subscriber as a Member until the Subscription Amount has been received in full in immediately available funds.\n+\n+...\n+\n+SUBSCRIBER INFORMATION\n+\n+Full Legal Name of Subscriber:  ___________________________________\n+\n+Subscription Amount: $  [SUBSCRIBER_CONTRIBUTION]\n+\n+Class A Units Subscribed:  [SUBSCRIBER_OWNERSHIP_PCT]\n+\n+SUBSCRIBER SIGNATURE\n+\n+By executing below, Subscriber agrees to be bound by the terms of this Agreement and the Operating Agreement.\n+`;

  return replaceTokens(template, values, investor)
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
  generateAllSubscriptionTexts,
}
