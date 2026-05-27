import fp from 'fastify-plugin'
import helmet from '@fastify/helmet'
import type { FastifyPluginAsync } from 'fastify'

const helmetPluginFn: FastifyPluginAsync = async (fastify) => {
  await fastify.register(helmet, {
    contentSecurityPolicy: false, // Configured separately for API
  })
}

export const helmetPlugin = fp(helmetPluginFn, { name: 'helmet' })
