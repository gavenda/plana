import {
  escapeMarkdown,
  PermissionFlagsBits,
  type GuildMember,
  type PartialGuildMember,
} from 'discord.js'

import { getSettings } from '../db/settings'
import { DEFAULT_LOCALE, t } from '../i18n'
import { logger } from '../logging'

const log = logger('leaves')

/** Posts a note in the leave channel naming a member who just left. Off while it is unset. */
export async function announceLeave(member: GuildMember | PartialGuildMember): Promise<void> {
  try {
    const channelId = getSettings().leaveChannelId
    if (!channelId || member.user.bot) return

    const guild = member.guild
    const channel =
      guild.channels.cache.get(channelId) ??
      (await guild.channels.fetch(channelId).catch(() => null))

    if (!channel?.isTextBased()) {
      log.warning`the configured leave channel no longer exists`
      return
    }

    const me = guild.members.me ?? (await guild.members.fetchMe())
    const canSend = channel
      .permissionsFor(me)
      ?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])

    if (!canSend) {
      log.warning`the bot cannot post in #${channel.name}`
      return
    }

    const name = escapeMarkdown(member.displayName ?? member.user.username)
    await channel.send({
      content: t('leave.announcement', { lng: DEFAULT_LOCALE, name }),
      allowedMentions: { parse: [] },
    })

    log.info`announced ${member.user.username} leaving in #${channel.name}`
  } catch (error) {
    log.error`leave announcement failed: ${error}`
  }
}
