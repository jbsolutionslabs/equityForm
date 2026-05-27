import type { FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../db/client.js'

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export async function auditLog(req: FastifyRequest, reply: FastifyReply, payload: unknown) {
  if (!MUTATION_METHODS.has(req.method)) return payload
  if (!req.auth || !req.firmId) return payload

  // Extract dealId from URL if present
  const dealIdMatch = req.url.match(/\/deals\/([^/]+)/)
  const dealId = dealIdMatch?.[1] ?? null

  // Fire-and-forget; don't block response
  prisma.activityFeedEntry
    .create({
      data: {
        firmId: req.firmId,
        userId: req.auth.userId,
        dealId: dealId ?? undefined,
        action: `${req.method} ${req.url}`,
        payload: {
          method: req.method,
          path: req.url,
          statusCode: reply.statusCode,
        },
      },
    })
    .catch(() => {/* swallow audit errors */})

  return payload
}
