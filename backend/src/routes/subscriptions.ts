import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../db/client.js'
import { requireFirm } from '../middleware/requireFirm.js'
import { requireRole } from '../middleware/requireRole.js'
import { CreateSubscriptionSchema, UpdateSubscriptionSchema } from '@equityform/shared'

type SubParams = { dealId: string; id: string }

export const subscriptionsRouter: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', requireFirm)

  // GET /api/v1/deals/:dealId/subscriptions
  fastify.get<{ Params: { dealId: string } }>(
    '/:dealId/subscriptions',
    async (req, reply) => {
      const subs = await prisma.subscription.findMany({
        where: { dealId: req.params.dealId, firmId: req.firmId },
        include: { investor: { select: { name: true, email: true } } },
        orderBy: { createdAt: 'asc' },
      })
      return reply.send(subs)
    }
  )

  // POST /api/v1/deals/:dealId/subscriptions
  fastify.post<{ Params: { dealId: string } }>(
    '/:dealId/subscriptions',
    { preHandler: requireRole('GP', 'ADMIN') },
    async (req, reply) => {
      const parsed = CreateSubscriptionSchema.safeParse(req.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Validation failed', issues: parsed.error.issues })
      }
      const sub = await prisma.subscription.create({
        data: {
          dealId: req.params.dealId,
          firmId: req.firmId,
          investorId: parsed.data.investorId,
          amount: parsed.data.amount,
          payload: parsed.data.payload ?? {},
        },
      })
      return reply.status(201).send(sub)
    }
  )

  // PATCH /api/v1/deals/:dealId/subscriptions/:id
  fastify.patch<{ Params: SubParams }>(
    '/:dealId/subscriptions/:id',
    { preHandler: requireRole('GP', 'ADMIN') },
    async (req, reply) => {
      const parsed = UpdateSubscriptionSchema.safeParse(req.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Validation failed', issues: parsed.error.issues })
      }
      const { signedAt, paidAt, ...rest } = parsed.data
      const result = await prisma.subscription.updateMany({
        where: { id: req.params.id, dealId: req.params.dealId, firmId: req.firmId },
        data: {
          ...rest,
          ...(signedAt ? { signedAt: new Date(signedAt) } : {}),
          ...(paidAt ? { paidAt: new Date(paidAt) } : {}),
        },
      })
      if (result.count === 0) return reply.status(404).send({ error: 'Subscription not found' })
      return reply.send({ ok: true })
    }
  )
}
