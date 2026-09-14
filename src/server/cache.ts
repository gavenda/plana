import { RedisClient } from 'bun'

import { env } from './env'

/** Namespaced so the cache can share a Redis instance with anything else. */
const PREFIX = 'plana:'

export const CacheKey = {
  pendingMembers: 'members:pending',
  guildDirectory: 'guild:directory',
} as const

export const CacheTtl = {
  pendingMembers: 60,
  guildDirectory: 300,
} as const

let client: RedisClient | null = null
let degraded = false

function getClient(): RedisClient | null {
  if (!env.REDIS_URL) return null
  if (client) return client

  client = new RedisClient(env.REDIS_URL, {
    // Fail fast instead of queueing commands while Redis is unreachable: a cache
    // miss is cheap, a hung request is not.
    enableOfflineQueue: false,
    autoReconnect: true,
    connectionTimeout: 2000,
  })

  client.onconnect = () => {
    if (degraded) console.log('[cache] reconnected to Redis')
    degraded = false
  }

  return client
}

/**
 * Redis is a cache, never a source of truth, so every failure falls through to the
 * live value. The warning is logged once per outage rather than once per request.
 */
function degrade(error: unknown): void {
  if (degraded) return
  degraded = true
  console.warn(
    `[cache] Redis unavailable, serving uncached: ${error instanceof Error ? error.message : error}`,
  )
}

/** Read-through cache. `produce` is called on a miss, on an error, or with no Redis. */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  produce: () => Promise<T>,
): Promise<T> {
  const redis = getClient()

  if (redis) {
    try {
      const hit = await redis.get(PREFIX + key)
      if (hit !== null) return JSON.parse(hit) as T
    } catch (error) {
      degrade(error)
    }
  }

  const value = await produce()

  if (redis) {
    try {
      await redis.set(PREFIX + key, JSON.stringify(value), 'EX', ttlSeconds)
    } catch (error) {
      degrade(error)
    }
  }

  return value
}

export async function invalidate(...keys: string[]): Promise<void> {
  const redis = getClient()
  if (!redis || keys.length === 0) return

  try {
    await redis.del(...keys.map((key) => PREFIX + key))
  } catch (error) {
    degrade(error)
  }
}

export type CacheStatus = 'disabled' | 'connected' | 'unavailable'

export function cacheStatus(): CacheStatus {
  if (!env.REDIS_URL) return 'disabled'
  return client?.connected ? 'connected' : 'unavailable'
}

/** Best-effort connect at startup so a misconfigured URL surfaces immediately. */
export async function connectCache(): Promise<void> {
  const redis = getClient()
  if (!redis) {
    console.log('[cache] REDIS_URL is empty, caching disabled')
    return
  }

  try {
    await redis.connect()
    console.log('[cache] connected to Redis')
  } catch (error) {
    degrade(error)
  }
}

export function closeCache(): void {
  client?.close()
  client = null
}
