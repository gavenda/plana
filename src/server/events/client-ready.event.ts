import { Events } from 'discord.js'

import { chatInputCommandData } from '../commands/chat-input'
import { primeMemberCache } from '../discord/service'
import { env } from '../env'
import type { AppEvent } from './event'

export const clientReadyEvent: AppEvent<Events.ClientReady> = {
  event: Events.ClientReady,
  once: true,
  execute: async (_context, client) => {
    console.log(`[discord] logged in as ${client.user.tag}`)

    try {
      const guild = await client.guilds.fetch(env.DISCORD_GUILD_ID)
      await guild.commands.set(chatInputCommandData)
      console.log(`[discord] registered ${chatInputCommandData.length} command(s) in ${guild.name}`)
    } catch (error) {
      console.error('[discord] command registration failed:', error)
    }

    // The single Request Guild Members call this process makes.
    await primeMemberCache().catch((error: unknown) => {
      console.error('[discord] member cache priming failed:', error)
    })
  },
}
