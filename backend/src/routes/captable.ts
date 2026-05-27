import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../db/client.js'
import { requireFirm } from '../middleware/requireFirm.js'
import { requireRole } from '../middleware/requireRole.js'

type DealParams = { dealId: string }

export const capTableRouter: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', requireFirm)

  // POST /api/v1/deals/:dealId/captable/lock
  fastify.post<{ Params: DealParams }>(
    '/:dealId/captable/lock',
    { preHandler: requireRole('GP', 'ADMIN') },
    async (req, reply) => {
      const result = await prisma.deal.updateMany({
        where: { id: req.params.dealId, firmId: req.firmId, deletedAt: null },
        data: { capTableLockedAt: new Date() },
      })
      if (result.count === 0) return reply.status(404).send({ error: 'Deal not found' })
      return reply.send({ locked: true, lockedAt: new Date().toISOString() })
    }
  )

  // DELETE /api/v1/deals/:dealId/captable/lock
  fastify.delete<{ Params: DealParams }>(
    '/:dealId/captable/lock',
    { preHandler: requireRole('GP', 'ADMIN') },
    async (req, reply) => {
      const result = await prisma.deal.updateMany({
        where: { id: req.params.dealId, firmId: req.firmId, deletedAt: null },
        data: { capTableLockedAt: null },
      })
      if (result.count === 0) return reply.status(404).send({ error: 'Deal not found' })
      return reply.send({ locked: false })
    }
  )
}
