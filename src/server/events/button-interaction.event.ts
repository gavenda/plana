import { Events } from 'discord.js'

import { customIdPrefix } from '../discord/ids'
import { buttonHandlers } from '../handlers/buttons'
import { replyWithError } from '../utils/reply-with-error'
import type { AppEvent } from './event'

export const buttonInteractionEvent: AppEvent<Events.InteractionCreate> = {
  event: Events.InteractionCreate,
  once: false,
  execute: async (context, interaction) => {
    if (interaction.applicationId !== context.applicationId) return
    if (!interaction.isButton()) return

    const prefix = customIdPrefix(interaction.customId)
    const handler = buttonHandlers.find((entry) => entry.customId === prefix)

    if (!handler) {
      console.warn(`[discord] no button handler for "${interaction.customId}"`)
      return
    }

    try {
      await handler.handle(context, interaction)
    } catch (error) {
      console.error(`[discord] button "${interaction.customId}" threw:`, error)
      await replyWithError(interaction)
    }
  },
}
