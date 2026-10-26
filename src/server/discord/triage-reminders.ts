import { PermissionFlagsBits, type GuildMember } from 'discord.js'

import { getGuild, isReady } from './client'
import { getAnnouncement, markAnnouncementReminded } from '../db/announcements'
import { recordAudit } from '../db/audit'
import { getSettings } from '../db/settings'
import { DEFAULT_LOCALE, t } from '../i18n'
import { primeMemberCache } from './service'
import { logger } from '../logging'

const log = logger('triage')

const DAY_MS = 86_400_000

/** Lines listed by name in one reminder; the rest are counted, to stay under 2000 characters. */
const MAX_LISTED = 15

type Stale = { member: GuildMember; since: number; cardUrl: string }

let running = false

/**
 * Posts one message in the announcement channel listing members who have held the triage
 * role longer than the configured number of days. Each member is reminded about once per
 * stay in triage: a new card (after they leave and come back) starts the clock again.
 *
 * Only members with a card are considered, since the card's timestamp is when they reached
 * triage. Safe to call as often as you like; members are marked only after the post lands.
 */
export async function remindStaleTriage(): Promise<void> {
  if (running || !isReady()) return
  running = true

  try {
    const { triageReminderDays, triageRoleId, announceChannelId } = getSettings()
    if (!triageReminderDays || !triageRoleId || !announceChannelId) return

    await primeMemberCache()
    const guild = await getGuild()
    const role = guild.roles.cache.get(triageRoleId)
    if (!role) return

    const cutoff = Date.now() - triageReminderDays * DAY_MS
    const stale: Stale[] = []

    for (const member of role.members.values()) {
      if (member.user.bot) continue
      const card = getAnnouncement(member.id)
      if (!card || card.resolvedAt != null || card.remindedAt != null) continue
      if (card.createdAt > cutoff) continue

      stale.push({
        member,
        since: card.createdAt,
        cardUrl: `https://discord.com/channels/${guild.id}/${card.channelId}/${card.messageId}`,
      })
    }
    if (stale.length === 0) return

    stale.sort((a, b) => a.since - b.since)

    const channel =
      guild.channels.cache.get(announceChannelId) ??
      (await guild.channels.fetch(announceChannelId).catch(() => null))

    if (!channel?.isTextBased()) {
      log.warning`the configured announcement channel no longer exists`
      return
    }

    const me = guild.members.me ?? (await guild.members.fetchMe())
    const canSend = channel
      .permissionsFor(me)
      ?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])

    if (!canSend) {
      log.warning`the bot cannot post reminders in #${channel.name}`
      return
    }

    const lng = guild.preferredLocale || DEFAULT_LOCALE
    const lines = [
      t('triage.reminder_title', { lng, count: stale.length, days: triageReminderDays }),
      ...stale.slice(0, MAX_LISTED).map(({ member, since, cardUrl }) =>
        t('triage.reminder_line', {
          lng,
          member: member.toString(),
          since: `<t:${Math.floor(since / 1000)}:R>`,
          url: cardUrl,
        }),
      ),
    ]
    if (stale.length > MAX_LISTED) {
      lines.push(t('triage.reminder_more', { lng, count: stale.length - MAX_LISTED }))
    }

    const message = await channel.send({
      content: lines.join('\n'),
      // A nudge for staff, not a ping for the people still waiting.
      allowedMentions: { parse: [] },
    })

    for (const { member } of stale) markAnnouncementReminded(member.id)

    recordAudit({
      action: 'triage.remind',
      source: 'system',
      targetId: channel.id,
      targetName: `#${channel.name}`,
      detail: {
        days: triageReminderDays,
        memberIds: stale.map(({ member }) => member.id),
        memberNames: stale.map(({ member }) => member.displayName),
        messageId: message.id,
      },
    })

    log.info`reminded staff about ${stale.length} waiting member(s)`
  } catch (error) {
    log.error`reminder failed: ${error}`
  } finally {
    running = false
  }
}
