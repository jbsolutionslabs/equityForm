import create from 'zustand'
import { devtools } from 'zustand/middleware'
import { REMINDER_DAYS } from '../compliance/config'
import { emailBody, emailSubject, smsBody } from '../compliance/templates'
import type {
  ComplianceEntity,
  ComplianceEntityInput,
  DeliveryStatus,
  NotificationChannel,
  NotificationLogEntry,
  ReminderDay,
} from '../compliance/types'
import {
  buildEntityFromInput,
  daysUntilDue,
  isReminderDay,
  normalizeOptional,
  parseDateOnly,
  rolloverDueDate,
} from '../compliance/utils'

const STORAGE_KEY = 'equityform:compliance'

type OutboundMessage = {
  entityId: string
  channel: NotificationChannel
  daysBefore: ReminderDay
  subject?: string
  body: string
}

type ComplianceState = {
  entities: ComplianceEntity[]
  notificationLog: NotificationLogEntry[]
  outboundQueue: OutboundMessage[]

  addEntity: (input: ComplianceEntityInput, userId?: string) => void
  updateEntity: (id: string, patch: Partial<ComplianceEntityInput>) => void
  deleteEntity: (id: string) => void
  markPaid: (id: string) => void
  runDailyCron: (runDate?: Date) => void
  clearOutboundQueue: () => void
}

function load(): Pick<ComplianceState, 'entities' | 'notificationLog' | 'outboundQueue'> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch (_) {}
  return { entities: [], notificationLog: [], outboundQueue: [] }
}

function save(state: Pick<ComplianceState, 'entities' | 'notificationLog' | 'outboundQueue'>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch (_) {}
}

function cycleYear(nextDueDate: string): number {
  return parseDateOnly(nextDueDate).getFullYear()
}

function uniqueLogKey(entityId: string, channel: NotificationChannel, daysBefore: ReminderDay, year: number): string {
  return `${entityId}:${channel}:${daysBefore}:${year}`
}

function buildLogSet(logs: NotificationLogEntry[]): Set<string> {
  return new Set(logs.map((l) => uniqueLogKey(l.entityId, l.channel, l.daysBefore, l.cycleYear)))
}

export const useComplianceStore = create<ComplianceState>()(
  devtools((set, get) => ({
    ...load(),

    addEntity: (input, userId = 'local-user') => {
      const entity = buildEntityFromInput(input, userId)
      set((s) => ({ entities: [...s.entities, entity] }), false, 'compliance/addEntity')
      save(get())
    },

    updateEntity: (id, patch) => {
      set((s) => ({
        entities: s.entities.map((e) => {
          if (e.id !== id) return e
          const next: ComplianceEntity = {
            ...e,
            name: patch.name !== undefined ? patch.name.trim() : e.name,
            type: patch.type ?? e.type,
            email: patch.email !== undefined ? patch.email.trim() : e.email,
            phone: patch.phone !== undefined ? normalizeOptional(patch.phone) : e.phone,
            fileNumber: patch.fileNumber !== undefined ? normalizeOptional(patch.fileNumber) : e.fileNumber,
            updatedAt: new Date().toISOString(),
          }
          return next
        }),
      }), false, 'compliance/updateEntity')
      save(get())
    },

    deleteEntity: (id) => {
      set((s) => ({
        entities: s.entities.filter((e) => e.id !== id),
        notificationLog: s.notificationLog.filter((l) => l.entityId !== id),
      }), false, 'compliance/deleteEntity')
      save(get())
    },

    markPaid: (id) => {
      set((s) => ({
        entities: s.entities.map((e) => e.id === id ? { ...e, paidForCurrentCycle: true, updatedAt: new Date().toISOString() } : e),
      }), false, 'compliance/markPaid')
      save(get())
    },

    runDailyCron: (runDate = new Date()) => {
      const state = get()
      const logSet = buildLogSet(state.notificationLog)
      const newLogs: NotificationLogEntry[] = []
      const outboundQueue: OutboundMessage[] = []

      const rolledEntities = state.entities.map((entity) => {
        let nextEntity = { ...entity }
        const dueDelta = daysUntilDue(entity.nextDueDate, runDate)

        if (!entity.paidForCurrentCycle && isReminderDay(dueDelta)) {
          const year = cycleYear(entity.nextDueDate)
          const channels: NotificationChannel[] = entity.phone ? ['email', 'sms'] : ['email']
          channels.forEach((channel) => {
            const key = uniqueLogKey(entity.id, channel, dueDelta, year)
            if (logSet.has(key)) return
            logSet.add(key)
            newLogs.push({
              id: crypto.randomUUID(),
              entityId: entity.id,
              channel,
              daysBefore: dueDelta,
              cycleYear: year,
              sentAt: new Date().toISOString(),
              deliveryStatus: 'sent' as DeliveryStatus,
            })
            outboundQueue.push({
              entityId: entity.id,
              channel,
              daysBefore: dueDelta,
              subject: channel === 'email' ? emailSubject(entity, dueDelta) : undefined,
              body: channel === 'email' ? emailBody(entity, dueDelta) : smsBody(entity, dueDelta),
            })
          })
        }

        const pastDue = daysUntilDue(entity.nextDueDate, runDate) < 0
        if (pastDue || entity.paidForCurrentCycle) {
          nextEntity = {
            ...nextEntity,
            nextDueDate: rolloverDueDate(entity.nextDueDate),
            paidForCurrentCycle: false,
            updatedAt: new Date().toISOString(),
          }
        }
        return nextEntity
      })

      set((s) => ({
        entities: rolledEntities,
        notificationLog: [...s.notificationLog, ...newLogs],
        outboundQueue: [...s.outboundQueue, ...outboundQueue],
      }), false, 'compliance/runDailyCron')
      save(get())
    },

    clearOutboundQueue: () => {
      set({ outboundQueue: [] }, false, 'compliance/clearOutboundQueue')
      save(get())
    },
  })),
)

useComplianceStore.subscribe((s) => save({
  entities: s.entities,
  notificationLog: s.notificationLog,
  outboundQueue: s.outboundQueue,
}))

export function complianceStatus(entity: ComplianceEntity): 'paid' | 'due_soon' | 'upcoming' {
  if (entity.paidForCurrentCycle) return 'paid'
  const d = daysUntilDue(entity.nextDueDate)
  if (d <= 7) return 'due_soon'
  return 'upcoming'
}

export { REMINDER_DAYS }
