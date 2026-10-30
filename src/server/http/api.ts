import { Hono, type Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { z } from 'zod'

import { getBackupOverview, runBackup } from '../backup'
import { CacheKey, cached, invalidate } from '../cache'
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
  getUpcomingBirthdays,
  MAX_BIRTHDAY_ROLE_REMOVALS,
  saveBirthday,
  syncBirthdayRole,
} from '../discord/birthdays'
import {
  getActivityOverview,
  getGameNightRoles,
  getGamePlayers,
  getTrackListeners,
  MAX_ACTIVITY_DAYS,
} from '../discord/activity'
import { getGuild } from '../discord/client'
import { getGameRole, setGameRole } from '../db/game-nights'
import { getMemberProfile, listMembers } from '../discord/members'
import { getMemberVoice, getVoiceOverview } from '../discord/voice'
import { getHeatmap } from '../discord/heatmaps'
import { getVivyMusic, isVivyEnabled } from '../discord/vivy'
import { postWeeklyRecap } from '../discord/recap'
import { getDailyTrends, getMemberActivity } from '../discord/trends'
import { remindStaleTriage } from '../discord/triage-reminders'
import { MAX_MESSAGE_LENGTH } from '../constants'
import { logger, recentLogs } from '../logging'
import {
  assignRole,
  broadcast,
  getGuildDirectory,
  listPendingMembers,
  primeMemberCache,
  type ErrorCode,
  type Result,
  type BroadcastBody,
} from '../discord/service'
import { limitViewers, requireAccess, requireAdmin, type AppEnv } from './session'
import { validateComponents } from '../../lib/components-v2'

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

api.use('*', requireAccess, limitViewers)

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
    recapChannelId: snowflake.nullable(),
    triageReminderDays: z.number().int().min(1).max(30).nullable(),
    birthdayRoleId: snowflake.nullable(),
    moderatorRoleId: snowflake.nullable(),
    statsRoleId: snowflake.nullable(),
    trustedProxyHops: z.number().int().min(1).max(5).nullable(),
    gameNightChannelId: snowflake.nullable(),
    gameNightMinPlayers: z.number().int().min(2).max(10).nullable(),
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
    settings.statsRoleId,
  ]
  if (otherRoles.includes(roleId)) {
    return 'The birthday role must be its own role, not the triage, moderator or stats role.'
  }

  await primeMemberCache()
  const guild = await getGuild()
  const role = guild.roles.cache.get(roleId)
  if (role && role.members.size > MAX_BIRTHDAY_ROLE_REMOVALS) {
    return (
      `@${role.name} is already held by ${role.members.size} members. ` +
      'The birthday role is taken from everyone without a birthday today, so pick a role used only for birthdays.'
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
    if (changed.includes('recapChannelId')) void postWeeklyRecap()
  }

  return c.json({ settings, configured: isConfigured(settings), changed })
})

/** The log viewer in Settings: what the server has logged lately, oldest first. */
api.get('/logs', requireAdmin, (c) => c.json({ entries: recentLogs() }))

api.get('/backup', requireAdmin, async (c) => c.json(await getBackupOverview()))

/** "Back up now" in Settings. Answers once the backup is done, with the overview after it. */
api.post('/backup', requireAdmin, async (c) => {
  const result = await runBackup()
  if (!result.ok) return c.json({ error: result.error }, result.busy ? 409 : 502)

  const user = c.get('user')
  recordAudit({
    action: 'backup.create',
    source: 'dashboard',
    actorId: user.id,
    actorName: user.username,
    detail: { key: result.key },
  })
  return c.json(await getBackupOverview())
})

api.get('/members/pending', async (c) => respond(c, await listPendingMembers()))

api.get('/members', async (c) => respond(c, await listMembers()))

api.get('/members/:memberId', async (c) => {
  const memberId = snowflake.safeParse(c.req.param('memberId'))
  if (!memberId.success) return c.json({ error: 'Invalid member ID.' }, 400)

  const parsed = activityQuerySchema.safeParse(c.req.query())
  if (!parsed.success) return c.json({ error: 'Invalid period.' }, 400)
  return respond(c, await getMemberProfile(memberId.data, parsed.data.days))
})

/** A member's time in voice and games per day, for the activity strip on their profile. */
api.get('/members/:memberId/activity', (c) => {
  const memberId = snowflake.safeParse(c.req.param('memberId'))
  if (!memberId.success) return c.json({ error: 'Invalid member ID.' }, 400)
  return respond(c, getMemberActivity(memberId.data))
})

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

const broadcastSchema = z.union([
  z.object({
    channelId: snowflake,
    content: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
  }),
  z.object({ channelId: snowflake, components: z.unknown() }),
])

api.post('/broadcast', requireAdmin, async (c) => {
  const parsed = broadcastSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) {
    return c.json({ error: 'A channel and a message of up to 2000 characters are required.' }, 400)
  }

  // A layout is checked on its own, so the reply can say which part is wrong.
  let body: BroadcastBody
  if ('components' in parsed.data) {
    const layout = validateComponents(parsed.data.components)
    if (!layout.ok) return c.json({ error: layout.error }, 400)
    body = { components: layout.components }
  } else {
    body = { content: parsed.data.content }
  }

  const user = c.get('user')
  return respond(
    c,
    await broadcast({
      ...body,
      channelId: parsed.data.channelId,
      actor: { id: user.id, name: user.username },
      source: 'dashboard',
    }),
  )
})

