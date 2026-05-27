import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../db/client.js'
import { requireFirm } from '../middleware/requireFirm.js'
import { requireRole } from '../middleware/requireRole.js'
import { CreateTemplateSchema, UpdateTemplateSchema } from '@equityform/shared'

type TplParams = { id: string }

export const templatesRouter: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', requireFirm)

  // GET /api/v1/templates
  fastify.get('/', async (req: FastifyRequest, reply: FastifyReply) => {
    const type = (req.query as Record<string, string>)['type']
    const templates = await prisma.firmTemplate.findMany({
      where: {
        firmId: req.firmId,
        deletedAt: null,
        ...(type ? { type } : {}),
      },
      orderBy: { createdAt: 'asc' },
    })
    return reply.send(templates)
  })

  // POST /api/v1/templates
  fastify.post(
    '/',
    { preHandler: requireRole('GP', 'ADMIN') },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const parsed = CreateTemplateSchema.safeParse(req.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Validation failed', issues: parsed.error.issues })
      }
      const template = await prisma.firmTemplate.create({
        data: { ...parsed.data, firmId: req.firmId },
      })
      return reply.status(201).send(template)
    }
  )

  // PATCH /api/v1/templates/:id
  fastify.patch<{ Params: TplParams }>(
    '/:id',
    { preHandler: requireRole('GP', 'ADMIN') },
    async (req, reply) => {
      const parsed = UpdateTemplateSchema.safeParse(req.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Validation failed', issues: parsed.error.issues })
      }
      const result = await prisma.firmTemplate.updateMany({
        where: { id: req.params.id, firmId: req.firmId, deletedAt: null },
        data: parsed.data,
      })
      if (result.count === 0) return reply.status(404).send({ error: 'Template not found' })
      return reply.send({ ok: true })
    }
  )

  // DELETE /api/v1/templates/:id (soft delete)
  fastify.delete<{ Params: TplParams }>(
    '/:id',
    { preHandler: requireRole('GP', 'ADMIN') },
    async (req, reply) => {
      const result = await prisma.firmTemplate.updateMany({
        where: { id: req.params.id, firmId: req.firmId, deletedAt: null },
        data: { deletedAt: new Date() },
      })
      if (result.count === 0) return reply.status(404).send({ error: 'Template not found' })
      return reply.send({ ok: true })
    }
  )
}
