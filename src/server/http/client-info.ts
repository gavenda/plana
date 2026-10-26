import type { Context } from 'hono'
import { getConnInfo } from 'hono/bun'

import { getSettings } from '../db/settings'

/** Where a request came from, as the audit log keeps it. */
export type ClientInfo = { ip: string | null; userAgent: string | null }

/**
 * The caller's address and browser. Behind the settings' `trustedProxyHops` proxies the address is the
 * X-Forwarded-For entry that many from the end: each proxy appends the peer it saw, so only
 * the entries it added can be trusted, never the client-supplied start of the list.
 */
export function clientInfo(c: Context): ClientInfo {
  let ip: string | null = null
  const proxies = getSettings().trustedProxyHops ?? 0
  if (proxies > 0) {
    const hops = c.req.header('x-forwarded-for')?.split(',').map((hop) => hop.trim()) ?? []
    // Fewer entries than proxies means the header isn't what we were told to expect.
    ip = hops.length >= proxies ? hops[hops.length - proxies]! : null
  }
  if (!ip) {
    try {
      ip = getConnInfo(c).remote.address ?? null
    } catch {
      // No socket to ask, such as a request made without Bun.serve.
    }
  }
  const userAgent = c.req.header('user-agent')?.slice(0, 300) || null
  return { ip, userAgent }
}
