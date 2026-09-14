import { env } from '../env'

/** The bot is scoped to one server; events from anywhere else are ignored. */
export function isConfiguredGuild(guildId: string): boolean {
  return guildId === env.DISCORD_GUILD_ID
}
