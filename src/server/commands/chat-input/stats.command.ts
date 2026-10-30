import { InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js'

import { renderStats } from '../../discord/stats'
import { t, tl } from '../../i18n'
import type { AppChatInputCommand } from './chat-input-command'

/** Matches the dashboard's default period on a member's page. */
const DEFAULT_DAYS = 30

/** 0 stands for all time, since a choice can't be null. */
const periods = () => [
  { name: t('command.stats.period_7'), value: 7 },
  { name: t('command.stats.period_30'), value: 30 },
  { name: t('command.stats.period_90'), value: 90 },
  { name: t('command.stats.period_all'), value: 0 },
]

export const statsCommand: AppChatInputCommand = {
  name: 'stats',
  data: () =>
    new SlashCommandBuilder()
      .setName('stats')
      .setDescription(t('command.stats.description'))
      .setContexts(InteractionContextType.Guild)
      .addUserOption((option) =>
        option.setName('member').setDescription(t('command.stats.member_description')),
      )
      .addIntegerOption((option) =>
        option
          .setName('period')
          .setDescription(t('command.stats.period_description'))
          .addChoices(periods()),
      )
      .toJSON(),

  execute: async (_context, interaction) => {
    const user = interaction.options.getUser('member') ?? interaction.user
    const period = interaction.options.getInteger('period') ?? DEFAULT_DAYS

    if (user.bot) {
      await interaction.reply({
        content: tl('stats.bot', interaction.locale),
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    // Only the person who asked sees it. Loading members the first time can take longer
    // than the 3 seconds Discord waits, so answer first and fill it in after.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })
    await interaction.editReply(
      await renderStats(user.id, period === 0 ? null : period, 'games', interaction.locale),
    )
  },
}
