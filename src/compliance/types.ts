export type ComplianceEntityType = 'llc' | 'corp' | 'foreign_corp'

export type ReminderDay = 30 | 7 | 0

export type NotificationChannel = 'email' | 'sms'

export type DeliveryStatus = 'sent' | 'failed' | 'skipped'

export type ComplianceEntity = {
  id: string
  userId: string
  name: string
  type: ComplianceEntityType
  email: string
  phone: string | null
  fileNumber: string | null
  nextDueDate: string
  paidForCurrentCycle: boolean
  createdAt: string
  updatedAt: string
}

export type NotificationLogEntry = {
  id: string
  entityId: string
  channel: NotificationChannel
  daysBefore: ReminderDay
  cycleYear: number
  sentAt: string
  deliveryStatus: DeliveryStatus
}

export type ComplianceTemplatePayload = {
  firstName: string
  entityName: string
  entityTypeLabel: string
  fileNumber: string | null
  amount: string
  dueDate: string
  dueDateShort: string
  paymentLink: string
  markPaidLink: string
}

export type ComplianceEntityInput = {
  name: string
  type: ComplianceEntityType
  email: string
  phone?: string
  fileNumber?: string
}
