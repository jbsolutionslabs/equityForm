import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../db/client.js'
import { requireFirm } from '../middleware/requireFirm.js'
import { requireRole } from '../middleware/requireRole.js'
import { UpdateEconomicsSchema } from '@equityform/shared'

type DealParams = { dealId: string }

export const economicsRouter: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', requireFirm)

  // GET /api/v1/deals/:dealId/economics
  fastify.get<{ Params: DealParams }>('/:dealId/economics', async (req, reply) => {
    const eco = await prisma.economicsDeal.findFirst({
      where: { dealId: req.params.dealId, firmId: req.firmId },
      include: { auditEntries: { orderBy: { createdAt: 'desc' }, take: 20 } },
    })
    if (!eco) return reply.status(404).send({ error: 'Economics not found' })
    return reply.send(eco)
  })

  // PUT /api/v1/deals/:dealId/economics
  fastify.put<{ Params: DealParams }>(
    '/:dealId/economics',
    { preHandler: requireRole('GP', 'ADMIN') },
    async (req, reply) => {
      const parsed = UpdateEconomicsSchema.safeParse(req.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Validation failed', issues: parsed.error.issues })
      }
      // Verify deal belongs to this firm before mutating
      const deal = await prisma.deal.findFirst({
        where: { id: req.params.dealId, firmId: req.firmId, deletedAt: null },
        select: { id: true },
      })
      if (!deal) return reply.status(404).send({ error: 'Deal not found' })

      const result = await prisma.economicsDeal.upsert({
        where: { dealId: req.params.dealId },
        update: parsed.data,
        create: {
          dealId: req.params.dealId,
          firmId: req.firmId,
          capitalStack: (parsed.data.capitalStack as object) ?? {},
          profitSplit: (parsed.data.profitSplit as object) ?? {},
          fees: (parsed.data.fees as object) ?? {},
          ...parsed.data,
        },
      })
      return reply.send(result)
    }
  )

  // POST /api/v1/deals/:dealId/economics/lock
  fastify.post<{ Params: DealParams }>(
    '/:dealId/economics/lock',
    { preHandler: requireRole('GP', 'ADMIN') },
    async (req, reply) => {
      if (!req.auth) return reply.status(401).send({ error: 'Unauthorized' })

      const eco = await prisma.economicsDeal.findFirst({
        where: { dealId: req.params.dealId, firmId: req.firmId },
      })
      if (!eco) return reply.status(404).send({ error: 'Economics not found' })

      const updated = await prisma.economicsDeal.update({
        where: { id: eco.id },
        data: { lockedAt: new Date(), lockedBy: req.auth.userId },
      })

      // Write audit entry
      await prisma.economicsAuditEntry.create({
        data: {
          economicsDealId: eco.id,
          userId: req.auth.userId,
          action: 'LOCKED',
          snapshot: {
            capitalStack: eco.capitalStack,
            profitSplit: eco.profitSplit,
            fees: eco.fees,
          },
        },
      })

      return reply.send(updated)
    }
  )

  // DELETE /api/v1/deals/:dealId/economics/lock
  fastify.delete<{ Params: DealParams }>(
    '/:dealId/economics/lock',
    { preHandler: requireRole('GP', 'ADMIN') },
    async (req, reply) => {
      if (!req.auth) return reply.status(401).send({ error: 'Unauthorized' })

      const eco = await prisma.economicsDeal.findFirst({
        where: { dealId: req.params.dealId, firmId: req.firmId },
      })
      if (!eco) return reply.status(404).send({ error: 'Economics not found' })

      const updated = await prisma.economicsDeal.update({
        where: { id: eco.id },
        data: { lockedAt: null, lockedBy: null },
      })

      await prisma.economicsAuditEntry.create({
        data: {
          economicsDealId: eco.id,
          userId: req.auth.userId,
          action: 'UNLOCKED',
          snapshot: { unlockedAt: new Date().toISOString() },
        },
      })

      return reply.send(updated)
    }
  )
}
