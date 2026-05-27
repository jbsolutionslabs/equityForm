import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../db/client.js'
import { requireFirm } from '../middleware/requireFirm.js'

export const firmsRouter: FastifyPluginAsync = async (fastify) => {
  // POST /api/v1/firms — create or get firm for authenticated user
  fastify.post('/', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.auth) return reply.status(401).send({ error: 'Unauthorized' })

    const body = req.body as { name?: string }
    const name = body?.name ?? 'My Firm'

    // Check if user already has a firm
    const existing = await prisma.userFirmMembership.findFirst({
      where: { userId: req.auth.userId },
      include: { firm: true },
    })

    if (existing) {
      return reply.send(existing.firm)
    }

    // Create new firm + membership
    const firm = await prisma.firm.create({
      data: {
        name,
        memberships: {
          create: { userId: req.auth.userId, role: 'GP' },
        },
      },
    })

    return reply.status(201).send(firm)
  })

  // GET /api/v1/firms/me — get current user's firm
  fastify.get('/me', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.auth) return reply.status(401).send({ error: 'Unauthorized' })

    const membership = await prisma.userFirmMembership.findFirst({
      where: { userId: req.auth.userId },
      include: { firm: true },
    })

    if (!membership) {
      return reply.status(404).send({ error: 'No firm found. POST /api/v1/firms to create one.' })
    }

    return reply.send({ firm: membership.firm, role: membership.role })
  })
}
