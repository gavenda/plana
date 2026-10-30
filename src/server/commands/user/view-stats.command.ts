import {
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  InteractionContextType,
  MessageFlags,
} from 'discord.js'

import { renderStats } from '../../discord/stats'
import { t, tl } from '../../i18n'
import type { AppUserCommand } from './user-command'

/** Matches /stats with no period given. */
const DEFAULT_DAYS = 30

/** /stats for a member, from their Apps menu. */
export const viewStatsCommand: AppUserCommand = {
  name: () => t('command.view_stats.name'),
  data: () =>
    new ContextMenuCommandBuilder()
      .setName(t('command.view_stats.name'))
      .setType(ApplicationCommandType.User)
      .setContexts(InteractionContextType.Guild)
      .toJSON(),

  execute: async (_context, interaction) => {
    const user = interaction.targetUser

    if (user.bot) {
      await interaction.reply({
        content: tl('stats.bot', interaction.locale),
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    // Loading members the first time can take longer than the 3 seconds Discord waits.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })
    await interaction.editReply(
      await renderStats(user.id, DEFAULT_DAYS, 'games', interaction.locale),
    )
  },
}
