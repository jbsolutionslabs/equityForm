import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../db/client.js'
import { requireFirm } from '../middleware/requireFirm.js'
import { requireRole } from '../middleware/requireRole.js'
import { InvestorSchema, UpdateInvestorSchema } from '@equityform/shared'

type DealInvestorParams = { dealId: string; id: string }

export const investorsRouter: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', requireFirm)

  // GET /api/v1/deals/:dealId/investors
  fastify.get<{ Params: { dealId: string } }>(
    '/:dealId/investors',
    async (req, reply) => {
      const investors = await prisma.investor.findMany({
        where: { dealId: req.params.dealId, firmId: req.firmId, deletedAt: null },
        orderBy: { createdAt: 'asc' },
      })
      return reply.send(investors)
    }
  )

  // POST /api/v1/deals/:dealId/investors
  fastify.post<{ Params: { dealId: string } }>(
    '/:dealId/investors',
    { preHandler: requireRole('GP', 'ADMIN') },
    async (req, reply) => {
      const parsed = InvestorSchema.safeParse(req.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Validation failed', issues: parsed.error.issues })
      }
      const investor = await prisma.investor.create({
        data: {
          ...parsed.data,
          dealId: req.params.dealId,
          firmId: req.firmId,
        },
      })
      return reply.status(201).send(investor)
    }
  )

  // PATCH /api/v1/deals/:dealId/investors/:id
  fastify.patch<{ Params: DealInvestorParams }>(
    '/:dealId/investors/:id',
    { preHandler: requireRole('GP', 'ADMIN') },
    async (req, reply) => {
      const parsed = UpdateInvestorSchema.safeParse(req.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Validation failed', issues: parsed.error.issues })
      }
      const result = await prisma.investor.updateMany({
        where: { id: req.params.id, dealId: req.params.dealId, firmId: req.firmId, deletedAt: null },
        data: parsed.data,
      })
      if (result.count === 0) return reply.status(404).send({ error: 'Investor not found' })
      return reply.send({ ok: true })
    }
  )

  // DELETE /api/v1/deals/:dealId/investors/:id (soft delete)
  fastify.delete<{ Params: DealInvestorParams }>(
    '/:dealId/investors/:id',
    { preHandler: requireRole('GP', 'ADMIN') },
    async (req, reply) => {
      const result = await prisma.investor.updateMany({
        where: { id: req.params.id, dealId: req.params.dealId, firmId: req.firmId, deletedAt: null },
        data: { deletedAt: new Date() },
      })
      if (result.count === 0) return reply.status(404).send({ error: 'Investor not found' })
      return reply.send({ ok: true })
    }
  )
}
