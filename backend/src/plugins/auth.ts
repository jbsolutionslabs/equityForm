import fp from 'fastify-plugin'
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'
import { verifyToken } from '@clerk/backend'
import { prisma } from '../db/client.js'

declare module 'fastify' {
  interface FastifyRequest {
    auth: { userId: string } | null
    firmId: string
    membership: { role: 'ADMIN' | 'GP' | 'LP' | 'VIEWER' } | null
  }
}

const authPluginFn: FastifyPluginAsync = async (fastify) => {
  const secretKey = process.env.CLERK_SECRET_KEY
  if (!secretKey) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('CLERK_SECRET_KEY must be set in production')
    }
    fastify.log.warn('CLERK_SECRET_KEY is not set — all requests will be rejected')
  }

  fastify.decorateRequest('auth', null)
  fastify.decorateRequest('firmId', '')
  fastify.decorateRequest('membership', null)

  fastify.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.url === '/health') return
    if (req.method === 'OPTIONS') return  // CORS preflights don't carry auth tokens

    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Missing authorization header' })
    }

    const token = authHeader.slice(7)
    try {
      // verifyToken is a standalone function in @clerk/backend v2
      const payload = await verifyToken(token, { secretKey: secretKey! })
      req.auth = { userId: payload.sub }
    } catch (err) {
      req.log.warn({ err }, 'Token verification failed')
      return reply.status(401).send({ error: 'Invalid token' })
    }

    // Ensure user row exists. Use userId-scoped placeholder email so each user
    // has a unique value. P2002 = concurrent request already created it, safe to ignore.
    try {
      await prisma.user.upsert({
        where: { id: req.auth!.userId },
        update: {},
        create: {
          id: req.auth!.userId,
          email: `${req.auth!.userId}@placeholder.local`,
        },
      })
    } catch (upsertErr: any) {
      if (upsertErr?.code !== 'P2002') {
        req.log.error({ err: upsertErr }, 'Failed to sync user record')
      }
      // Continue — auth is valid even if DB sync fails
    }
  })
}

export const authPlugin = fp(authPluginFn, { name: 'auth' })
