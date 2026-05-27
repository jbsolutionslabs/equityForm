import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'
import { requireFirm } from '../middleware/requireFirm.js'
import { requireRole } from '../middleware/requireRole.js'
import { prisma } from '../db/client.js'

const DOCGEN_URL = process.env.DOCGEN_URL ?? 'http://localhost:8000'

type DealParams = { dealId: string }
type DocInvestorParams = { dealId: string; investorId: string }

async function proxyToDocgen(path: string, body?: unknown): Promise<Response> {
  return fetch(`${DOCGEN_URL}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
}

export const documentsRouter: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', requireFirm)

  // POST /api/v1/deals/:dealId/documents/oa/generate
  fastify.post<{ Params: DealParams }>(
    '/:dealId/documents/oa/generate',
    { preHandler: requireRole('GP', 'ADMIN') },
    async (req, reply) => {
      const deal = await prisma.deal.findFirst({
        where: { id: req.params.dealId, firmId: req.firmId, deletedAt: null },
        include: { offering: true, operatingAgreement: true },
      })
      if (!deal) return reply.status(404).send({ error: 'Deal not found' })

      // Proxy to Python doc-gen service
      const upstream = await proxyToDocgen('/generate/oa', {
        dealId: deal.id,
        offering: deal.offering?.payload ?? {},
      })

      if (!upstream.ok) {
        const err = await upstream.text()
        return reply.status(502).send({ error: 'Doc-gen service error', detail: err })
      }

      const result = await upstream.json() as { documentKey?: string }

      // Record document in DB
      await prisma.document.create({
        data: {
          dealId: req.params.dealId,
          firmId: req.firmId,
          type: 'oa',
          storageKey: result.documentKey ?? '',
        },
      })

      // Update OA status
      await prisma.operatingAgreement.upsert({
        where: { dealId: req.params.dealId },
        update: { status: 'GENERATED', generatedAt: new Date(), documentKey: result.documentKey },
        create: {
          dealId: req.params.dealId,
          status: 'GENERATED',
          generatedAt: new Date(),
          documentKey: result.documentKey,
        },
      })

      return reply.send(result)
    }
  )

  // GET /api/v1/deals/:dealId/documents/oa
  fastify.get<{ Params: DealParams }>('/:dealId/documents/oa', async (req, reply) => {
    const doc = await prisma.document.findFirst({
      where: { dealId: req.params.dealId, firmId: req.firmId, type: 'oa' },
      orderBy: { version: 'desc' },
    })
    if (!doc) return reply.status(404).send({ error: 'OA document not found' })
    return reply.send(doc)
  })

  // POST /api/v1/deals/:dealId/documents/subscriptions/:investorId/generate
  fastify.post<{ Params: DocInvestorParams }>(
    '/:dealId/documents/subscriptions/:investorId/generate',
    { preHandler: requireRole('GP', 'ADMIN') },
    async (req, reply) => {
      const investor = await prisma.investor.findFirst({
        where: {
          id: req.params.investorId,
          dealId: req.params.dealId,
          firmId: req.firmId,
          deletedAt: null,
        },
      })
      if (!investor) return reply.status(404).send({ error: 'Investor not found' })

      const upstream = await proxyToDocgen('/generate/subscription', {
        dealId: req.params.dealId,
        investorId: investor.id,
        investor: investor.payload,
      })

      if (!upstream.ok) {
        const err = await upstream.text()
        return reply.status(502).send({ error: 'Doc-gen service error', detail: err })
      }

      const result = await upstream.json() as { documentKey?: string }

      await prisma.document.create({
        data: {
          dealId: req.params.dealId,
          firmId: req.firmId,
          type: 'subscription',
          investorId: investor.id,
          storageKey: result.documentKey ?? '',
        },
      })

      return reply.send(result)
    }
  )

  // GET /api/v1/deals/:dealId/documents/subscriptions/:investorId
  fastify.get<{ Params: DocInvestorParams }>(
    '/:dealId/documents/subscriptions/:investorId',
    async (req, reply) => {
      const doc = await prisma.document.findFirst({
        where: {
          dealId: req.params.dealId,
          firmId: req.firmId,
          investorId: req.params.investorId,
          type: 'subscription',
        },
        orderBy: { version: 'desc' },
      })
      if (!doc) return reply.status(404).send({ error: 'Subscription document not found' })
      return reply.send(doc)
    }
  )
}
