import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../db/client.js'
import { requireFirm } from '../middleware/requireFirm.js'
import { requireRole } from '../middleware/requireRole.js'
import { UpdateOaSchema } from '@equityform/shared'

type DealParams = { dealId: string }

export const oaRouter: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', requireFirm)

  // GET /api/v1/deals/:dealId/oa
  fastify.get<{ Params: DealParams }>('/:dealId/oa', async (req, reply) => {
    const oa = await prisma.operatingAgreement.findFirst({
      where: { dealId: req.params.dealId, deal: { firmId: req.firmId } },
    })
    if (!oa) return reply.status(404).send({ error: 'Operating agreement not found' })
    return reply.send(oa)
  })

  // PUT /api/v1/deals/:dealId/oa
  fastify.put<{ Params: DealParams }>(
    '/:dealId/oa',
    { preHandler: requireRole('GP', 'ADMIN') },
    async (req, reply) => {
      const parsed = UpdateOaSchema.safeParse(req.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Validation failed', issues: parsed.error.issues })
      }
      const data = parsed.data
      const result = await prisma.operatingAgreement.upsert({
        where: { dealId: req.params.dealId },
        update: {
          ...(data.status && { status: data.status }),
          ...(data.documentKey && { documentKey: data.documentKey }),
          ...(data.generatedAt && { generatedAt: new Date(data.generatedAt) }),
          ...(data.sentAt && { sentAt: new Date(data.sentAt) }),
          ...(data.signedAt && { signedAt: new Date(data.signedAt) }),
        },
        create: {
          dealId: req.params.dealId,
          status: data.status ?? 'NOT_GENERATED',
          documentKey: data.documentKey,
          generatedAt: data.generatedAt ? new Date(data.generatedAt) : undefined,
          sentAt: data.sentAt ? new Date(data.sentAt) : undefined,
          signedAt: data.signedAt ? new Date(data.signedAt) : undefined,
        },
      })
      return reply.send(result)
    }
  )
}
