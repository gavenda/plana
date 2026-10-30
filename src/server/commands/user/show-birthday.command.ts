import {
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  InteractionContextType,
  MessageFlags,
} from 'discord.js'

import { describeBirthday } from '../../discord/birthdays'
import { t, tl } from '../../i18n'
import type { AppUserCommand } from './user-command'

/** /birthday show, from a member's Apps menu. */
export const showBirthdayCommand: AppUserCommand = {
  name: () => t('command.show_birthday.name'),
  data: () =>
    new ContextMenuCommandBuilder()
      .setName(t('command.show_birthday.name'))
      .setType(ApplicationCommandType.User)
      .setContexts(InteractionContextType.Guild)
      .toJSON(),

  execute: async (_context, interaction) => {
    const locale = interaction.locale
    const user = interaction.targetUser

    await interaction.reply({
      content: user.bot
        ? tl('reply.birthday_bot', locale)
        : describeBirthday(user.id, interaction.user.id, locale),
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    })
  },
}
