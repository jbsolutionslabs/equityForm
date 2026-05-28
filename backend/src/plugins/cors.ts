import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify'

const corsPluginFn: FastifyPluginAsync = async (fastify) => {
  const allowedOrigin = process.env.FRONTEND_URL ?? 'http://localhost:5173'

  // onRequest runs after routing succeeds — sets CORS headers on all matched routes.
  // The wildcard OPTIONS route in index.ts ensures OPTIONS requests reach this hook.
  fastify.addHook('onRequest', async (req, reply) => {
    const reqOrigin = req.headers.origin

    if (reqOrigin === allowedOrigin) {
      reply.header('Access-Control-Allow-Origin', reqOrigin)
      reply.header('Access-Control-Allow-Credentials', 'true')
    }

    // Set preflight headers — the OPTIONS route handler sends the actual 204
    if (req.method === 'OPTIONS') {
      reply
        .header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
        .header('Access-Control-Allow-Headers', 'Content-Type,Authorization,Idempotency-Key,X-Firm-Id')
        .header('Access-Control-Max-Age', '86400')
    }
  })
}

export const corsPlugin = fp(corsPluginFn, { name: 'cors' })
