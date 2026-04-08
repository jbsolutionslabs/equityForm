import type {
  AccountingProperty,
  MonthlyEntry,
  MultifamilyPnL,
} from '../../../state/accountingTypes'
import type { ImportedFieldResult } from '../../../server/types/importTypes'

export type EntryDraft = Omit<MonthlyEntry, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }

export const applyImportedValues = (
  entry: EntryDraft,
  property: AccountingProperty,
  results: ImportedFieldResult[],
): EntryDraft => {
  const next: EntryDraft = {
    ...entry,
    pnl: { ...entry.pnl },
    belowLine: { ...entry.belowLine },
    workingCapital: { ...entry.workingCapital },
    distributions: { ...entry.distributions },
  }

  const mfPnlDraft = next.pnl as MultifamilyPnL
  const belowLineDraft = next.belowLine as Record<string, number | boolean>
  const wcDraft = next.workingCapital as Record<string, number>
  const distDraft = next.distributions as Record<string, number | boolean | string>

  results.forEach((field) => {
    if (field.value === null || field.value === undefined) return

    switch (field.fieldKey) {
      case 'grossPotentialRent':
      case 'vacancyLoss':
      case 'concessions':
      case 'badDebt':
      case 'utilityReimbursements':
      case 'otherIncome':
      case 'propertyManagementFee':
      case 'payrollBenefits':
      case 'repairsMaintenance':
      case 'makeReadyTurns':
      case 'landscaping':
      case 'utilitiesCommonArea':
      case 'insurance':
      case 'propertyTaxes':
      case 'marketingAdvertising':
      case 'administrativeGeneral':
      case 'contractServices':
      case 'totalRentableUnits':
      case 'occupiedUnits':
      case 'avgRent':
        if (property.assetClass === 'multifamily') {
          mfPnlDraft[field.fieldKey as keyof MultifamilyPnL] = Number(field.value)
        }
        break
      case 'depreciation':
      case 'amortizationFinancingCosts':
      case 'debtServiceInterest':
      case 'debtServicePrincipal':
      case 'capEx':
      case 'replacementReserve':
        belowLineDraft[field.fieldKey] = Number(field.value)
        if (field.fieldKey === 'depreciation') {
          wcDraft.depreciation = Number(field.value)
        }
        break
      case 'depreciationOverridden':
      case 'debtServiceOverridden':
      case 'capExOverridden':
        belowLineDraft[field.fieldKey] = Boolean(field.value)
        break
      case 'changeInAccountsReceivable':
      case 'changeInPrepaidExpenses':
      case 'changeInAccountsPayable':
      case 'changeInAccruedLiabilities':
      case 'changeInSecurityDeposits':
      case 'otherOperatingAdjustments':
      case 'proceedsFromSaleOfAssets':
      case 'otherInvestingActivities':
      case 'proceedsFromNewBorrowings':
      case 'capitalContributions':
      case 'otherFinancingActivities':
      case 'netIncome':
      case 'amortization':
      case 'deferredTax':
      case 'gainLossOnSale':
      case 'accountsReceivableChange':
      case 'inventoryChange':
      case 'prepaidExpensesChange':
      case 'accountsPayableChange':
      case 'accruedExpensesChange':
      case 'netCashFromOperations':
      case 'capitalExpenditures':
      case 'propertyPurchase':
      case 'propertySale':
      case 'investmentPurchase':
      case 'investmentSale':
      case 'netCashFromInvesting':
      case 'debtProceeds':
      case 'debtRepayment':
      case 'equityContributions':
      case 'dividendsDistributions':
      case 'netCashFromFinancing':
      case 'netChangeInCash':
      case 'cashBeginning':
      case 'cashEnding':
      case 'interestPaidDisclosure':
      case 'taxesPaidDisclosure':
      case 'nonCashInvestingFinancing':
        wcDraft[field.fieldKey] = Number(field.value)
        break
      case 'actualLPDistribution':
      case 'actualGPDistribution':
        distDraft[field.fieldKey] = Number(field.value)
        break
      case 'isOverridden':
        next.distributions.isOverridden = Boolean(field.value)
        break
      case 'overrideNote':
        next.distributions.overrideNote = String(field.value)
        break
      case 'notes':
        next.notes = String(field.value)
        break
      default:
        break
    }
  })

  return next
}