import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../db/client.js'
import { requireFirm } from '../middleware/requireFirm.js'

/**
 * One-time migration endpoint: imports a full localStorage AppState payload
 * into the database under the authenticated user's firm.
 */
export const migrateRouter: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', requireFirm)

  fastify.post('/', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.auth) return reply.status(401).send({ error: 'Unauthorized' })

    const body = req.body as {
      deals?: Record<string, { id: string; createdAt: string; data: Record<string, unknown> }>
    }

    if (!body.deals || typeof body.deals !== 'object') {
      return reply.status(400).send({ error: 'Expected { deals: {...} } payload' })
    }

    const results: Array<{ legacyId: string; newId: string }> = []

    for (const [legacyId, entry] of Object.entries(body.deals)) {
      const data = entry.data as Record<string, unknown>
      const dealData = data.dealSetup as Record<string, unknown> | undefined
      const name = (dealData?.projectName as string) ?? (dealData?.propertyAddress as string) ?? `Imported Deal (${legacyId})`
      const propertyAddress = dealData?.propertyAddress as string | undefined
      const propertyState = dealData?.propertyState as string | undefined
      const assetClass = dealData?.assetClass as string | undefined

      // Create deal
      const deal = await prisma.deal.create({
        data: {
          firmId: req.firmId,
          name,
          propertyAddress,
          propertyState,
          assetClass,
        },
      })

      // Migrate offering
      const offering = data.offering as Record<string, unknown> | undefined
      if (offering) {
        await prisma.dealOffering.create({
          data: { dealId: deal.id, payload: offering },
        })
      }

      // Migrate investors
      const investors = data.investors as Array<Record<string, unknown>> | undefined
      if (investors?.length) {
        for (const inv of investors) {
          await prisma.investor.create({
            data: {
              dealId: deal.id,
              firmId: req.firmId,
              name: (inv.fullLegalName as string) ?? 'Unknown',
              email: (inv.email as string) ?? '',
              accreditation: inv.accreditedInvestorBasis as string | undefined,
              payload: inv,
            },
          })
        }
      }

      // Migrate SPV
      const spv = data.spvFormation as Record<string, unknown> | undefined
      if (spv) {
        await prisma.spvFormation.create({
          data: {
            dealId: deal.id,
            entityName: (spv.entityName as Record<string, unknown> | undefined)?.entityName as string | undefined,
            registeredAgent: (spv.registeredAgent as object) ?? null,
            certOfFormation: (spv.certOfFormation as object) ?? null,
            einObtained: ((spv.einObtained as Record<string, unknown> | undefined)?.complete as boolean) ?? false,
            foreignQualification: (spv.foreignQualification as object) ?? null,
          },
        })
      }

      results.push({ legacyId, newId: deal.id })
    }

    return reply.status(201).send({ imported: results.length, deals: results })
  })
}
