import { Events } from 'discord.js'

import { customIdPrefix } from '../discord/ids'
import { modalSubmitHandlers } from '../handlers/modals'
import { replyWithError } from '../utils/reply-with-error'
import type { AppEvent } from './event'

export const modalSubmitInteractionEvent: AppEvent<Events.InteractionCreate> = {
  event: Events.InteractionCreate,
  once: false,
  execute: async (context, interaction) => {
    if (interaction.applicationId !== context.applicationId) return
    if (!interaction.isModalSubmit()) return

    const prefix = customIdPrefix(interaction.customId)
    const handler = modalSubmitHandlers.find((entry) => entry.customId === prefix)

    if (!handler) {
      console.warn(`[discord] no modal handler for "${interaction.customId}"`)
      return
    }

    try {
      await handler.handle(context, interaction)
    } catch (error) {
      console.error(`[discord] modal "${interaction.customId}" threw:`, error)
      await replyWithError(interaction)
    }
  },
}
