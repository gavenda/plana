import { DEFAULT_LOCALE, t } from '../i18n'
import { listDueReminders, takeReminder, type Reminder } from '../db/reminders'
import { logger } from '../logging'
import { client, getGuild, isReady } from './client'

const log = logger('reminders')

/** How often due reminders are looked for; they go out within this of their time. */
export const REMINDER_CHECK_INTERVAL_MS = 30_000

/** Sent per check, so a backlog after downtime goes out over a few checks. */
const BATCH = 20

const MINUTE_MS = 60_000
export const MAX_REMINDER_DAYS = 365
export const MAX_REMINDERS_PER_MEMBER = 25

const UNITS: Record<string, number> = {
  w: 7 * 24 * 60 * MINUTE_MS,
  week: 7 * 24 * 60 * MINUTE_MS,
  d: 24 * 60 * MINUTE_MS,
  day: 24 * 60 * MINUTE_MS,
  h: 60 * MINUTE_MS,
  hr: 60 * MINUTE_MS,
  hour: 60 * MINUTE_MS,
  m: MINUTE_MS,
  min: MINUTE_MS,
  minute: MINUTE_MS,
}

/**
 * "2h", "1d 6h", "90m", "1 hour 30 minutes", "1.5h": a length of time in milliseconds, or
 * null if any of it can't be read.
 */
export function parseDuration(value: string): number | null {
  const text = value
    .trim()
    .toLowerCase()
    .replace(/,|\band\b/g, ' ')
  if (!text) return null
  const pattern = /(\d+(?:\.\d+)?)\s*([a-z]+)\s*/gy
  let total = 0
  let match: RegExpExecArray | null
  let consumed = 0
  while ((match = pattern.exec(text))) {
    const unit = UNITS[match[2]!.replace(/s$/, '')] ?? UNITS[match[2]!]
    if (!unit) return null
    total += Number(match[1]) * unit
    consumed = pattern.lastIndex
  }
  if (consumed !== text.length) return null
  return Math.round(total)
}

let running = false

/** Sends every reminder that's due: by DM, or in the channel it was set in if DMs are closed. */
export async function sendDueReminders(now = Date.now()): Promise<void> {
  if (running || !isReady()) return
  running = true
  try {
    for (const due of listDueReminders(now, BATCH)) {
      // Taken first, so a failure never sends the same reminder every 30 seconds.
      const reminder = takeReminder(due.id)
      if (reminder) await deliver(reminder)
    }
  } catch (error) {
    log.error`check failed: ${error}`
  } finally {
    running = false
  }
}

async function deliver(reminder: Reminder): Promise<void> {
  const lng = DEFAULT_LOCALE
  const createdAt = Math.floor(reminder.createdAt / 1000)

  try {
    const user = await client.users.fetch(reminder.memberId)
    await user.send({
      content: t('remind.delivery', {
        lng,
        text: reminder.text,
        createdAt,
        channel: `<#${reminder.channelId}>`,
      }),
      allowedMentions: { parse: [] },
    })
    return
  } catch {
    // DMs closed, or no server in common any more: fall back to the channel.
  }

  try {
    const guild = await getGuild()
    const channel =
      guild.channels.cache.get(reminder.channelId) ??
      (await guild.channels.fetch(reminder.channelId).catch(() => null))
    if (!channel?.isTextBased() || !guild.members.cache.has(reminder.memberId)) {
      log.warning`could not deliver reminder ${reminder.id}: no DM and no channel`
      return
    }
    await channel.send({
      content: t('remind.delivery_channel', {
        lng,
        member: `<@${reminder.memberId}>`,
        text: reminder.text,
        createdAt,
      }),
      allowedMentions: { parse: [], users: [reminder.memberId] },
    })
  } catch (error) {
    log.warning`could not deliver reminder ${reminder.id}: ${error}`
  }
}
