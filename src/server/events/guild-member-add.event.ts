import { Events } from 'discord.js'

import { CacheKey, invalidate } from '../cache'
import { recordAudit } from '../db/audit'
import { announceIfInTriage } from '../discord/service'
import { isConfiguredGuild } from '../utils/is-configured-guild'
import type { AppEvent } from './event'

export const guildMemberAddEvent: AppEvent<Events.GuildMemberAdd> = {
  event: Events.GuildMemberAdd,
  once: false,
  execute: async (_context, member) => {
    if (!isConfiguredGuild(member.guild.id)) return

    await invalidate(CacheKey.pendingMembers)

    recordAudit({
      action: 'server.join',
      source: 'discord',
      targetId: member.id,
      targetName: member.user.tag,
      detail: { accountCreatedAt: member.user.createdTimestamp },
    })

    // Normally the triage role lands later and guildMemberUpdate announces. A server
    // that applies it immediately has it here, with no update to follow.
    await announceIfInTriage(member)
  },
}
