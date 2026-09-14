import { closeCache, connectCache } from './cache'
import { pruneExpiredSessions } from './db/sessions'
import { getSettings, isConfigured, seedSettingsFromEnv } from './db/settings'
import { client } from './discord/client'
import { registerEvents } from './discord/events'
import { primeMemberCache } from './discord/service'
import { env } from './env'
import { createHttpApp } from './http/app'
import { createRenderer } from './http/ssr'

const SESSION_PRUNE_INTERVAL_MS = 60 * 60 * 1000

/**
 * A safety net against a missed gateway event, not the primary refresh path.
 * One Request Guild Members every half hour is nowhere near the opcode 8 limits.
 */
const MEMBER_REFRESH_INTERVAL_MS = 30 * 60 * 1000

seedSettingsFromEnv()

await connectCache()

registerEvents(client)
await login()

/**
 * Turns the two failures that account for almost every failed first start into
 * instructions, instead of a websocket stack trace from deep inside discord.js.
 */
async function login(): Promise<void> {
  try {
    await client.login(env.DISCORD_TOKEN)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    if (message.includes('disallowed intents')) {
      console.error(
        '[discord] Discord refused the connection: this bot needs the Server Members Intent.\n' +
          '          Enable it at https://discord.com/developers/applications\n' +
          '          -> your application -> Bot -> Privileged Gateway Intents\n' +
          '          -> Server Members Intent, then start again.\n' +
          '          Without it the bot cannot see members join, so triage cannot work.',
      )
      process.exit(1)
    }

    if (message.includes('invalid token')) {
      console.error(
        '[discord] Discord rejected the bot token.\n' +
          '          Check DISCORD_TOKEN against the Bot page of your application.\n' +
          '          Note that the bot token is not the client secret.',
      )
      process.exit(1)
    }

    throw error
  }
}

const renderer = await createRenderer()
const app = createHttpApp(renderer)

const server = Bun.serve({
  hostname: env.HOST,
  port: env.PORT,
  fetch: app.fetch,
  idleTimeout: 30,
})

console.log(`[http] listening on http://${env.HOST}:${env.PORT} (${env.NODE_ENV})`)
console.log(`[http] public base URL ${env.PUBLIC_BASE_URL}`)

if (!isConfigured(getSettings())) {
  console.warn('[settings] roles/channel not fully configured — set them in the dashboard.')
}

const pruneTimer = setInterval(() => {
  const removed = pruneExpiredSessions()
  if (removed > 0) console.log(`[sessions] pruned ${removed} expired session(s)`)
}, SESSION_PRUNE_INTERVAL_MS)

const memberRefreshTimer = setInterval(() => {
  void primeMemberCache(true).catch((error: unknown) => {
    console.warn('[discord] member cache refresh failed:', error)
  })
}, MEMBER_REFRESH_INTERVAL_MS)

async function shutdown(signal: string): Promise<void> {
  console.log(`\n[shutdown] received ${signal}`)
  clearInterval(pruneTimer)
  clearInterval(memberRefreshTimer)
  await server.stop(true)
  await renderer.close()
  await client.destroy()
  closeCache()
  process.exit(0)
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
