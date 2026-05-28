import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify'

const corsPluginFn: FastifyPluginAsync = async (fastify) => {
  const allowedOrigin = process.env.FRONTEND_URL ?? 'http://localhost:5173'

  fastify.addHook('onRequest', async (req, reply) => {
    const reqOrigin = req.headers.origin

    // Set CORS headers when origin matches
    if (reqOrigin === allowedOrigin) {
      reply.header('Access-Control-Allow-Origin', reqOrigin)
      reply.header('Access-Control-Allow-Credentials', 'true')
    }

    // Handle preflight — must respond before route matching returns 405
    if (req.method === 'OPTIONS') {
      reply
        .header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
        .header('Access-Control-Allow-Headers', 'Content-Type,Authorization,Idempotency-Key,X-Firm-Id')
        .header('Access-Control-Max-Age', '86400')
        .status(204)
        .send()
    }
  })
}

export const corsPlugin = fp(corsPluginFn, { name: 'cors' })
