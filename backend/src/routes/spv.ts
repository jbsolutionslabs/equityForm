import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../db/client.js'
import { requireFirm } from '../middleware/requireFirm.js'
import { requireRole } from '../middleware/requireRole.js'
import { UpdateSpvSchema } from '@equityform/shared'

type DealParams = { dealId: string }

export const spvRouter: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', requireFirm)

  // GET /api/v1/deals/:dealId/spv
  fastify.get<{ Params: DealParams }>('/:dealId/spv', async (req, reply) => {
    const spv = await prisma.spvFormation.findFirst({
      where: { dealId: req.params.dealId, deal: { firmId: req.firmId } },
    })
    if (!spv) return reply.status(404).send({ error: 'SPV not found' })
    return reply.send(spv)
  })

  // PUT /api/v1/deals/:dealId/spv
  fastify.put<{ Params: DealParams }>(
    '/:dealId/spv',
    { preHandler: requireRole('GP', 'ADMIN') },
    async (req, reply) => {
      const parsed = UpdateSpvSchema.safeParse(req.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Validation failed', issues: parsed.error.issues })
      }
      // Verify deal belongs to this firm before mutating
      const deal = await prisma.deal.findFirst({
        where: { id: req.params.dealId, firmId: req.firmId, deletedAt: null },
        select: { id: true },
      })
      if (!deal) return reply.status(404).send({ error: 'Deal not found' })

      const data = parsed.data
      const result = await prisma.spvFormation.upsert({
        where: { dealId: req.params.dealId },
        update: {
          ...(data.entityName !== undefined && { entityName: data.entityName.entityName }),
          ...(data.registeredAgent !== undefined && { registeredAgent: data.registeredAgent as object }),
          ...(data.certOfFormation !== undefined && { certOfFormation: data.certOfFormation as object }),
          ...(data.einObtained !== undefined && { einObtained: data.einObtained.complete }),
          ...(data.foreignQualification !== undefined && { foreignQualification: data.foreignQualification as object }),
        },
        create: {
          dealId: req.params.dealId,
          entityName: data.entityName?.entityName,
          registeredAgent: data.registeredAgent as object ?? null,
          certOfFormation: data.certOfFormation as object ?? null,
          einObtained: data.einObtained?.complete ?? false,
          foreignQualification: data.foreignQualification as object ?? null,
        },
      })
      return reply.send(result)
    }
  )
}
