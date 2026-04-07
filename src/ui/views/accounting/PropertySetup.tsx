import React, { useState } from 'react'
import { useAccountingStore, buildDefaultEntry } from '../../../state/accountingStore'
import { useAppStore } from '../../../state/store'
import type { AccountingProperty } from '../../../state/accountingTypes'
import { CurrencyInput } from '../../components/CurrencyInput'
import { AddressAutocompleteInput, ParsedAddress } from '../../components/AddressAutocompleteInput'
import ModuleProgress from '../../components/ModuleProgress'

/* ─── Types ── */

type CoreForm = {
  name:             string
  assetClass:       'multifamily' | 'hotel'
  dealId:           string
  purchasePrice:    number
  mortgageBalance:  number   // at closing
  initialEquity:    number
  acquisitionDate:  string
  lpEquity:         number
  lpPrefRateAnnual: number   // decimal
}

type AdvancedForm = {
  // Identity
  address:          string
  city:             string
  state:            string
  ein:              string
  taxYear:          number
  fiscalYearEnd:    string
  accountingMethod: 'Accrual' | 'Cash'

  // Debt structure
  annualInterestRate:  number
  amortizationYears:   number
  loanTermYears:       number
  loanStartDate:       string

  // Depreciation
  depreciableBuilding:        number
  depreciationLifeYears:      number
  accumulatedDepreciationBOY: number
  deferredFinancingCosts:     number

  // GP waterfall
  gpEquity:        number
  gpOwnershipPct:  number
  gpPromotePct:    number

  // Section 7 opening balances (beyond what we derive from core)
  cashBeginning:               number
  accountsReceivableBeginning: number
  prepaidExpensesBeginning:    number
  otherAssetsBeginning:        number
  accountsPayableBeginning:    number
  accruedLiabilitiesBeginning: number
  partnersCapitalBeginning:    number

  // Monthly defaults
  monthlyCapExDefault:   number
  monthlyReserveDefault: number
}

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC']

const defaultCore = (): CoreForm => ({
  name:             '',
  assetClass:       'multifamily',
  dealId:           '',
  purchasePrice:    0,
  mortgageBalance:  0,
  initialEquity:    0,
  acquisitionDate:  '',
  lpEquity:         0,
  lpPrefRateAnnual: 0.08,
})

const defaultAdvanced = (): AdvancedForm => ({
  address: '', city: '', state: 'TX',
  ein: '', taxYear: new Date().getFullYear(), fiscalYearEnd: '12/31', accountingMethod: 'Accrual',
  annualInterestRate: 0.065, amortizationYears: 30, loanTermYears: 5, loanStartDate: '',
  depreciableBuilding: 0, depreciationLifeYears: 27.5, accumulatedDepreciationBOY: 0, deferredFinancingCosts: 0,
  gpEquity: 0, gpOwnershipPct: 0.2, gpPromotePct: 0.2,
  cashBeginning: 0, accountsReceivableBeginning: 0, prepaidExpensesBeginning: 0,
  otherAssetsBeginning: 0, accountsPayableBeginning: 0, accruedLiabilitiesBeginning: 0,
  partnersCapitalBeginning: 0,
  monthlyCapExDefault: 0, monthlyReserveDefault: 0,
})

