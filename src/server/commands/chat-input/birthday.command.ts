import { InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js'

import { getBirthday, isValidBirthday } from '../../db/birthdays'
import {
  daysUntil,
  deleteBirthday,
  formatBirthday,
  listUpcomingBirthdays,
  saveBirthday,
  today,
} from '../../discord/birthdays'
import { getSettings } from '../../db/settings'
import { tl } from '../../i18n'
import type { AppChatInputCommand } from './chat-input-command'

const UPCOMING_LIMIT = 10

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export const birthdayCommand: AppChatInputCommand = {
  data: new SlashCommandBuilder()
    .setName('birthday')
    .setDescription('Share your birthday so the server can celebrate it')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Set or change your birthday. Only the month and day are stored.')
        .addIntegerOption((option) =>
          option
            .setName('month')
            .setDescription('Birth month')
            .setRequired(true)
            .addChoices(MONTHS.map((name, index) => ({ name, value: index + 1 }))),
        )
        .addIntegerOption((option) =>
          option
            .setName('day')
            .setDescription('Day of the month')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(31),
        ),
    )
    .addSubcommand((sub) => sub.setName('remove').setDescription('Forget your birthday'))
    .addSubcommand((sub) =>
      sub
        .setName('show')
        .setDescription("Show a member's birthday")
        .addUserOption((option) => option.setName('member').setDescription('Defaults to you')),
    )
    .addSubcommand((sub) =>
      sub.setName('upcoming').setDescription('List the next birthdays in the server'),
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
              month: MONTHS[month - 1] ?? month,
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
        const self = user.id === interaction.user.id
        const birthday = getBirthday(user.id)

        if (!birthday) {
          await reply(
            self
              ? tl('reply.birthday_none', locale)
              : tl('reply.birthday_none_other', locale, { member: user.toString() }),
          )
          return
        }

        const days = daysUntil(birthday, today())
        await reply(
          tl(days === 0 ? 'reply.birthday_show_today' : 'reply.birthday_show', locale, {
            member: user.toString(),
            date: formatBirthday(birthday, locale),
            count: days,
          }),
        )
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
