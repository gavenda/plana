import type { MiddlewareHandler } from 'hono'

import { isProduction } from '../env'
import { logger } from '../logging'
import { VITE_PREFIXES } from './ssr'

const log = logger('http')

/**
 * Logs each request's method, path, status and how long the server took to answer, at debug
 * level. The time stops when the handler returns, so it covers our work but not the network.
 * Vite's own module traffic in development is skipped: a page load fetches hundreds of them.
 */
export const requestLog: MiddlewareHandler = async (c, next) => {
  if (!isProduction && VITE_PREFIXES.some((prefix) => c.req.path.startsWith(prefix))) {
    return next()
  }

  const start = performance.now()
  await next()
  const ms = (performance.now() - start).toFixed(1)
  log.debug`${c.req.method} ${c.req.path} ${c.res.status} ${ms}ms`
}
