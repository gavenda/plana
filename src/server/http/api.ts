import { Hono, type Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { z } from 'zod'

import { CacheKey, invalidate } from '../cache'
import { AUDIT_CATEGORY_ACTIONS, listAudit, recordAudit, type AuditCategory } from '../db/audit'
import {
  getSettings,
  isConfigured,
  SETTING_KEYS,
  updateSettings,
  type GuildSettings,
} from '../db/settings'
import {
  deleteBirthday,
  getBirthdayOverview,
  MAX_BIRTHDAY_ROLE_REMOVALS,
  saveBirthday,
  syncBirthdayRole,
} from '../discord/birthdays'
import { ACTIVITY_RETENTION_DAYS, getActivityOverview } from '../discord/activity'
import { getGuild } from '../discord/client'
import { remindStaleTriage } from '../discord/triage-reminders'
import { MAX_MESSAGE_LENGTH } from '../constants'
import {
  assignRole,
  broadcast,
  getGuildDirectory,
  listPendingMembers,
  primeMemberCache,
  type ErrorCode,
  type Result,
} from '../discord/service'
import { requireAdmin, requireStaff, type AppEnv } from './session'

const snowflake = z.string().regex(/^\d{17,20}$/, 'Expected a Discord ID')

const STATUS_BY_CODE: Record<ErrorCode, ContentfulStatusCode> = {
  not_configured: 409,
  unknown_member: 404,
  unknown_role: 404,
  role_not_assignable: 400,
  unknown_channel: 404,
  channel_not_sendable: 403,
  missing_permissions: 403,
  invalid_birthday: 400,
  discord_error: 502,
}

/** Unwraps a service Result into a JSON response, mapping domain errors onto status codes. */
function respond<T>(c: Context, result: Result<T>): Response {
  if (result.ok) return c.json(result.data)
  return c.json({ error: result.message, code: result.code }, STATUS_BY_CODE[result.code])
}

export const api = new Hono<AppEnv>()

api.use('*', requireStaff)

api.get('/me', (c) => c.json({ user: { ...c.get('user'), access: c.get('access') } }))

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
    birthdayChannelId: snowflake.nullable(),
    triageReminderDays: z.number().int().min(1).max(30).nullable(),
    birthdayRoleId: snowflake.nullable(),
    moderatorRoleId: snowflake.nullable(),
  })
  .partial()

/**
 * The birthday role is taken from everyone without a birthday today, so a role that
 * means something else would be stripped from the whole server. Refuses the obvious
 * mistakes before they are saved.
 */
async function checkBirthdayRole(roleId: string, settings: GuildSettings): Promise<string | null> {
  const otherRoles = [
    settings.triageRoleId,
    settings.unitOwnerRoleId,
    settings.boardersRoleId,
    settings.moderatorRoleId,
  ]
  if (otherRoles.includes(roleId)) {
    return 'The birthday role must be its own role, not the triage or moderator role.'
  }

  await primeMemberCache()
  const guild = await getGuild()
  const role = guild.roles.cache.get(roleId)
  if (role && role.members.size > MAX_BIRTHDAY_ROLE_REMOVALS) {
    return (
      `@${role.name} is already held by ${role.members.size} members. ` +
      'Plana takes the birthday role from everyone without a birthday today, so pick a role used only for birthdays.'
    )
  }
  return null
}

api.put('/settings', requireAdmin, async (c) => {
  const parsed = settingsSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) {
    return c.json({ error: 'Invalid settings payload.', issues: parsed.error.issues }, 400)
  }

  const before = getSettings()

  const birthdayRoleId = parsed.data.birthdayRoleId
  if (birthdayRoleId && birthdayRoleId !== before.birthdayRoleId) {
    const problem = await checkBirthdayRole(birthdayRoleId, { ...before, ...parsed.data })
    if (problem) return c.json({ error: problem }, 400)
  }

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

    // Turning reminders on (or shortening them) takes effect now, not at the next hourly check.
    if (changed.includes('triageReminderDays')) void remindStaleTriage()
    if (changed.includes('birthdayRoleId')) void syncBirthdayRole(before.birthdayRoleId)
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

api.post('/broadcast', requireAdmin, async (c) => {
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

api.get('/birthdays', async (c) => respond(c, await getBirthdayOverview()))

const birthdaySchema = z.object({
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
})

api.put('/birthdays/:memberId', async (c) => {
  const memberId = snowflake.safeParse(c.req.param('memberId'))
  if (!memberId.success) return c.json({ error: 'Invalid member ID.' }, 400)

  const parsed = birthdaySchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'A month and a day are required.' }, 400)

  const user = c.get('user')
  return respond(
    c,
    await saveBirthday({
      memberId: memberId.data,
      ...parsed.data,
      actor: { id: user.id, name: user.username },
      source: 'dashboard',
    }),
  )
})

api.delete('/birthdays/:memberId', async (c) => {
  const memberId = snowflake.safeParse(c.req.param('memberId'))
  if (!memberId.success) return c.json({ error: 'Invalid member ID.' }, 400)

  const user = c.get('user')
  return respond(
    c,
    await deleteBirthday({
      memberId: memberId.data,
      actor: { id: user.id, name: user.username },
      source: 'dashboard',
    }),
  )
})

const auditCategory = z.enum(
  Object.keys(AUDIT_CATEGORY_ACTIONS) as [AuditCategory, ...AuditCategory[]],
)

const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  before: z.coerce.number().int().positive().optional(),
  search: z.string().max(200).optional(),
  /** Comma-separated, e.g. `moderation,messages`. */
  categories: z
    .string()
    .optional()
    .transform((value) => (value ? value.split(',').filter(Boolean) : []))
    .pipe(z.array(auditCategory)),
})

api.get('/audit', (c) => {
  const parsed = auditQuerySchema.safeParse(c.req.query())
  if (!parsed.success) return c.json({ error: 'Invalid audit log query.' }, 400)
  return c.json(listAudit(parsed.data))
})

const activityQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(ACTIVITY_RETENTION_DAYS).default(7),
})

api.get('/activity', async (c) => {
  const parsed = activityQuerySchema.safeParse(c.req.query())
  if (!parsed.success) return c.json({ error: 'Invalid period.' }, 400)
  return respond(c, await getActivityOverview(parsed.data.days))
})
