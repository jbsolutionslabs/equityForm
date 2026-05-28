import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../db/client.js'
import { requireFirm } from '../middleware/requireFirm.js'
import { requireRole } from '../middleware/requireRole.js'
import {
  CreatePropertySchema,
  UpdatePropertySchema,
  UpsertMonthlyEntrySchema,
} from '@equityform/shared'

type PropParams = { id: string }
type EntryParams = { id: string; entryId: string }

export const accountingRouter: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', requireFirm)

  // GET /api/v1/accounting/properties
  fastify.get('/', async (req: FastifyRequest, reply: FastifyReply) => {
    const dealId = (req.query as Record<string, string>)['dealId']
    const properties = await prisma.accountingProperty.findMany({
      where: {
        firmId: req.firmId,
        deletedAt: null,
        ...(dealId ? { dealId } : {}),
      },
      orderBy: { createdAt: 'asc' },
    })
    return reply.send(properties)
  })

  // POST /api/v1/accounting/properties
  fastify.post(
    '/',
    { preHandler: requireRole('GP', 'ADMIN') },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const parsed = CreatePropertySchema.safeParse(req.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Validation failed', issues: parsed.error.issues })
      }
      const property = await prisma.accountingProperty.create({
        data: { ...parsed.data, firmId: req.firmId },
      })
      return reply.status(201).send(property)
    }
  )

  // PATCH /api/v1/accounting/properties/:id
  fastify.patch<{ Params: PropParams }>(
    '/:id',
    { preHandler: requireRole('GP', 'ADMIN') },
    async (req, reply) => {
      const parsed = UpdatePropertySchema.safeParse(req.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Validation failed', issues: parsed.error.issues })
      }
      const result = await prisma.accountingProperty.updateMany({
        where: { id: req.params.id, firmId: req.firmId, deletedAt: null },
        data: parsed.data,
      })
      if (result.count === 0) return reply.status(404).send({ error: 'Property not found' })
      return reply.send({ ok: true })
    }
  )

  // GET /api/v1/accounting/properties/:id/entries
  fastify.get<{ Params: PropParams }>('/:id/entries', async (req, reply) => {
    const entries = await prisma.monthlyEntry.findMany({
      where: { propertyId: req.params.id, firmId: req.firmId },
      orderBy: { period: 'desc' },
    })
    return reply.send(entries)
  })

  // POST /api/v1/accounting/properties/:id/entries (upsert by period)
  fastify.post<{ Params: PropParams }>(
    '/:id/entries',
    { preHandler: requireRole('GP', 'ADMIN') },
    async (req, reply) => {
      const parsed = UpsertMonthlyEntrySchema.safeParse(req.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Validation failed', issues: parsed.error.issues })
      }
      // Verify property belongs to this firm before upserting entries
      const property = await prisma.accountingProperty.findFirst({
        where: { id: req.params.id, firmId: req.firmId, deletedAt: null },
        select: { id: true },
      })
      if (!property) return reply.status(404).send({ error: 'Property not found' })

      const entry = await prisma.monthlyEntry.upsert({
        where: { propertyId_period: { propertyId: req.params.id, period: parsed.data.period } },
        update: {
          pnl: parsed.data.pnl,
          belowLine: parsed.data.belowLine,
          workingCapital: parsed.data.workingCapital,
          distributions: parsed.data.distributions,
        },
        create: {
          propertyId: req.params.id,
          firmId: req.firmId,
          period: parsed.data.period,
          pnl: parsed.data.pnl,
          belowLine: parsed.data.belowLine,
          workingCapital: parsed.data.workingCapital,
          distributions: parsed.data.distributions,
        },
      })
      return reply.status(201).send(entry)
    }
  )

  // PATCH /api/v1/accounting/properties/:id/entries/:entryId
  fastify.patch<{ Params: EntryParams }>(
    '/:id/entries/:entryId',
    { preHandler: requireRole('GP', 'ADMIN') },
    async (req, reply) => {
      const parsed = UpsertMonthlyEntrySchema.partial().safeParse(req.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Validation failed', issues: parsed.error.issues })
      }
      const result = await prisma.monthlyEntry.updateMany({
        where: { id: req.params.entryId, propertyId: req.params.id, firmId: req.firmId },
        data: parsed.data,
      })
      if (result.count === 0) return reply.status(404).send({ error: 'Entry not found' })
      return reply.send({ ok: true })
    }
  )
}
