import {
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  InteractionContextType,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js'

import { getBirthday } from '../../db/birthdays'
import { BIRTHDAY_DAY_ID, BIRTHDAY_MONTH_ID, encodeBirthdayId } from '../../discord/ids'
import { t, tl, tlList } from '../../i18n'
import type { AppUserCommand } from './user-command'

/** Discord's limit on a modal title. */
const MODAL_TITLE_LIMIT = 45

export const setBirthdayCommand: AppUserCommand = {
  name: () => t('command.set_birthday.name'),
  data: () =>
    new ContextMenuCommandBuilder()
      .setName(t('command.set_birthday.name'))
      .setType(ApplicationCommandType.User)
      .setContexts(InteractionContextType.Guild)
      // Administrators only by default; a server can open it to other roles under
      // Server Settings → Integrations, and Discord enforces that for the form too.
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .toJSON(),

  execute: async (_context, interaction) => {
    const locale = interaction.locale
    const user = interaction.targetUser

    if (user.bot) {
      await interaction.reply({
        content: tl('reply.birthday_bot', locale),
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    // Start from the date already saved, so a correction is one change.
    const current = getBirthday(user.id)
    const member = interaction.targetMember
    const name = member && 'displayName' in member ? member.displayName : user.displayName

    const month = new StringSelectMenuBuilder()
      .setCustomId(BIRTHDAY_MONTH_ID)
      .setRequired(true)
      .addOptions(
        tlList('months', locale).map((label, index) => ({
          label,
          value: String(index + 1),
          default: current?.month === index + 1,
        })),
      )

    const day = new TextInputBuilder()
      .setCustomId(BIRTHDAY_DAY_ID)
      .setStyle(TextInputStyle.Short)
      .setMinLength(1)
      .setMaxLength(2)
      .setRequired(true)
    if (current) day.setValue(String(current.day))

    await interaction.showModal(
      new ModalBuilder()
        .setCustomId(encodeBirthdayId(user.id))
        .setTitle(
          tl('command.set_birthday.modal_title', locale, { member: name }).slice(
            0,
            MODAL_TITLE_LIMIT,
          ),
        )
        .addLabelComponents(
          new LabelBuilder()
            .setLabel(tl('command.set_birthday.month_label', locale))
            .setStringSelectMenuComponent(month),
          new LabelBuilder()
            .setLabel(tl('command.set_birthday.day_label', locale))
            .setTextInputComponent(day),
        ),
    )
  },
}
