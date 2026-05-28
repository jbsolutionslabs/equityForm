import Fastify from 'fastify'
import { helmetPlugin } from './plugins/helmet.js'
import { corsPlugin } from './plugins/cors.js'
import { rateLimitPlugin } from './plugins/rateLimit.js'
import { authPlugin } from './plugins/auth.js'
import { dealsRouter } from './routes/deals.js'
import { investorsRouter } from './routes/investors.js'
import { subscriptionsRouter } from './routes/subscriptions.js'
import { spvRouter } from './routes/spv.js'
import { oaRouter } from './routes/oa.js'
import { capTableRouter } from './routes/captable.js'
import { blueSkyRouter } from './routes/bluesky.js'
import { activityFeedRouter } from './routes/activityFeed.js'
import { economicsRouter } from './routes/economics.js'
import { accountingRouter } from './routes/accounting.js'
import { templatesRouter } from './routes/templates.js'
import { complianceRouter } from './routes/compliance.js'
import { documentsRouter } from './routes/documents.js'
import { migrateRouter } from './routes/migrate.js'
import { firmsRouter } from './routes/firms.js'

const server = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    ...(process.env.NODE_ENV !== 'production' && {
      transport: { target: 'pino-pretty' },
    }),
  },
})

async function bootstrap() {
  // Security plugins (order matters)
  await server.register(helmetPlugin)
  await server.register(corsPlugin)
  await server.register(rateLimitPlugin)
  await server.register(authPlugin)

  // Health check (unauthenticated)
  server.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }))

  // API routes
  const V1 = '/api/v1'
  await server.register(firmsRouter,       { prefix: `${V1}/firms` })
  await server.register(dealsRouter,       { prefix: `${V1}/deals` })
  await server.register(investorsRouter,   { prefix: `${V1}/deals` })
  await server.register(subscriptionsRouter, { prefix: `${V1}/deals` })
  await server.register(spvRouter,         { prefix: `${V1}/deals` })
  await server.register(oaRouter,          { prefix: `${V1}/deals` })
  await server.register(capTableRouter,    { prefix: `${V1}/deals` })
  await server.register(blueSkyRouter,     { prefix: `${V1}/deals` })
  await server.register(activityFeedRouter,{ prefix: `${V1}/deals` })
  await server.register(economicsRouter,   { prefix: `${V1}/deals` })
  await server.register(accountingRouter,  { prefix: `${V1}/accounting` })
  await server.register(templatesRouter,   { prefix: `${V1}/templates` })
  await server.register(complianceRouter,  { prefix: `${V1}/compliance` })
  await server.register(documentsRouter,   { prefix: `${V1}/deals` })
  await server.register(migrateRouter,     { prefix: `${V1}/migrate` })

  const port = parseInt(process.env.PORT ?? '3001')
  await server.listen({ port, host: '0.0.0.0' })
  console.log(`Backend listening on port ${port}`)
}

bootstrap().catch((err) => {
  console.error(err)
  process.exit(1)
})