api.get('/birthdays', async (c) => respond(c, await getBirthdayOverview()))

/** How far ahead Overview looks, and how many it lists. */
const UPCOMING_DAYS = 30
const UPCOMING_LIMIT = 5

api.get('/birthdays/upcoming', async (c) =>
  respond(c, await getUpcomingBirthdays(UPCOMING_DAYS, UPCOMING_LIMIT)),
)

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
  after: z.coerce.number().int().nonnegative().optional(),
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
  /** A number of days, or `all` for everything recorded. */
  days: z
    .union([z.literal('all'), z.coerce.number().int().min(1).max(MAX_ACTIVITY_DAYS)])
    .default(7)
    .transform((days) => (days === 'all' ? null : days)),
})

api.get('/activity', async (c) => {
  const parsed = activityQuerySchema.safeParse(c.req.query())
  if (!parsed.success) return c.json({ error: 'Invalid period.' }, 400)
  return respond(c, await getActivityOverview(parsed.data.days))
})

/** Daily hours in voice, gaming and listening for the last 4 weeks, for Overview's charts. */
api.get('/activity/daily', (c) => respond(c, getDailyTrends()))

const gamePlayersQuerySchema = activityQuerySchema.extend({
  name: z.string().trim().min(1).max(200),
})

api.get('/activity/game', async (c) => {
  const parsed = gamePlayersQuerySchema.safeParse(c.req.query())
  if (!parsed.success) return c.json({ error: 'A game name and a valid period are required.' }, 400)
  return respond(c, await getGamePlayers(parsed.data.name, parsed.data.days))
})

const gameRoleSchema = z.object({
  name: z.string().trim().min(1).max(200),
  roleId: snowflake.nullable(),
})

/** Every game and the role its game nights ping, for the Game nights page. */
api.get('/activity/game/roles', requireAdmin, (c) => respond(c, getGameNightRoles()))

/** The role pinged when a game night of this game starts, set from Game nights. */
api.put('/activity/game/role', requireAdmin, async (c) => {
  const parsed = gameRoleSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success)
    return c.json({ error: 'A game name and a role (or null) are required.' }, 400)

  const { name, roleId } = parsed.data
  const guild = await getGuild()
  const role = roleId ? guild.roles.cache.get(roleId) : null
  if (roleId && !role) return c.json({ error: 'That role no longer exists.' }, 404)

  const before = getGameRole(name)
  setGameRole(name, roleId)

  if (before !== roleId) {
    const user = c.get('user')
    recordAudit({
      action: 'gamenight.role',
      source: 'dashboard',
      actorId: user.id,
      actorName: user.username,
      targetId: roleId,
      targetName: role ? `@${role.name}` : null,
      detail: { game: name, from: before, to: roleId },
    })
  }
  return c.json({ name, roleId })
})

const trackListenersQuerySchema = activityQuerySchema.extend({
  id: z.string().trim().min(1).max(100),
})

api.get('/activity/track', async (c) => {
  const parsed = trackListenersQuerySchema.safeParse(c.req.query())
  if (!parsed.success) return c.json({ error: 'A track and a valid period are required.' }, 400)
  return respond(c, await getTrackListeners(parsed.data.id, parsed.data.days))
})

api.get('/voice', async (c) => {
  const parsed = activityQuerySchema.safeParse(c.req.query())
  if (!parsed.success) return c.json({ error: 'Invalid period.' }, 400)
  return respond(c, await getVoiceOverview(parsed.data.days))
})

/** How long Vivy's numbers are cached; music doesn't need to be counted to the second. */
const VIVY_TTL_SECONDS = 60

/** What Vivy, the music bot, played; `{ enabled: false }` when it isn't connected. */
api.get('/activity/vivy', async (c) => {
  const parsed = activityQuerySchema.safeParse(c.req.query())
  if (!parsed.success) return c.json({ error: 'Invalid period.' }, 400)
  if (!isVivyEnabled()) return c.json({ enabled: false })

  const days = parsed.data.days
  try {
    const music = await cached(`vivy:music:${days ?? 'all'}`, VIVY_TTL_SECONDS, () =>
      getVivyMusic(days),
    )
    return c.json({ enabled: true, ...music })
  } catch (error) {
    logger('vivy')
      .warning`Vivy's stats unavailable: ${error instanceof Error ? error.message : error}`
    return c.json({ error: "Couldn't reach Vivy's stats." }, 503)
  }
})

const heatmapQuerySchema = activityQuerySchema.extend({ kind: z.enum(['voice', 'games', 'music']) })

/** When the server is in voice, playing or listening, by weekday and hour, for the heatmaps. */
api.get('/activity/heatmap', (c) => {
  const parsed = heatmapQuerySchema.safeParse(c.req.query())
  if (!parsed.success)
    return c.json({ error: 'A kind (voice, games or music) and a valid period are required.' }, 400)
  return respond(c, getHeatmap(parsed.data.kind, parsed.data.days))
})

const memberVoiceQuerySchema = activityQuerySchema.extend({ id: snowflake })

api.get('/voice/member', async (c) => {
  const parsed = memberVoiceQuerySchema.safeParse(c.req.query())
  if (!parsed.success) return c.json({ error: 'A member ID and a valid period are required.' }, 400)
  return respond(c, await getMemberVoice(parsed.data.id, parsed.data.days))
})
