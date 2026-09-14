import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'
import { logger } from 'hono/logger'

import { cacheStatus } from '../cache'
import { getSettings, isConfigured } from '../db/settings'
import { isReady } from '../discord/client'
import { isProduction } from '../env'
import { api } from './api'
import { authRoutes } from './auth'
import type { Renderer } from './ssr'

/** Paths that look like a file on disk, e.g. `/assets/index-abc123.js`. */
const FILE_PATH = /\.[a-z0-9]+$/i

export function createHttpApp(renderer: Renderer): Hono {
  const app = new Hono()

  app.use('*', logger())

  app.get('/healthz', (c) =>
    c.json({
      ok: true,
      discord: isReady() ? 'ready' : 'connecting',
      cache: cacheStatus(),
      configured: isConfigured(getSettings()),
      uptime: Math.round(process.uptime()),
    }),
  )

  app.route('/auth', authRoutes)
  app.route('/api', api)

  if (isProduction) {
    const files = serveStatic({ root: './dist/client' })

    // Only file-shaped paths go to disk, so `/settings` reaches SSR instead of
    // 404ing on a file that does not exist. A file-shaped path that is genuinely
    // missing must 404 rather than fall through, otherwise a stale `<script>` tag
    // would receive the HTML shell with a 200 and fail to parse as a module.
    app.use('*', async (c, next) => {
      if (c.req.method !== 'GET' || !FILE_PATH.test(c.req.path)) return next()

      const response = await files(c, async () => {})
      return response ?? c.text('Not found', 404)
    })
  }

  app.all('*', (c) => renderer.handle(c))

  return app
}
