import { InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js'

import { suggestGames } from '../../db/activity'
import { today } from '../../discord/birthdays'
import { planGameNight } from '../../discord/game-nights'
import { env } from '../../env'
import { DEFAULT_LOCALE, t, tl, tlList } from '../../i18n'
import { zonedTime } from '../../utils/zoned-time'
import type { AppChatInputCommand } from './chat-input-command'

/** Games suggested as you type come from this far back. */
const SUGGEST_DAYS = 90

/** Discord shows at most 25 suggestions. */
const SUGGESTIONS = 25

const WEEKDAY_VALUES = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

/** "21:00", "21.30", "9pm", "9:30 pm": hour and minute, or null. */
export function parseClock(value: string): { hour: number; minute: number } | null {
  const match = /^(\d{1,2})(?:[:.h](\d{2}))?\s*(am|pm)?$/i.exec(value.trim())
  if (!match) return null
  let hour = Number(match[1])
  const minute = Number(match[2] ?? 0)
  const meridiem = match[3]?.toLowerCase()
  if (minute > 59) return null
  if (meridiem) {
    if (hour < 1 || hour > 12) return null
    hour = (hour % 12) + (meridiem === 'pm' ? 12 : 0)
  } else if (hour > 23 || (match[2] == null && value.trim().length > 2)) {
    return null
  }
  return { hour, minute }
}

/**
 * When a plan for this clock time and day starts, in the bot's time zone. With no day, the next
 * time the clock reads it; with a weekday, the next such day (today if it's still ahead).
 * Null when today's time has passed.
 */
export function resolveStart(
  clock: { hour: number; minute: number },
  day: string | null,
  now: number,
  timeZone: string = env.TIMEZONE,
): number | null {
  const date = today(timeZone, new Date(now))
  const at = (offset: number) =>
    zonedTime({ ...date, day: date.day + offset }, clock.hour, clock.minute, timeZone)

  if (day === 'tomorrow') return at(1)
  if (day === 'today') return at(0) > now ? at(0) : null

  const weekday = WEEKDAY_VALUES.indexOf(day as (typeof WEEKDAY_VALUES)[number])
  if (weekday >= 0) {
    // 0 for Monday, as WEEKDAY_VALUES is.
    const current = (new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay() + 6) % 7
    const offset = (weekday - current + 7) % 7
    return at(offset) > now ? at(offset) : at(offset + 7)
  }
  return at(0) > now ? at(0) : at(1)
}

export const gamenightCommand: AppChatInputCommand = {
  name: 'gamenight',
  data: () =>
    new SlashCommandBuilder()
      .setName('gamenight')
      .setDescription(t('command.gamenight.description'))
      .setContexts(InteractionContextType.Guild)
      .addSubcommand((sub) =>
        sub
          .setName('plan')
          .setDescription(t('command.gamenight.plan_description'))
          .addStringOption((option) =>
            option
              .setName('game')
              .setDescription(t('command.gamenight.game_description'))
              .setRequired(true)
              .setMaxLength(100)
              .setAutocomplete(true),
          )
          .addStringOption((option) =>
            option
              .setName('time')
              .setDescription(t('command.gamenight.time_description'))
              .setRequired(true)
              .setMaxLength(10),
          )
          .addStringOption((option) =>
            option
              .setName('day')
              .setDescription(t('command.gamenight.day_description'))
              .addChoices(
                { name: t('command.gamenight.day_today'), value: 'today' },
                { name: t('command.gamenight.day_tomorrow'), value: 'tomorrow' },
                ...tlList('command.gamenight.weekdays', DEFAULT_LOCALE).map((name, index) => ({
                  name,
                  value: WEEKDAY_VALUES[index]!,
                })),
              ),
          ),
      )
      .toJSON(),

  autocomplete: async (_context, interaction) => {
    const typed = interaction.options.getFocused().trim()
    const since = Date.now() - SUGGEST_DAYS * 86_400_000
    await interaction.respond(
      suggestGames(typed, since, SUGGESTIONS).map((game) => ({
        name: game.slice(0, 100),
        value: game.slice(0, 100),
      })),
    )
  },

  execute: async (_context, interaction) => {
    const locale = interaction.locale
    const reply = (content: string) =>
      interaction.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } })

    const game = interaction.options.getString('game', true).trim()
    const time = interaction.options.getString('time', true)
    const day = interaction.options.getString('day')

    const clock = parseClock(time)
    if (!clock) {
      await reply(tl('game_night.plan_bad_time', locale, { time }))
      return
    }
    const now = Date.now()
    const at = resolveStart(clock, day, now)
    if (at == null) {
      await reply(tl('game_night.plan_past', locale))
      return
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral })
    const result = await planGameNight({
      game,
      at,
      host: { id: interaction.user.id, name: interaction.user.tag },
      now,
    })
    await interaction.editReply({
      content: result.ok
        ? tl('game_night.plan_done', locale, { url: result.data.url })
        : `⚠️ ${tl(result.key, locale, result.params)}`,
      allowedMentions: { parse: [] },
    })
  },
}
