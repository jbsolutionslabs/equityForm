import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../db/client.js'
import { requireFirm } from '../middleware/requireFirm.js'
import { requireRole } from '../middleware/requireRole.js'
import { CreateComplianceEntitySchema, UpdateComplianceEntitySchema } from '@equityform/shared'

type EntityParams = { id: string }

export const complianceRouter: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', requireFirm)

  // GET /api/v1/compliance
  fastify.get('/', async (req: FastifyRequest, reply: FastifyReply) => {
    const entities = await prisma.complianceEntity.findMany({
      where: { firmId: req.firmId, deletedAt: null },
      include: {
        notifications: {
          orderBy: { dueDate: 'asc' },
        },
      },
    })
    return reply.send(entities)
  })

  // POST /api/v1/compliance/entities
  fastify.post(
    '/entities',
    { preHandler: requireRole('GP', 'ADMIN') },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const parsed = CreateComplianceEntitySchema.safeParse(req.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Validation failed', issues: parsed.error.issues })
      }
      const entity = await prisma.complianceEntity.create({
        data: { payload: parsed.data.payload, firmId: req.firmId },
      })
      return reply.status(201).send(entity)
    }
  )

  // PATCH /api/v1/compliance/entities/:id
  fastify.patch<{ Params: EntityParams }>(
    '/entities/:id',
    { preHandler: requireRole('GP', 'ADMIN') },
    async (req, reply) => {
      const parsed = UpdateComplianceEntitySchema.safeParse(req.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Validation failed', issues: parsed.error.issues })
      }
      const result = await prisma.complianceEntity.updateMany({
        where: { id: req.params.id, firmId: req.firmId, deletedAt: null },
        data: parsed.data,
      })
      if (result.count === 0) return reply.status(404).send({ error: 'Entity not found' })
      return reply.send({ ok: true })
    }
  )
}
