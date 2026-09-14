import { MessageFlags, type RepliableInteraction } from 'discord.js'

import { tl } from '../i18n'

/**
 * Discord shows "the application did not respond" if an interaction is left hanging,
 * so a handler that threw still owes the user a reply.
 */
export async function replyWithError(interaction: RepliableInteraction): Promise<void> {
  const payload = {
    content: tl('reply.error_interaction_execution', interaction.locale),
    flags: MessageFlags.Ephemeral,
  } as const

  await (
    interaction.deferred || interaction.replied
      ? interaction.followUp(payload)
      : interaction.reply(payload)
  ).catch(() => {})
}
