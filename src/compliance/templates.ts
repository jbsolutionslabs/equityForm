import { COMPLIANCE_RULES } from './config'
import type { ComplianceEntity, ReminderDay } from './types'
import { buildTemplatePayload } from './utils'

export function emailSubject(entity: ComplianceEntity, daysBefore: ReminderDay): string {
  if (daysBefore === 30) return `Reminder: ${entity.name} DE franchise tax due in 30 days`
  if (daysBefore === 7) return `Action needed: ${entity.name} DE franchise tax due in 7 days`
  return `Due today: ${entity.name} DE franchise tax`
}

export function emailBody(entity: ComplianceEntity, daysBefore: ReminderDay): string {
  const p = buildTemplatePayload(entity)
  const urgency = daysBefore === 30 ? '30 days from now' : daysBefore === 7 ? '7 days from now' : 'today'
  const dueLine = daysBefore === 0
    ? 'Payment must clear today to avoid penalties.'
    : ''
  const fileSegment = p.fileNumber ? ` (File #${p.fileNumber})` : ''
  const rule = COMPLIANCE_RULES[entity.type]
  return `Hi ${p.firstName},\n\nYour Delaware ${p.entityTypeLabel} **${p.entityName}**${fileSegment} has a franchise tax payment of **${p.amount}** due on **${p.dueDate}** (${urgency}).\n\nPay directly on the Delaware Division of Corporations portal: ${p.paymentLink}\n\nMissing the deadline triggers ${rule.latePenalty} and can put your entity in bad standing.\n${dueLine}\n\nAlready paid? Mark this entity as paid in EquityForm: ${p.markPaidLink}\n\n— EquityForm`
}

export function smsBody(entity: ComplianceEntity, daysBefore: ReminderDay): string {
  const p = buildTemplatePayload(entity)
  if (daysBefore === 30) {
    return `EquityForm: ${p.entityName} DE franchise tax (${p.amount}) due ${p.dueDateShort}. Pay: ${p.paymentLink} · Mark paid: ${p.markPaidLink}`
  }
  if (daysBefore === 7) {
    return `EquityForm: ${p.entityName} DE franchise tax (${p.amount}) due in 7 days (${p.dueDateShort}). Pay: ${p.paymentLink}`
  }
  return `EquityForm: ${p.entityName} DE franchise tax (${p.amount}) due TODAY. Penalty if late. Pay: ${p.paymentLink}`
}
