import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../db/client.js'
import { requireFirm } from '../middleware/requireFirm.js'
import { requireRole } from '../middleware/requireRole.js'
import { CreateDealSchema, UpdateDealSchema } from '@equityform/shared'

type DealParams = { dealId: string }

export const dealsRouter: FastifyPluginAsync = async (fastify) => {
  // All deal routes require firm context
  fastify.addHook('preHandler', requireFirm)

  // GET /api/v1/deals
  fastify.get('/', async (req: FastifyRequest, reply: FastifyReply) => {
    const deals = await prisma.deal.findMany({
      where: { firmId: req.firmId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: {
        // Include full payloads so the frontend can render deal views instantly
        // from the list cache without a separate per-deal fetch.
        offering:            true,
        banking:             true,
        spvFormation:        true,
        operatingAgreement:  true,
        investors:     { where: { deletedAt: null } },
        subscriptions: true,
        blueSkyFilings: true,
      },
    })
    return reply.send(deals)
  })

  // POST /api/v1/deals
  fastify.post('/', { preHandler: requireRole('GP', 'ADMIN') }, async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = CreateDealSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', issues: parsed.error.issues })
    }
    const deal = await prisma.deal.create({
      data: { ...parsed.data, firmId: req.firmId },
    })
    return reply.status(201).send(deal)
  })

  // GET /api/v1/deals/:dealId
  fastify.get<{ Params: DealParams }>('/:dealId', async (req, reply) => {
    const deal = await prisma.deal.findFirst({
      where: { id: req.params.dealId, firmId: req.firmId, deletedAt: null },
      include: {
        offering: true,
        banking: true,
        spvFormation: true,
        operatingAgreement: true,
        investors: { where: { deletedAt: null } },
        subscriptions: true,
        blueSkyFilings: true,
        economics: true,
        documents: true,
      },
    })
    if (!deal) return reply.status(404).send({ error: 'Deal not found' })
    return reply.send(deal)
  })

  // PATCH /api/v1/deals/:dealId
  fastify.patch<{ Params: DealParams }>(
    '/:dealId',
    { preHandler: requireRole('GP', 'ADMIN') },
    async (req, reply) => {
      const parsed = UpdateDealSchema.safeParse(req.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Validation failed', issues: parsed.error.issues })
      }
      const deal = await prisma.deal.updateMany({
        where: { id: req.params.dealId, firmId: req.firmId, deletedAt: null },
        data: parsed.data,
      })
      if (deal.count === 0) return reply.status(404).send({ error: 'Deal not found' })
      return reply.send({ ok: true })
    }
  )

  // DELETE /api/v1/deals/:dealId (soft delete)
  fastify.delete<{ Params: DealParams }>(
    '/:dealId',
    { preHandler: requireRole('GP', 'ADMIN') },
    async (req, reply) => {
      const deal = await prisma.deal.updateMany({
        where: { id: req.params.dealId, firmId: req.firmId, deletedAt: null },
        data: { deletedAt: new Date() },
      })
      if (deal.count === 0) return reply.status(404).send({ error: 'Deal not found' })
      return reply.send({ ok: true })
    }
  )

  // PUT /api/v1/deals/:dealId/offering
  fastify.put<{ Params: DealParams }>(
    '/:dealId/offering',
    { preHandler: requireRole('GP', 'ADMIN') },
    async (req, reply) => {
      // Extract the nested payload (body is { payload: {...} })
      const { payload } = req.body as { payload: Record<string, unknown> }

      // Verify deal belongs to this firm before mutating
      const ownedDeal = await prisma.deal.findFirst({
        where: { id: req.params.dealId, firmId: req.firmId, deletedAt: null },
        select: { id: true },
      })
      if (!ownedDeal) return reply.status(404).send({ error: 'Deal not found' })

      // Shallow-merge with existing so concurrent deal+offering saves don't clobber each other.
      // useDealSave writes { deal: {...} } and useOfferingSave writes { offeringExemption, ... }
      // at the top level — a shallow merge keeps both keys intact regardless of write order.
      const existing = await prisma.dealOffering.findUnique({
        where: { dealId: req.params.dealId },
        select: { payload: true },
      })
      const merged = { ...(existing?.payload as Record<string, unknown> ?? {}), ...payload }
      const result = await prisma.dealOffering.upsert({
        where: { dealId: req.params.dealId },
        update: { payload: merged },
        create: { dealId: req.params.dealId, payload: merged },
      })
      return reply.send(result)
    }
  )

  // PUT /api/v1/deals/:dealId/banking
  fastify.put<{ Params: DealParams }>(
    '/:dealId/banking',
    { preHandler: requireRole('GP', 'ADMIN') },
    async (req, reply) => {
      const payload = req.body as Record<string, unknown>

      // Verify deal belongs to this firm before mutating
      const ownedDeal = await prisma.deal.findFirst({
        where: { id: req.params.dealId, firmId: req.firmId, deletedAt: null },
        select: { id: true },
      })
      if (!ownedDeal) return reply.status(404).send({ error: 'Deal not found' })

      const result = await prisma.dealBanking.upsert({
        where: { dealId: req.params.dealId },
        update: { payload },
        create: { dealId: req.params.dealId, payload },
      })
      return reply.send(result)
    }
  )
}
