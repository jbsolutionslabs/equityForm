import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify'

const corsPluginFn: FastifyPluginAsync = async (fastify) => {
  const allowedOrigin = process.env.FRONTEND_URL ?? 'http://localhost:5173'

  // Track which URL paths have already had OPTIONS injected.
  // Multiple route plugins share the same prefix (/api/v1/deals), so onRoute
  // fires for every GET/POST/PATCH/etc. at the same URL. Without this guard,
  // find-my-way throws "Method 'OPTIONS' already declared" on the second hit.
  const optionedPaths = new Set<string>()

  // Inject OPTIONS into every route's method list at registration time.
  // Without this, Fastify's router (find-my-way) returns 405 for preflight
  // requests before any hooks can run, because the path exists but OPTIONS
  // is not in the method list.
  fastify.addHook('onRoute', (routeOptions) => {
    const methods = Array.isArray(routeOptions.method)
      ? (routeOptions.method as string[])
      : [routeOptions.method as string]

    if (methods.includes('OPTIONS')) return
    if (optionedPaths.has(routeOptions.url)) return

    optionedPaths.add(routeOptions.url)
    routeOptions.method = [...methods, 'OPTIONS'] as any
  })

  // Set CORS headers on every request. For OPTIONS preflights, also add the
  // preflight-specific headers and send 204 immediately — this short-circuits
  // the rest of the lifecycle so auth / route handlers never run for preflights.
  fastify.addHook('onRequest', async (req, reply) => {
    const reqOrigin = req.headers.origin

    if (reqOrigin === allowedOrigin) {
      reply.header('Access-Control-Allow-Origin', reqOrigin)
      reply.header('Access-Control-Allow-Credentials', 'true')
    }

    if (req.method === 'OPTIONS') {
      reply
        .header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
        .header('Access-Control-Allow-Headers', 'Content-Type,Authorization,Idempotency-Key,X-Firm-Id')
        .header('Access-Control-Max-Age', '86400')
      return reply.status(204).send()
    }
  })
}

export const corsPlugin = fp(corsPluginFn, { name: 'cors' })