/* Build full AccountingProperty from core + advanced forms */
function buildProperty(
  core: CoreForm,
  adv: AdvancedForm,
): Omit<AccountingProperty, 'id' | 'createdAt' | 'updatedAt' | 'setupComplete'> {
  const lpOwnershipPct = adv.gpOwnershipPct < 1 ? 1 - adv.gpOwnershipPct : 0.8
  // Derive depreciable basis from purchase price if not overridden
  const depreciableBuilding = adv.depreciableBuilding > 0
    ? adv.depreciableBuilding
    : core.purchasePrice * 0.85   // default: 85% of purchase price is building

  return {
    dealId:           core.dealId,
    name:             core.name,
    address:          adv.address,
    city:             adv.city,
    state:            adv.state,
    assetClass:       core.assetClass,
    taxYear:          adv.taxYear,
    fiscalYearEnd:    adv.fiscalYearEnd,
    accountingMethod: adv.accountingMethod,
    ein:              adv.ein,
    purchasePrice:    core.purchasePrice,
    landValue:        core.purchasePrice - depreciableBuilding,
    acquisitionDate:  core.acquisitionDate,
    debtStructure: {
      loanAmount:         core.mortgageBalance,
      annualInterestRate: adv.annualInterestRate,
      amortizationYears:  adv.amortizationYears,
      loanTermYears:      adv.loanTermYears,
      loanStartDate:      adv.loanStartDate || core.acquisitionDate?.substring(0, 7) || '',
    },
    depreciation: {
      depreciableBuilding,
      depreciationLifeYears:      adv.depreciationLifeYears,
      accumulatedDepreciationBOY: adv.accumulatedDepreciationBOY,
      deferredFinancingCosts:     adv.deferredFinancingCosts,
    },
    openingBalances: {
      cashBeginning:               adv.cashBeginning,
      accountsReceivableBeginning: adv.accountsReceivableBeginning,
      prepaidExpensesBeginning:    adv.prepaidExpensesBeginning,
      otherAssetsBeginning:        adv.otherAssetsBeginning,
      accountsPayableBeginning:    adv.accountsPayableBeginning,
      accruedLiabilitiesBeginning: adv.accruedLiabilitiesBeginning,
      partnersCapitalBeginning:    adv.partnersCapitalBeginning,
    },
    waterfall: {
      lpEquity:             core.lpEquity,
      gpEquity:             adv.gpEquity,
      lpOwnershipPct,
      gpOwnershipPct:       adv.gpOwnershipPct,
      lpPrefRateAnnual:     core.lpPrefRateAnnual,
      gpPromotePct:         adv.gpPromotePct,
      returnOfCapitalFirst: true,
    },
    monthlyCapExDefault:   adv.monthlyCapExDefault,
    monthlyReserveDefault: adv.monthlyReserveDefault,
  }
}

/* ─── Props ── */

type Props = {
  existingProperty?: AccountingProperty
  onSaved: (propertyId: string) => void
  onCancel?: () => void
}

/* ─── Component ── */

