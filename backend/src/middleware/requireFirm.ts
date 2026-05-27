import type { FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../db/client.js'

export async function requireFirm(
  req: FastifyRequest<{ Params: { firmId?: string } }>,
  reply: FastifyReply
) {
  if (!req.auth) {
    return reply.status(401).send({ error: 'Unauthorized' })
  }

  // firmId can come from header or query
  const firmId =
    (req.headers['x-firm-id'] as string) ||
    (req.query as Record<string, string>)['firmId']

  if (!firmId) {
    return reply.status(400).send({ error: 'X-Firm-Id header required' })
  }

  const membership = await prisma.userFirmMembership.findUnique({
    where: {
      userId_firmId: { userId: req.auth.userId, firmId },
    },
  })

  if (!membership) {
    return reply.status(403).send({ error: 'Not a member of this firm' })
  }

  req.firmId = firmId
  req.membership = { role: membership.role }
}
