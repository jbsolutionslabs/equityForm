import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify'
import cors from '@fastify/cors'

const corsPluginFn: FastifyPluginAsync = async (fastify) => {
  const allowedOrigin = process.env.FRONTEND_URL ?? 'http://localhost:5173'

  await fastify.register(cors, {
    origin: allowedOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Firm-Id'],
    maxAge: 86400,
    // preflightContinue: false (default) — @fastify/cors sends 204 for OPTIONS automatically
  })
}

export const corsPlugin = fp(corsPluginFn, { name: 'cors' })
