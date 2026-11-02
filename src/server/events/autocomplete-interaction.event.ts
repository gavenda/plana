import { Events } from 'discord.js'

import { chatInputCommands } from '../commands/chat-input'
import type { AppEvent } from './event'
import { logger } from '../logging'

const log = logger('discord')

/** Suggestions as someone types an option, routed to the command's `autocomplete`. */
export const autocompleteInteractionEvent: AppEvent<Events.InteractionCreate> = {
  event: Events.InteractionCreate,
  once: false,
  execute: async (context, interaction) => {
    if (interaction.applicationId !== context.applicationId) return
    if (!interaction.isAutocomplete()) return

    const command = chatInputCommands.find((entry) => entry.name === interaction.commandName)
    if (!command?.autocomplete) return

    try {
      await command.autocomplete(context, interaction)
    } catch (error) {
      log.warning`/${interaction.commandName} autocomplete threw: ${error}`
      // Suggestions time out after 3 seconds; an empty answer beats an error in the box.
      await interaction.respond([]).catch(() => {})
    }
  },
}
