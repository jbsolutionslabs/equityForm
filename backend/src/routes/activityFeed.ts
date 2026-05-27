import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../db/client.js'
import { requireFirm } from '../middleware/requireFirm.js'

type DealParams = { dealId: string }

export const activityFeedRouter: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', requireFirm)

  // GET /api/v1/deals/:dealId/activity
  fastify.get<{ Params: DealParams }>('/:dealId/activity', async (req, reply) => {
    const entries = await prisma.activityFeedEntry.findMany({
      where: { dealId: req.params.dealId, firmId: req.firmId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return reply.send(entries)
  })
}
