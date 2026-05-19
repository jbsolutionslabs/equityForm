import { COMPLIANCE_RULES } from './config'
import type {
  ComplianceEntity,
  ComplianceEntityInput,
  ComplianceEntityType,
  ComplianceTemplatePayload,
  ReminderDay,
} from './types'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function toDateOnly(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function parseDateOnly(value: string): Date {
  const [y, m, d] = value.split('-').map((v) => parseInt(v, 10))
  return new Date(y, (m || 1) - 1, d || 1)
}

export function addDays(value: string, days: number): string {
  const d = parseDateOnly(value)
  d.setDate(d.getDate() + days)
  return toDateOnly(d)
}

export function formatLongDate(value: string): string {
  return parseDateOnly(value).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

export function formatShortDate(value: string): string {
  return parseDateOnly(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function daysUntilDue(nextDueDate: string, today = new Date()): number {
  const target = parseDateOnly(nextDueDate)
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const diffMs = target.getTime() - start.getTime()
  return Math.round(diffMs / (1000 * 60 * 60 * 24))
}

export function computeNextDueDate(type: ComplianceEntityType, now = new Date()): string {
  const rule = COMPLIANCE_RULES[type]
  const year = now.getFullYear()
  const candidate = new Date(year, rule.deadlineMonth - 1, rule.deadlineDay)
  if (candidate >= new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
    return toDateOnly(candidate)
  }
  return toDateOnly(new Date(year + 1, rule.deadlineMonth - 1, rule.deadlineDay))
}

export function rolloverDueDate(nextDueDate: string): string {
  const d = parseDateOnly(nextDueDate)
  return toDateOnly(new Date(d.getFullYear() + 1, d.getMonth(), d.getDate()))
}

export function deriveFirstName(email: string): string {
  const base = email.split('@')[0] || 'there'
  const token = base.split(/[._-]/)[0] || 'there'
  return token.charAt(0).toUpperCase() + token.slice(1)
}

export function normalizeOptional(value?: string): string | null {
  const trimmed = (value || '').trim()
  return trimmed.length ? trimmed : null
}

export function buildEntityFromInput(input: ComplianceEntityInput, userId: string): ComplianceEntity {
  const nowIso = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    userId,
    name: input.name.trim(),
    type: input.type,
    email: input.email.trim(),
    phone: normalizeOptional(input.phone),
    fileNumber: normalizeOptional(input.fileNumber),
    nextDueDate: computeNextDueDate(input.type),
    paidForCurrentCycle: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  }
}

export function buildTemplatePayload(entity: ComplianceEntity): ComplianceTemplatePayload {
  const rule = COMPLIANCE_RULES[entity.type]
  return {
    firstName: deriveFirstName(entity.email),
    entityName: entity.name,
    entityTypeLabel: rule.entityTypeLabel,
    fileNumber: entity.fileNumber,
    amount: rule.amountLabel,
    dueDate: formatLongDate(entity.nextDueDate),
    dueDateShort: formatShortDate(entity.nextDueDate),
    paymentLink: rule.paymentLink,
    markPaidLink: `/compliance?entityId=${entity.id}`,
  }
}

export function isReminderDay(daysBefore: number): daysBefore is ReminderDay {
  return daysBefore === 30 || daysBefore === 7 || daysBefore === 0
}
