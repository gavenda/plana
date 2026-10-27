import { InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js'

import { renderStats } from '../../discord/stats'
import { tl } from '../../i18n'
import type { AppChatInputCommand } from './chat-input-command'

/** Matches the dashboard's default period on a member's page. */
const DEFAULT_DAYS = 30

/** 0 stands for all time, since a choice can't be null. */
const PERIODS = [
  { name: 'Last 7 days', value: 7 },
  { name: 'Last 30 days', value: 30 },
  { name: 'Last 90 days', value: 90 },
  { name: 'All time', value: 0 },
]

export const statsCommand: AppChatInputCommand = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Show time in voice, games and music for a member')
    .setContexts(InteractionContextType.Guild)
    .addUserOption((option) => option.setName('member').setDescription('Defaults to you'))
    .addIntegerOption((option) =>
      option
        .setName('period')
        .setDescription('How far back to count. Defaults to the last 30 days.')
        .addChoices(PERIODS),
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
