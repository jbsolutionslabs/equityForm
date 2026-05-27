import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../db/client.js'
import { requireFirm } from '../middleware/requireFirm.js'
import { requireRole } from '../middleware/requireRole.js'
import { UpsertBlueSkyFilingSchema } from '@equityform/shared'

type DealParams = { dealId: string }
type DealStateParams = { dealId: string; stateCode: string }

export const blueSkyRouter: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', requireFirm)

  // GET /api/v1/deals/:dealId/bluesky
  fastify.get<{ Params: DealParams }>('/:dealId/bluesky', async (req, reply) => {
    const filings = await prisma.blueSkyFiling.findMany({
      where: { dealId: req.params.dealId, deal: { firmId: req.firmId } },
      orderBy: { stateCode: 'asc' },
    })
    return reply.send(filings)
  })

  // PUT /api/v1/deals/:dealId/bluesky/:stateCode
  fastify.put<{ Params: DealStateParams }>(
    '/:dealId/bluesky/:stateCode',
    { preHandler: requireRole('GP', 'ADMIN') },
    async (req, reply) => {
      const parsed = UpsertBlueSkyFilingSchema.safeParse(req.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Validation failed', issues: parsed.error.issues })
      }
      const result = await prisma.blueSkyFiling.upsert({
        where: {
          dealId_stateCode: {
            dealId: req.params.dealId,
            stateCode: req.params.stateCode,
          },
        },
        update: { payload: parsed.data.payload },
        create: {
          dealId: req.params.dealId,
          stateCode: req.params.stateCode,
          payload: parsed.data.payload,
        },
      })
      return reply.send(result)
    }
  )
}
