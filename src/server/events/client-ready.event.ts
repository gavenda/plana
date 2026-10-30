import { Events } from 'discord.js'

import { getChatInputCommandData } from '../commands/chat-input'
import { startActivityTracking } from '../discord/activity'
import { announceBirthdays, syncBirthdayRole } from '../discord/birthdays'
import { postWeeklyRecap } from '../discord/recap'
import { primeMemberCache } from '../discord/service'
import { remindStaleTriage } from '../discord/triage-reminders'
import { startVoiceTracking } from '../discord/voice'
import { env } from '../env'
import type { AppEvent } from './event'
import { logger } from '../logging'

const activityLog = logger('activity')
const discordLog = logger('discord')
const voiceLog = logger('voice')

export const clientReadyEvent: AppEvent<Events.ClientReady> = {
  event: Events.ClientReady,
  once: true,
  execute: async (_context, client) => {
    discordLog.info`logged in as ${client.user.tag}`

    try {
      const guild = await client.guilds.fetch(env.DISCORD_GUILD_ID)
      const commandData = getChatInputCommandData()
      await guild.commands.set(commandData)
      discordLog.info`registered ${commandData.length} command(s) in ${guild.name}`
    } catch (error) {
      discordLog.error`command registration failed: ${error}`
    }

    // The single Request Guild Members call this process makes.
    await primeMemberCache().catch((error: unknown) => {
      discordLog.error`member cache priming failed: ${error}`
    })

    await startActivityTracking().catch((error: unknown) => {
      activityLog.error`could not start tracking: ${error}`
    })
    await startVoiceTracking().catch((error: unknown) => {
      voiceLog.error`could not start tracking: ${error}`
    })

    // Catches up on a birthday missed while the bot was down.
    await announceBirthdays()
    await syncBirthdayRole()
    // Catches up on a recap missed while the bot was down, if it is still within a day.
    await postWeeklyRecap()
    await remindStaleTriage()
  },
}