export const PropertySetup: React.FC<Props> = ({ existingProperty, onSaved, onCancel }) => {
  const addProperty    = useAccountingStore((s) => s.addProperty)
  const updateProperty = useAccountingStore((s) => s.updateProperty)
  const upsertEntry    = useAccountingStore((s) => s.upsertEntry)

  // Phase 1 deals — single deal for now
  const phase1Deal = useAppStore((s) => s.data.deal)
  const availableDeals = phase1Deal.entityName
    ? [{ id: phase1Deal.entityName, label: phase1Deal.entityName }]
    : []

  // Hydrate from existing property if editing
  const initCore = (): CoreForm => {
    if (!existingProperty) return { ...defaultCore(), dealId: availableDeals[0]?.id ?? '' }
    return {
      name:             existingProperty.name,
      assetClass:       existingProperty.assetClass,
      dealId:           existingProperty.dealId,
      purchasePrice:    existingProperty.purchasePrice,
      mortgageBalance:  existingProperty.debtStructure.loanAmount,
      initialEquity:    existingProperty.openingBalances.partnersCapitalBeginning,
      acquisitionDate:  existingProperty.acquisitionDate,
      lpEquity:         existingProperty.waterfall.lpEquity,
      lpPrefRateAnnual: existingProperty.waterfall.lpPrefRateAnnual,
    }
  }

  const initAdvanced = (): AdvancedForm => {
    if (!existingProperty) return defaultAdvanced()
    const p = existingProperty
    return {
      address: p.address, city: p.city, state: p.state,
      ein: p.ein, taxYear: p.taxYear, fiscalYearEnd: p.fiscalYearEnd, accountingMethod: p.accountingMethod,
      annualInterestRate:  p.debtStructure.annualInterestRate,
      amortizationYears:   p.debtStructure.amortizationYears,
      loanTermYears:       p.debtStructure.loanTermYears,
      loanStartDate:       p.debtStructure.loanStartDate,
      depreciableBuilding:        p.depreciation.depreciableBuilding,
      depreciationLifeYears:      p.depreciation.depreciationLifeYears,
      accumulatedDepreciationBOY: p.depreciation.accumulatedDepreciationBOY,
      deferredFinancingCosts:     p.depreciation.deferredFinancingCosts,
      gpEquity:        p.waterfall.gpEquity,
      gpOwnershipPct:  p.waterfall.gpOwnershipPct,
      gpPromotePct:    p.waterfall.gpPromotePct,
      cashBeginning:               p.openingBalances.cashBeginning,
      accountsReceivableBeginning: p.openingBalances.accountsReceivableBeginning,
      prepaidExpensesBeginning:    p.openingBalances.prepaidExpensesBeginning,
      otherAssetsBeginning:        p.openingBalances.otherAssetsBeginning,
      accountsPayableBeginning:    p.openingBalances.accountsPayableBeginning,
      accruedLiabilitiesBeginning: p.openingBalances.accruedLiabilitiesBeginning,
      partnersCapitalBeginning:    p.openingBalances.partnersCapitalBeginning,
      monthlyCapExDefault:   p.monthlyCapExDefault,
      monthlyReserveDefault: p.monthlyReserveDefault,
    }
  }

  const [core, setCore]       = useState<CoreForm>(initCore)
  const [adv, setAdv]         = useState<AdvancedForm>(initAdvanced)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [errors, setErrors]   = useState<Record<string, string>>({})
  const [saving, setSaving]   = useState(false)

  const patchCore = <K extends keyof CoreForm>(k: K, v: CoreForm[K]) =>
    setCore((f) => ({ ...f, [k]: v }))

  const patchAdv = <K extends keyof AdvancedForm>(k: K, v: AdvancedForm[K]) =>
    setAdv((f) => ({ ...f, [k]: v }))

  const validate = (): boolean => {
    const e: Record<string, string> = {}
    if (!core.name.trim())            e.name            = 'Required'
    if (!core.acquisitionDate.trim()) e.acquisitionDate = 'Required'
    if (core.lpEquity <= 0)           e.lpEquity        = 'Required — used for LP pref calculation'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSave = () => {
    if (!validate()) return
    setSaving(true)
    try {
      const data = buildProperty(core, adv)
      let propId: string

      if (existingProperty) {
        updateProperty(existingProperty.id, { ...data, setupComplete: true })
        propId = existingProperty.id
      } else {
        propId = addProperty({ ...data, setupComplete: true })
        // Seed current month entry
        const now    = new Date()
        const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
        const prop   = useAccountingStore.getState().getProperty(propId)
        if (prop) {
          const seededEntry = buildDefaultEntry(prop, period)
          seededEntry.workingCapital.capitalContributions = core.initialEquity
          upsertEntry(seededEntry)
        }
      }

      onSaved(propId)
    } finally {
      setSaving(false)
    }
  }

  const monthlyPref = core.lpEquity > 0 && core.lpPrefRateAnnual > 0
    ? Math.round((core.lpEquity * core.lpPrefRateAnnual) / 12)
    : null

  return (
    <div className="page-enter">
      <div className="page-header">
        <ModuleProgress
          moduleLabel="Accounting"
          step={2}
          totalSteps={3}
          stepTitle={existingProperty ? 'Edit Property Setup' : 'Add Property Setup'}
          detail="Core setup and assumptions"
        />
        <h1>{existingProperty ? existingProperty.name : 'Add a Property'}</h1>
        <p className="page-header-subtitle">
          Enter a few key numbers to get started. The platform auto-generates your financial
          statements from monthly line items you enter. Advanced settings can be filled in anytime.
        </p>
      </div>

      <div className="card" style={{ maxWidth: 640 }}>

        {/* ── Property name & type ── */}
        <div className="field-group">
          <label className="field-label">Property name *</label>
          <input
            type="text"
            className={`field-input ${errors.name ? 'field-input--error' : ''}`}
            placeholder="e.g. Sunset Ridge Apartments"
            value={core.name}
            onChange={(e) => patchCore('name', e.target.value)}
          />
          {errors.name && <div className="field-error">{errors.name}</div>}
        </div>

        <div className="field-group">
          <label className="field-label">Asset class</label>
          <div className="toggle-group">
            <button
              type="button"
              className={`toggle-btn ${core.assetClass === 'multifamily' ? 'toggle-btn--active' : ''}`}
              onClick={() => patchCore('assetClass', 'multifamily')}
            >
              Multifamily
            </button>
            <button
              type="button"
              className={`toggle-btn ${core.assetClass === 'hotel' ? 'toggle-btn--active' : ''}`}
              onClick={() => patchCore('assetClass', 'hotel')}
            >
              Hotel
            </button>
          </div>
        </div>

        {/* ── Deal linkage ── */}
        <div className="field-group">
          <label className="field-label">Deal / Fund</label>
          {availableDeals.length > 0 ? (
            <select
              className="field-input"
              style={{ maxWidth: 340 }}
              value={core.dealId}
              onChange={(e) => patchCore('dealId', e.target.value)}
            >
              <option value="">— Select a deal —</option>
              {availableDeals.map((d) => (
                <option key={d.id} value={d.id}>{d.label}</option>
              ))}
              <option value="__standalone__">Standalone (no deal link)</option>
            </select>
          ) : (
            <input
              type="text"
              className="field-input"
              style={{ maxWidth: 340 }}
              placeholder="Fund or deal name (optional)"
              value={core.dealId}
              onChange={(e) => patchCore('dealId', e.target.value)}
            />
          )}
          <div className="field-hint">
            {availableDeals.length > 0
              ? 'Links this property to a deal in your dashboard.'
              : 'No deals found in Phase 1. Complete the Questionnaire first, or enter a name manually.'}
          </div>
        </div>

        <div className="property-setup-divider">Financial Details</div>

        {/* ── Core 4 fields ── */}
        <div className="property-setup-grid">
          <div className="field-group">
            <label className="field-label">Purchase Price</label>
            <div className="input-with-adornment">
              <span className="field-adornment">$</span>
              <CurrencyInput
                className="field-input"
                value={core.purchasePrice}
                onChange={(v) => patchCore('purchasePrice', v)}
              />
            </div>
          </div>

          <div className="field-group">
            <label className="field-label">Mortgage Balance At Closing</label>
            <div className="input-with-adornment">
              <span className="field-adornment">$</span>
              <CurrencyInput
                className="field-input"
                value={core.mortgageBalance}
                onChange={(v) => patchCore('mortgageBalance', v)}
              />
            </div>
          </div>

          <div className="field-group">
            <label className="field-label">Initial Equity Contributed</label>
            <div className="input-with-adornment">
              <span className="field-adornment">$</span>
              <CurrencyInput
                className="field-input"
                value={core.initialEquity}
                onChange={(v) => patchCore('initialEquity', v)}
              />
            </div>
          </div>

          <div className="field-group">
            <label className="field-label">Acquisition Date *</label>
            <input
              type="date"
              className={`field-input ${errors.acquisitionDate ? 'field-input--error' : ''}`}
              value={core.acquisitionDate}
              onChange={(e) => patchCore('acquisitionDate', e.target.value)}
            />
            {errors.acquisitionDate && <div className="field-error">{errors.acquisitionDate}</div>}
          </div>
        </div>

        <div className="property-setup-divider">LP Distribution</div>

        {/* ── LP pref fields ── */}
        <div className="property-setup-grid">
          <div className="field-group">
            <label className="field-label">LP Equity Invested *</label>
            <div className="input-with-adornment">
              <span className="field-adornment">$</span>
              <CurrencyInput
                className={`field-input ${errors.lpEquity ? 'field-input--error' : ''}`}
                value={core.lpEquity}
                onChange={(v) => patchCore('lpEquity', v)}
              />
            </div>
            {errors.lpEquity && <div className="field-error">{errors.lpEquity}</div>}
          </div>

          <div className="field-group">
            <label className="field-label">Annual LP Preferred Return</label>
            <div className="input-with-adornment">
              <input
                type="number"
                className="field-input"
                value={core.lpPrefRateAnnual * 100 || ''}
                step={0.25}
                onChange={(e) => patchCore('lpPrefRateAnnual', (parseFloat(e.target.value) || 0) / 100)}
              />
              <span className="field-adornment">%</span>
            </div>
          </div>
        </div>

        {monthlyPref !== null && (
          <div className="info-box" style={{ marginTop: 4, marginBottom: 20 }}>
            Monthly LP pref auto-fill: <strong>${monthlyPref.toLocaleString()}/mo</strong>
            {' '}(${Math.round(core.lpEquity * core.lpPrefRateAnnual).toLocaleString()}/yr)
          </div>
        )}

        {/* ── Advanced settings ── */}
        <button
          type="button"
          className="advanced-toggle"
          onClick={() => setShowAdvanced((v) => !v)}
          aria-expanded={showAdvanced}
        >
          <span className="advanced-toggle-icon">{showAdvanced ? '▾' : '▸'}</span>
          Advanced settings
          <span className="advanced-toggle-hint">
            — debt structure, depreciation, Section 7 opening balances, CapEx defaults
          </span>
        </button>

        {showAdvanced && (
          <div className="advanced-section">

            <div className="property-setup-divider">Property Details</div>
            <div className="property-setup-grid">
              <div className="field-group">
                <label className="field-label">Street Address</label>
                <AddressAutocompleteInput
                  className="field-input"
                  value={adv.address}
                  onChange={(v) => patchAdv('address', v)}
                  onSelectAddress={(addr: ParsedAddress) => {
                    if (addr.streetAddress) patchAdv('address', addr.streetAddress)
                    if (addr.city) patchAdv('city', addr.city)
                    if (addr.state) patchAdv('state', addr.state)
                  }}
                />
              </div>
              <div className="field-group">
                <label className="field-label">City</label>
                <input type="text" className="field-input" value={adv.city} onChange={(e) => patchAdv('city', e.target.value)} />
              </div>
              <div className="field-group">
                <label className="field-label">State</label>
                <select className="field-input" value={adv.state} onChange={(e) => patchAdv('state', e.target.value)}>
                  {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="field-group">
                <label className="field-label">EIN</label>
                <input type="text" className="field-input" placeholder="XX-XXXXXXX" value={adv.ein} onChange={(e) => patchAdv('ein', e.target.value)} />
              </div>
              <div className="field-group">
                <label className="field-label">Tax Year</label>
                <input type="number" className="field-input" value={adv.taxYear} onChange={(e) => patchAdv('taxYear', parseInt(e.target.value) || new Date().getFullYear())} />
              </div>
              <div className="field-group">
                <label className="field-label">Accounting Method</label>
                <div className="toggle-group">
                  {(['Accrual', 'Cash'] as const).map((m) => (
                    <button key={m} type="button"
                      className={`toggle-btn toggle-btn--sm ${adv.accountingMethod === m ? 'toggle-btn--active' : ''}`}
                      onClick={() => patchAdv('accountingMethod', m)}>{m}</button>
                  ))}
                </div>
              </div>
            </div>

            <div className="property-setup-divider">Debt Structure</div>
            <div className="property-setup-grid">
              <div className="field-group">
                <label className="field-label">Annual Interest Rate</label>
                <div className="input-with-adornment">
                  <input type="number" className="field-input" step={0.125} value={adv.annualInterestRate * 100 || ''} onChange={(e) => patchAdv('annualInterestRate', (parseFloat(e.target.value) || 0) / 100)} />
                  <span className="field-adornment">%</span>
                </div>
              </div>
              <div className="field-group">
                <label className="field-label">Amortization</label>
                <div className="input-with-adornment">
                  <input type="number" className="field-input" value={adv.amortizationYears || ''} onChange={(e) => patchAdv('amortizationYears', parseFloat(e.target.value) || 30)} />
                  <span className="field-adornment">yrs</span>
                </div>
              </div>
              <div className="field-group">
                <label className="field-label">Loan Term (Maturity)</label>
                <div className="input-with-adornment">
                  <input type="number" className="field-input" value={adv.loanTermYears || ''} onChange={(e) => patchAdv('loanTermYears', parseFloat(e.target.value) || 5)} />
                  <span className="field-adornment">yrs</span>
                </div>
              </div>
              <div className="field-group">
                <label className="field-label">First Payment Month</label>
                <input type="month" className="field-input" value={adv.loanStartDate} onChange={(e) => patchAdv('loanStartDate', e.target.value)} />
              </div>
            </div>

            <div className="property-setup-divider">Depreciation</div>
            <div className="property-setup-grid">
              <div className="field-group">
                <label className="field-label">Depreciable Building Basis</label>
                <div className="input-with-adornment">
                  <span className="field-adornment">$</span>
                  <CurrencyInput className="field-input" value={adv.depreciableBuilding} onChange={(v) => patchAdv('depreciableBuilding', v)} />
                </div>
                <div className="field-hint">Leave 0 to auto-derive as 85% of purchase price</div>
              </div>
              <div className="field-group">
                <label className="field-label">Useful Life</label>
                <div className="input-with-adornment">
                  <input type="number" className="field-input" step={0.5} value={adv.depreciationLifeYears || ''} onChange={(e) => patchAdv('depreciationLifeYears', parseFloat(e.target.value) || 27.5)} />
                  <span className="field-adornment">yrs</span>
                </div>
                <div className="field-hint">27.5 residential / 39 commercial</div>
              </div>
              <div className="field-group">
                <label className="field-label">Accumulated Depreciation (BOY)</label>
                <div className="input-with-adornment">
                  <span className="field-adornment">$</span>
                  <CurrencyInput className="field-input" value={adv.accumulatedDepreciationBOY} onChange={(v) => patchAdv('accumulatedDepreciationBOY', v)} />
                </div>
                <div className="field-hint">0 if starting from acquisition year</div>
              </div>
              <div className="field-group">
                <label className="field-label">Deferred Financing Costs</label>
                <div className="input-with-adornment">
                  <span className="field-adornment">$</span>
                  <CurrencyInput className="field-input" value={adv.deferredFinancingCosts} onChange={(v) => patchAdv('deferredFinancingCosts', v)} />
                </div>
              </div>
            </div>

            <div className="property-setup-divider">GP Waterfall</div>
            <div className="property-setup-grid">
              <div className="field-group">
                <label className="field-label">GP Co-Invest Equity</label>
                <div className="input-with-adornment">
                  <span className="field-adornment">$</span>
                  <CurrencyInput className="field-input" value={adv.gpEquity} onChange={(v) => patchAdv('gpEquity', v)} />
                </div>
              </div>
              <div className="field-group">
                <label className="field-label">GP Ownership %</label>
                <div className="input-with-adornment">
                  <input type="number" className="field-input" step={0.1} value={(adv.gpOwnershipPct * 100) || ''} onChange={(e) => patchAdv('gpOwnershipPct', (parseFloat(e.target.value) || 0) / 100)} />
                  <span className="field-adornment">%</span>
                </div>
              </div>
              <div className="field-group">
                <label className="field-label">GP Promote %</label>
                <div className="input-with-adornment">
                  <input type="number" className="field-input" step={1} value={(adv.gpPromotePct * 100) || ''} onChange={(e) => patchAdv('gpPromotePct', (parseFloat(e.target.value) || 0) / 100)} />
                  <span className="field-adornment">%</span>
                </div>
              </div>
            </div>

            <div className="property-setup-divider">
              Opening balance sheet
              <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 8, fontSize: 12, color: 'var(--color-slate-500)' }}>
                Schedule L / IRS Form 1065 — beginning of tax year
              </span>
            </div>
            <div className="property-setup-grid">
              {([
                ['Cash — Beginning of Year', 'cashBeginning', 'Schedule L Line 1'],
                ['Accounts Receivable — Beg', 'accountsReceivableBeginning', 'Schedule L Line 2'],
                ['Prepaid Expenses — Beg', 'prepaidExpensesBeginning', 'Schedule L Line 6'],
                ['Other Assets — Beg', 'otherAssetsBeginning', 'Schedule L Line 13'],
                ['Accounts Payable — Beg', 'accountsPayableBeginning', 'Schedule L Line 15'],
                ['Accrued Liabilities — Beg', 'accruedLiabilitiesBeginning', 'Schedule L Line 18'],
                ["Partners' Capital — Beg", 'partnersCapitalBeginning', 'Schedule L Line 21'],
              ] as [string, keyof AdvancedForm, string][]).map(([label, field, hint]) => (
                <div key={field} className="field-group">
                  <label className="field-label">{label}</label>
                  <div className="input-with-adornment">
                    <span className="field-adornment">$</span>
                    <CurrencyInput
                      className="field-input"
                      value={adv[field] as number}
                      onChange={(v) => patchAdv(field, v as any)}
                    />
                  </div>
                  <div className="field-hint">{hint}</div>
                </div>
              ))}
            </div>

            <div className="property-setup-divider">Monthly Defaults</div>
            <div className="property-setup-grid">
              <div className="field-group">
                <label className="field-label">Default Monthly CapEx</label>
                <div className="input-with-adornment">
                  <span className="field-adornment">$</span>
                  <CurrencyInput className="field-input" value={adv.monthlyCapExDefault} onChange={(v) => patchAdv('monthlyCapExDefault', v)} />
                </div>
              </div>
              <div className="field-group">
                <label className="field-label">Default Replacement Reserve</label>
                <div className="input-with-adornment">
                  <span className="field-adornment">$</span>
                  <CurrencyInput className="field-input" value={adv.monthlyReserveDefault} onChange={(v) => patchAdv('monthlyReserveDefault', v)} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Actions ── */}
        <div style={{ display: 'flex', gap: 12, marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--color-slate-200)' }}>
          {onCancel && (
            <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          )}
          <button
            type="button"
            className="btn btn-primary"
            disabled={saving}
            onClick={handleSave}
          >
            {saving
              ? 'Saving…'
              : existingProperty
              ? 'Save Changes'
              : 'Save & Continue →'}
          </button>
        </div>
      </div>
    </div>
  )
}
