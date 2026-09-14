import { Hono, type Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { z } from 'zod'

import { CacheKey, invalidate } from '../cache'
import { listAudit, recordAudit } from '../db/audit'
import { getSettings, isConfigured, SETTING_KEYS, updateSettings } from '../db/settings'
import { MAX_MESSAGE_LENGTH } from '../constants'
import {
  assignRole,
  broadcast,
  getGuildDirectory,
  listPendingMembers,
  type ErrorCode,
  type Result,
} from '../discord/service'
import { requireAdmin, type AppEnv } from './session'

const snowflake = z.string().regex(/^\d{17,20}$/, 'Expected a Discord ID')

const STATUS_BY_CODE: Record<ErrorCode, ContentfulStatusCode> = {
  not_configured: 409,
  unknown_member: 404,
  unknown_role: 404,
  role_not_assignable: 400,
  unknown_channel: 404,
  channel_not_sendable: 403,
  missing_permissions: 403,
  discord_error: 502,
}

/** Unwraps a service Result into a JSON response, mapping domain errors onto status codes. */
function respond<T>(c: Context, result: Result<T>): Response {
  if (result.ok) return c.json(result.data)
  return c.json({ error: result.message, code: result.code }, STATUS_BY_CODE[result.code])
}

export const api = new Hono<AppEnv>()

api.use('*', requireAdmin)

api.get('/me', (c) => c.json({ user: c.get('user') }))

api.get('/guild', async (c) => respond(c, await getGuildDirectory()))

api.get('/settings', (c) => {
  const settings = getSettings()
  return c.json({ settings, configured: isConfigured(settings) })
})

const settingsSchema = z
  .object({
    triageRoleId: snowflake.nullable(),
    unitOwnerRoleId: snowflake.nullable(),
    boardersRoleId: snowflake.nullable(),
    announceChannelId: snowflake.nullable(),
  })
  .partial()

api.put('/settings', async (c) => {
  const parsed = settingsSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) {
    return c.json({ error: 'Invalid settings payload.', issues: parsed.error.issues }, 400)
  }

  const before = getSettings()
  const settings = updateSettings(parsed.data)

  const changed = SETTING_KEYS.filter((key) => before[key] !== settings[key])
  if (changed.length > 0) {
    await invalidate(CacheKey.pendingMembers, CacheKey.guildDirectory)

    const user = c.get('user')
    recordAudit({
      action: 'settings.update',
      source: 'dashboard',
      actorId: user.id,
      actorName: user.username,
      detail: Object.fromEntries(
        changed.map((key) => [key, { from: before[key], to: settings[key] }]),
      ),
    })
  }

  return c.json({ settings, configured: isConfigured(settings), changed })
})

api.get('/members/pending', async (c) => respond(c, await listPendingMembers()))

const assignSchema = z.object({ roleId: snowflake })

api.post('/members/:memberId/assign', async (c) => {
  const memberId = snowflake.safeParse(c.req.param('memberId'))
  if (!memberId.success) return c.json({ error: 'Invalid member ID.' }, 400)

  const parsed = assignSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Invalid role ID.' }, 400)

  const user = c.get('user')
  return respond(
    c,
    await assignRole({
      memberId: memberId.data,
      roleId: parsed.data.roleId,
      actor: { id: user.id, name: user.username },
      source: 'dashboard',
    }),
  )
})

const broadcastSchema = z.object({
  channelId: snowflake,
  content: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
})

api.post('/broadcast', async (c) => {
  const parsed = broadcastSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) {
    return c.json({ error: 'A channel and a message of up to 2000 characters are required.' }, 400)
  }

  const user = c.get('user')
  return respond(
    c,
    await broadcast({
      ...parsed.data,
      actor: { id: user.id, name: user.username },
      source: 'dashboard',
    }),
  )
})

const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  before: z.coerce.number().int().positive().optional(),
})

api.get('/audit', (c) => {
  const parsed = auditQuerySchema.safeParse(c.req.query())
  if (!parsed.success) return c.json({ error: 'Invalid pagination parameters.' }, 400)
  return c.json(listAudit(parsed.data))
})
