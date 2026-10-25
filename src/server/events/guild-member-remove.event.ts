import { Events } from 'discord.js'

import { CacheKey, invalidate } from '../cache'
import { resolveAnnouncement } from '../db/announcements'
import { removeBirthday } from '../db/birthdays'
import { isConfiguredGuild } from '../utils/is-configured-guild'
import type { AppEvent } from './event'

export const guildMemberRemoveEvent: AppEvent<Events.GuildMemberRemove> = {
  event: Events.GuildMemberRemove,
  once: false,
  execute: async (_context, member) => {
    if (!isConfiguredGuild(member.guild.id)) return

    // Nobody should be wished happy birthday by a server they have left.
    removeBirthday(member.id)
    // Closes their card, so coming back posts a new one and restarts the triage clock.
    resolveAnnouncement(member.id)
    await invalidate(CacheKey.pendingMembers)
  },
}
