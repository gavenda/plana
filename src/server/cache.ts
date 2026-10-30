import { RedisClient } from 'bun'

import { env } from './env'
import { notify, type LiveTopic } from './live'
import { logger } from './logging'

const log = logger('cache')

/** Namespaced so the cache can share a Redis instance with anything else. */
const PREFIX = 'plana:'

export const CacheKey = {
  pendingMembers: 'members:pending',
  guildDirectory: 'guild:directory',
} as const

/** The page topic that follows each cached value, so open pages reload when it goes stale. */
const LIVE_TOPIC: Record<string, LiveTopic> = {
  [CacheKey.pendingMembers]: 'triage',
  [CacheKey.guildDirectory]: 'guild',
}

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
    if (degraded) log.info`reconnected to Redis`
    degraded = false
  }

  return client
}

/** How often to try connecting again while Redis is unreachable. */
const RETRY_MS = 30_000
let lastAttempt = 0

/**
 * The client once connected, else null so the caller serves live. Redis can be a service
 * outside this pod that starts after it, and a client whose first connect failed never retries on
 * its own, so this tries again, at most every RETRY_MS so an outage doesn't slow every request.
 * Once connected, the client reconnects by itself after a Redis restart.
 */
async function ready(): Promise<RedisClient | null> {
  const redis = getClient()
  if (!redis || redis.connected) return redis

  const now = Date.now()
  if (now - lastAttempt < RETRY_MS) return null
  lastAttempt = now
  try {
    await redis.connect()
    return redis
  } catch (error) {
    degrade(error)
    return null
  }
}

/**
 * Redis is a cache, never a source of truth, so every failure falls through to the
 * live value. The warning is logged once per outage rather than once per request.
 */
function degrade(error: unknown): void {
  if (degraded) return
  degraded = true
  log.warning`Redis unavailable, serving uncached: ${error instanceof Error ? error.message : error}`
}

/** Read-through cache. `produce` is called on a miss, on an error, or with no Redis. */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  produce: () => Promise<T>,
): Promise<T> {
  const redis = await ready()

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
  notify(...keys.flatMap((key) => LIVE_TOPIC[key] ?? []))

  const redis = await ready()
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
    log.info`REDIS_URL is empty, caching disabled`
    return
  }

  lastAttempt = Date.now()
  try {
    await redis.connect()
    log.info`connected to Redis`
  } catch (error) {
    degrade(error)
  }
}

export function closeCache(): void {
  client?.close()
  client = null
}
