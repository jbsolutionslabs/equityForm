import type { FastifyRequest, FastifyReply } from 'fastify'

type Role = 'ADMIN' | 'GP' | 'LP' | 'VIEWER'

export const requireRole =
  (...allowed: Role[]) =>
  async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.membership) {
      return reply.status(401).send({ error: 'Unauthorized' })
    }
    if (!allowed.includes(req.membership.role)) {
      return reply.status(403).send({ error: 'Forbidden: insufficient role' })
    }
  }
