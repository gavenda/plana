import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
  time,
  TimestampStyles,
  type InteractionEditReplyOptions,
} from 'discord.js'

import { tl } from '../i18n'
import { clip, duration } from '../utils/format'
import { encodeStatsId, type StatsTab } from './ids'
import { getMemberProfile, type MemberProfile } from './members'

export const STATS_TABS = ['games', 'music', 'voice'] as const satisfies readonly StatsTab[]

const since = (at: number) => time(Math.floor(at / 1000), TimestampStyles.RelativeTime)

/** "3.5" or "120": one decimal under ten hours, as on the dashboard. */
function hours(ms: number, locale: string): string {
  return (ms / 3_600_000).toLocaleString(locale, {
    maximumFractionDigits: ms < 36_000_000 ? 1 : 0,
  })
}

/** Name, dates, what they're doing right now and the totals. Shown above every tab. */
function summary(profile: MemberProfile, locale: string): string[] {
  const { member, voice, games, music } = profile
  const period =
    profile.days == null
      ? tl('stats.period_all', locale)
      : tl('stats.period_days', locale, { count: profile.days })

  const header = [tl('stats.title', locale, { period }), `### ${clip(member.displayName)}`]
  if (!profile.inServer) header.push(tl('stats.left', locale))
  if (profile.joinedAt != null) {
    header.push(tl('stats.joined', locale, { when: since(profile.joinedAt) }))
  }
  if (profile.createdAt != null) {
    header.push(tl('stats.created', locale, { when: since(profile.createdAt) }))
  }

  const now: string[] = []
  if (voice.now) {
    now.push(
      tl('stats.now_voice', locale, {
        channel: clip(voice.now.channel.name),
        when: since(voice.now.since),
      }),
    )
  }
  for (const game of games.top) {
    if (game.playingSince != null) {
      now.push(
        tl('stats.now_game', locale, { game: clip(game.name), when: since(game.playingSince) }),
      )
    }
  }
  if (music.listening) {
    const { track } = music.listening
    now.push(
      tl('stats.now_track', locale, {
        title: clip(track.title),
        artist: track.artist ? tl('stats.by', locale, { artist: clip(track.artist) }) : '',
        when: since(music.listening.since),
      }),
    )
  }

  const totals = [
    tl('stats.totals_title', locale),
    tl('stats.totals', locale, {
      voice: hours(voice.ms, locale),
      games: hours(games.ms, locale),
      plays: music.plays.toLocaleString(locale),
      count: music.plays,
    }),
  ]

  return [
    header.join('\n'),
    ...(now.length > 0 ? [[tl('stats.now_title', locale), ...now].join('\n')] : []),
    totals.join('\n'),
  ]
}

/** The ranked list behind one tab, as the dashboard shows it (up to ten rows). */
function tabSection(profile: MemberProfile, tab: StatsTab, locale: string): string {
  const { voice, games, music } = profile
  const [title, rows] =
    tab === 'games'
      ? [
          tl('stats.games_title', locale, { count: games.count }),
          games.top.map((game) =>
            tl('stats.game_line', locale, {
              game: clip(game.name),
              time: duration(game.ms),
              count: game.sessions,
            }),
          ),
        ]
      : tab === 'music'
        ? [
            tl('stats.music_title', locale, { count: music.count }),
            music.top.map((entry) =>
              tl('stats.track_line', locale, {
                title: clip(entry.track.title),
                artist: entry.track.artist
                  ? tl('stats.by', locale, { artist: clip(entry.track.artist) })
                  : '',
                count: entry.plays,
              }),
            ),
          ]
        : [
            tl('stats.voice_title', locale, { count: voice.sessions }),
            voice.channels.map((channel) =>
              tl('stats.voice_line', locale, {
                channel: clip(channel.name),
                time: duration(channel.ms),
                count: channel.sessions,
              }),
            ),
          ]

  const lines =
    rows.length > 0
      ? rows.map((row, index) => `${index + 1}. ${row}`)
      : [tl(`stats.${tab}_empty`, locale)]
  return [title, ...lines].join('\n')
}

/** Games, Music and Voice. The open tab is highlighted and can't be pressed again. */
function tabButtons(
  memberId: string,
  days: number | null,
  open: StatsTab,
  locale: string,
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    STATS_TABS.map((tab) =>
      new ButtonBuilder()
        .setCustomId(encodeStatsId({ memberId, days, tab }))
        .setLabel(tl(`stats.tab_${tab}`, locale))
        .setStyle(tab === open ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setDisabled(tab === open),
    ),
  )
}

/** The whole reply for one member, period and tab: plain text displays and the tab buttons. */
export async function renderStats(
  memberId: string,
  days: number | null,
  tab: StatsTab,
  locale: string,
): Promise<InteractionEditReplyOptions> {
  const result = await getMemberProfile(memberId, days)
  if (!result.ok) {
    return {
      flags: MessageFlags.IsComponentsV2,
      components: [new TextDisplayBuilder().setContent(tl(result.key, locale, result.params))],
    }
  }

  const { member } = result.data
  const [header, ...rest] = summary(result.data, locale)
  const sections = [...rest, tabSection(result.data, tab, locale)]
  return {
    flags: MessageFlags.IsComponentsV2,
    components: [
      // Who it is, beside their avatar.
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(header))
        .setThumbnailAccessory(
          new ThumbnailBuilder()
            // The profile carries a small avatar for the dashboard's lists; a thumbnail wants more.
            .setURL(member.avatarUrl.replace(/size=\d+/, 'size=256'))
            .setDescription(tl('announcement.avatar_alt', locale, { username: member.username })),
        ),
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large),
      ...sections.map((content) => new TextDisplayBuilder().setContent(content)),
      tabButtons(memberId, days, tab, locale),
    ],
    allowedMentions: { parse: [] },
  }
}
