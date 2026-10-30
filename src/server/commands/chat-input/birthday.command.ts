import { InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js'

import { isValidBirthday } from '../../db/birthdays'
import {
  deleteBirthday,
  describeBirthday,
  formatBirthday,
  listUpcomingBirthdays,
  saveBirthday,
} from '../../discord/birthdays'
import { getSettings } from '../../db/settings'
import { DEFAULT_LOCALE, t, tl, tlList } from '../../i18n'
import type { AppChatInputCommand } from './chat-input-command'

const UPCOMING_LIMIT = 10

const months = (locale = DEFAULT_LOCALE) => tlList('months', locale)

export const birthdayCommand: AppChatInputCommand = {
  name: 'birthday',
  data: () =>
    new SlashCommandBuilder()
      .setName('birthday')
      .setDescription(t('command.birthday.description'))
      .setContexts(InteractionContextType.Guild)
      .addSubcommand((sub) =>
        sub
          .setName('set')
          .setDescription(t('command.birthday.set_description'))
          .addIntegerOption((option) =>
            option
              .setName('month')
              .setDescription(t('command.birthday.month_description'))
              .setRequired(true)
              .addChoices(months().map((name, index) => ({ name, value: index + 1 }))),
          )
          .addIntegerOption((option) =>
            option
              .setName('day')
              .setDescription(t('command.birthday.day_description'))
              .setRequired(true)
              .setMinValue(1)
              .setMaxValue(31),
          ),
      )
      .addSubcommand((sub) =>
        sub.setName('remove').setDescription(t('command.birthday.remove_description')),
      )
      .addSubcommand((sub) =>
        sub
          .setName('show')
          .setDescription(t('command.birthday.show_description'))
          .addUserOption((option) =>
            option.setName('member').setDescription(t('command.birthday.member_description')),
          ),
      )
      .addSubcommand((sub) =>
        sub.setName('upcoming').setDescription(t('command.birthday.upcoming_description')),
      )
      .toJSON(),

  execute: async (_context, interaction) => {
    const locale = interaction.locale
    const reply = (content: string) =>
      interaction.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } })

    switch (interaction.options.getSubcommand()) {
      case 'set': {
        const month = interaction.options.getInteger('month', true)
        const day = interaction.options.getInteger('day', true)

        if (!isValidBirthday(month, day)) {
          await reply(
            tl('reply.birthday_invalid', locale, {
              month: months(locale)[month - 1] ?? month,
              day,
            }),
          )
          return
        }

        const actor = { id: interaction.user.id, name: interaction.user.tag }
        const result = await saveBirthday({
          memberId: interaction.user.id,
          month,
          day,
          actor,
          source: 'discord',
        })
        if (!result.ok) {
          await reply(`⚠️ ${tl(result.key, locale, result.params)}`)
          return
        }

        const date = formatBirthday({ month, day }, locale)
        await reply(
          getSettings().birthdayChannelId
            ? tl('reply.birthday_set', locale, { date })
            : `${tl('reply.birthday_set', locale, { date })}\n-# ${tl('reply.birthday_disabled', locale)}`,
        )
        return
      }

      case 'remove': {
        const result = await deleteBirthday({
          memberId: interaction.user.id,
          actor: { id: interaction.user.id, name: interaction.user.tag },
          source: 'discord',
        })
        await reply(
          result.ok && result.data.removed
            ? tl('reply.birthday_removed', locale)
            : tl('reply.birthday_none', locale),
        )
        return
      }

      case 'show': {
        const user = interaction.options.getUser('member') ?? interaction.user
        await reply(describeBirthday(user.id, interaction.user.id, locale))
        return
      }

      case 'upcoming': {
        const upcoming = await listUpcomingBirthdays(UPCOMING_LIMIT)

        if (upcoming.length === 0) {
          await reply(tl('reply.birthday_upcoming_empty', locale))
          return
        }

        const lines = upcoming.map(({ member, birthday, days }) =>
          tl(
            days === 0 ? 'reply.birthday_upcoming_line_today' : 'reply.birthday_upcoming_line',
            locale,
            {
              member: member.toString(),
              date: formatBirthday(birthday, locale),
              count: days,
            },
          ),
        )

        await reply([tl('reply.birthday_upcoming_title', locale), ...lines].join('\n'))
        return
      }
    }
  },
}
