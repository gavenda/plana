import { Events } from 'discord.js'

import { chatInputCommands } from '../commands/chat-input'
import { replyWithError } from '../utils/reply-with-error'
import type { AppEvent } from './event'
import { logger } from '../logging'

const log = logger('discord')

export const chatInputCommandInteractionEvent: AppEvent<Events.InteractionCreate> = {
  event: Events.InteractionCreate,
  once: false,
  execute: async (context, interaction) => {
    if (interaction.applicationId !== context.applicationId) return
    if (!interaction.isChatInputCommand()) return

    const command = chatInputCommands.find((entry) => entry.name === interaction.commandName)

    if (!command) {
      log.warning`no command registered for /${interaction.commandName}`
      return
    }

    try {
      await command.execute(context, interaction)
    } catch (error) {
      log.error`/${interaction.commandName} threw: ${error}`
      await replyWithError(interaction)
    }
  },
}
