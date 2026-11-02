import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  PermissionFlagsBits,
  TextDisplayBuilder,
  type ButtonInteraction,
  type Guild,
} from 'discord.js'

import { recordAudit } from '../db/audit'
import {
  cancelGameNightPost,
  endGameNightPost,
  getGameNightPost,
  getGameRole,
  lastGameNight,
  listGameNightAttendees,
  listGameNightHistory,
  listGameNightResponses,
  listOpenGameNightPosts,
  markGameNight,
  markGameNightReminded,
  saveGameNightPost,
  setGameNightVoiceChannel,
  toggleGameNightResponse,
  type GameNightPost,
  type GameNightResponse,
} from '../db/game-nights'
import { getSettings } from '../db/settings'
import { listChannelMembersBetween } from '../db/voice'
import { env } from '../env'
import { DEFAULT_LOCALE, t, tl, tlList } from '../i18n'
import { notify } from '../live'
import { logger } from '../logging'
import { isStaff } from '../utils/is-administrator'
import { describe, memberActivityNow, type ActivityMember } from './activity'
import type { AnnouncementComponents } from './components'
import { gameEmoji } from './game-emojis'
import { gameIconUrl } from './game-icons'
import { getGuild, isReady } from './client'
import { encodeGameNightId, type GameNightAction } from './ids'
import { err, ok, primeMemberCache, type Result } from './service'
import { membersInVoice } from './voice'

const log = logger('game-nights')

/** How often voice channels are checked for a game night. */
export const GAME_NIGHT_CHECK_INTERVAL_MS = 30_000

/** Players used when no minimum is set. */
export const DEFAULT_GAME_NIGHT_PLAYERS = 3

/** How long a group must keep playing together before it is announced, so a quick check-in isn't. */
const HOLD_MS = 5 * 60_000

/** A game is announced at most this often per voice channel, so a dropped connection doesn't repeat it. */
const COOLDOWN_MS = 4 * 60 * 60_000

/** How long nobody may be playing before a game night ends, so a dropped connection or a game restart doesn't end it. */
const END_GRACE_MS = 5 * 60_000

/** How long before a planned night its role is pinged. */
const REMIND_BEFORE_MS = 15 * 60_000

/** A planned night nobody has gathered for this long after it was due to start is closed. */
const NO_SHOW_MS = 60 * 60_000

/** How far ahead a game night can be planned. */
export const MAX_PLAN_DAYS = 14

/** Planned nights one member can have waiting at once. */
const MAX_PLANNED_PER_HOST = 3

/** Since when each group (voice channel and game) has had enough players, keyed `channel\ngame`. */
const forming = new Map<string, number>()

/** Since when nobody has been playing each open game night, by its message ID. */
const emptySince = new Map<string, number>()

let running = false

const keyOf = (channelId: string, game: string) => `${channelId}\n${game}`

/** Names listed per answer before the rest are counted, keeping the message under Discord's limit. */
const MAX_NAMES = 25

function buttons(planned: boolean): ActionRowBuilder<ButtonBuilder> {
  const lng = DEFAULT_LOCALE
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(encodeGameNightId('in'))
      .setLabel(t('game_night.button_in', { lng }))
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(encodeGameNightId('out'))
      .setLabel(t('game_night.button_out', { lng }))
      .setStyle(ButtonStyle.Secondary),
  )
  if (planned) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(encodeGameNightId('cancel'))
        .setLabel(t('game_night.button_cancel', { lng }))
        .setStyle(ButtonStyle.Danger),
    )
  }
  return row
}

/** Mentions of the members; the message's allowed mentions keep them from pinging anyone. */
function mentionList(memberIds: string[]): string {
  const lng = DEFAULT_LOCALE
  const shown = memberIds.slice(0, MAX_NAMES).map((id) => `<@${id}>`)
  const rest = memberIds.length - shown.length
  if (rest > 0) shown.push(t('game_night.more', { lng, count: rest }))
  return new Intl.ListFormat(lng, { type: 'conjunction' }).format(shown)
}

/** Who is joining and who declined; empty while nobody has answered. */
function answerLines(messageId: string): string[] {
  const lng = DEFAULT_LOCALE
  const responses = listGameNightResponses(messageId)
  const joining = responses.filter((row) => row.response === 'in').map((row) => row.memberId)
  const declined = responses.filter((row) => row.response === 'out').map((row) => row.memberId)

  const lines: string[] = []
  if (joining.length > 0) lines.push(t('game_night.joining', { lng, names: mentionList(joining) }))
  if (declined.length > 0)
    lines.push(t('game_night.declined', { lng, names: mentionList(declined) }))
  return lines
}

/** How it ended: who came, when, and how many who said they'd come did. */
function endLines(post: GameNightPost): string[] {
  const lng = DEFAULT_LOCALE
  if (post.cancelledBy) return [t('game_night.cancelled', { lng, by: `<@${post.cancelledBy}>` })]

  const attendees = listGameNightAttendees(post.messageId)
  if (attendees.length === 0 && post.scheduledFor != null) return [t('game_night.no_show', { lng })]

  const lines: string[] = []
  if (attendees.length > 0) lines.push(t('game_night.came', { lng, names: mentionList(attendees) }))

  const came = new Set(attendees)
  const joining = listGameNightResponses(post.messageId).filter((row) => row.response === 'in')
  let ended = t('game_night.ended', { lng, at: Math.floor((post.endedAt ?? 0) / 1000) })
  if (joining.length > 0) {
    const showed = joining.filter((row) => came.has(row.memberId)).length
    ended += ` ${t('game_night.showed_up', { lng, showed, total: joining.length })}`
  }
  lines.push(ended)
  return lines
}

/**
 * The announcement as a Components V2 message: what started it, then the answers so far and
 * the buttons. Rebuilt whole on every answer. Once it has ended the buttons are gone, and it
 * says who came.
 */
function buildGameNight(
  post: GameNightPost | { messageId: null; content: string; planned: boolean },
): AnnouncementComponents {
  const lng = DEFAULT_LOCALE
  const intro = new TextDisplayBuilder().setContent(post.content)

  if (post.messageId === null) {
    return [
      intro,
      new TextDisplayBuilder().setContent(t('game_night.prompt', { lng })),
      buttons(post.planned),
    ]
  }

  const answers = answerLines(post.messageId)
  if (post.endedAt != null) {
    return [intro, new TextDisplayBuilder().setContent([...answers, ...endLines(post)].join('\n'))]
  }

  return [
    intro,
    new TextDisplayBuilder().setContent(
      answers.length > 0 ? answers.join('\n') : t('game_night.prompt', { lng }),
    ),
    buttons(post.scheduledFor != null),
  ]
}

/**
 * What to call a group that forms at this time, by the hour in the bot's time zone (the one
 * birthdays and the recap use): a morning or afternoon grind, or a game night from 18:00 to 05:00.
 */
export function sessionPeriod(
  now: number,
  timeZone: string = env.TIMEZONE,
): 'morning' | 'afternoon' | 'night' {
  const hour =
    Number(
      new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(now),
    ) % 24
  if (hour >= 5 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 18) return 'afternoon'
  return 'night'
}

/** Who is playing what in each voice channel right now, keyed `channel\ngame`. */
function playingNow(): Map<string, { channelId: string; game: string; memberIds: string[] }> {
  const groups = new Map<string, { channelId: string; game: string; memberIds: string[] }>()
  for (const [channelId, memberIds] of membersInVoice()) {
    for (const memberId of memberIds) {
      for (const game of memberActivityNow(memberId).games.keys()) {
        const key = keyOf(channelId, game)
        const group = groups.get(key) ?? { channelId, game, memberIds: [] }
        group.memberIds.push(memberId)
        groups.set(key, group)
      }
    }
  }
  return groups
}

/** The voice channel where the most people are playing a game, or null if nobody is. */
function busiestChannel(playing: ReturnType<typeof playingNow>, game: string): string | null {
  let best: { channelId: string; count: number } | null = null
  for (const group of playing.values()) {
    if (group.game !== game) continue
    if (!best || group.memberIds.length > best.count) {
      best = { channelId: group.channelId, count: group.memberIds.length }
    }
  }
  return best?.channelId ?? null
}

/**
 * Follows each open game night. A planned one pings its role shortly before it starts, then
 * takes the voice channel where people gather to play it. Any game night ends once nobody in its
 * voice channel has been playing its game for a few minutes: the buttons come off, and the post
 * says who came.
 */
async function followGameNights(
  now: number,
  playing: ReturnType<typeof playingNow>,
): Promise<void> {
  const open = listOpenGameNightPosts()
  const openIds = new Set(open.map((post) => post.messageId))
  for (const id of emptySince.keys()) if (!openIds.has(id)) emptySince.delete(id)

  for (let post of open) {
    if (post.scheduledFor != null) {
      if (post.remindedAt == null && now >= post.scheduledFor - REMIND_BEFORE_MS) {
        markGameNightReminded(post.messageId, now)
        // Too late to be "starting soon" after the bot was down; skip the ping.
        if (now < post.scheduledFor + REMIND_BEFORE_MS) await remindPlanned(post)
      }
      if (now < post.scheduledFor) continue

      if (!post.voiceChannelId) {
        const channelId = busiestChannel(playing, post.game)
        if (!channelId) {
          if (now - post.scheduledFor >= NO_SHOW_MS) await finish(post, now)
          continue
        }
        setGameNightVoiceChannel(post.messageId, channelId)
        post = { ...post, voiceChannelId: channelId }
        notify('gamenights')
      }
    }

    if (playing.has(keyOf(post.voiceChannelId!, post.game))) {
      emptySince.delete(post.messageId)
      continue
    }
    const since = emptySince.get(post.messageId)
    if (since == null) {
      emptySince.set(post.messageId, now)
      continue
    }
    if (now - since < END_GRACE_MS) continue

    emptySince.delete(post.messageId)
    await finish(post, since)
  }
}

/** When a game night's attendance starts counting: a planned one, from its ping. */
function startOf(post: GameNightPost): number {
  return post.scheduledFor != null ? post.scheduledFor - REMIND_BEFORE_MS : post.postedAt
}

/** Ends a game night at `endedAt`, records who came, and updates its post. */
async function finish(post: GameNightPost, endedAt: number): Promise<void> {
  const attendees = post.voiceChannelId
    ? listChannelMembersBetween(post.voiceChannelId, startOf(post), endedAt)
    : []
  // Mark first: a failed edit leaves the buttons up rather than retrying every 30 seconds.
  endGameNightPost(post.messageId, endedAt, attendees)
  notify('gamenights')
  await editPost({ ...post, endedAt })
  log.info`ended the ${post.game} night with ${attendees.length} there`
}

async function textChannel(guild: Guild, channelId: string) {
  const channel =
    guild.channels.cache.get(channelId) ?? (await guild.channels.fetch(channelId).catch(() => null))
  return channel?.isTextBased() ? channel : null
}

async function editPost(post: GameNightPost): Promise<void> {
  try {
    const channel = await textChannel(await getGuild(), post.channelId)
    if (!channel) return
    await channel.messages.edit(post.messageId, {
      components: buildGameNight(post),
      allowedMentions: { parse: [] },
    })
  } catch (error) {
    log.warning`could not update the ${post.game} night post: ${error}`
  }
}

/** "Starting soon", as a reply to the plan: pings the game's role and everyone who said they're in. */
async function remindPlanned(post: GameNightPost): Promise<void> {
  try {
    const guild = await getGuild()
    const channel = await textChannel(guild, post.channelId)
    if (!channel) return

    const lng = DEFAULT_LOCALE
    const roleId = getGameRole(post.game)
    const role = roleId ? guild.roles.cache.get(roleId) : undefined
    const joining = listGameNightResponses(post.messageId)
      .filter((row) => row.response === 'in')
      .map((row) => row.memberId)
      .slice(0, MAX_NAMES)

    const pings = [role?.toString(), ...joining.map((id) => `<@${id}>`)].filter(Boolean)
    const lines = [
      t('game_night.soon_title', { lng }),
      t('game_night.soon', {
        lng,
        game: post.game,
        at: Math.floor(post.scheduledFor! / 1000),
      }),
    ]
    if (pings.length > 0) lines.push('', pings.join(' '))

    await channel.send({
      content: lines.join('\n'),
      reply: { messageReference: post.messageId, failIfNotExists: false },
      allowedMentions: { parse: [], roles: role ? [role.id] : [], users: joining },
    })
  } catch (error) {
    log.warning`could not ping for the ${post.game} night: ${error}`
  }
}

/**
 * Announces a game night once enough people in one voice channel have been playing the same
 * game together for a few minutes, and follows open ones until they end. Safe to call as often
 * as you like.
 */
export async function checkGameNights(now = Date.now()): Promise<void> {
  if (running || !isReady()) return
  running = true

  try {
    const playing = playingNow()
    await followGameNights(now, playing)

    const { gameNightChannelId: channelId, gameNightMinPlayers } = getSettings()
    if (!channelId) {
      forming.clear()
      return
    }

    const minPlayers = gameNightMinPlayers ?? DEFAULT_GAME_NIGHT_PLAYERS
    const groups = new Map([...playing].filter(([, group]) => group.memberIds.length >= minPlayers))

    // A group that dropped below the minimum starts its wait over.
    for (const key of forming.keys()) if (!groups.has(key)) forming.delete(key)

    // A game planned for about now already has its post.
    const planned = new Set(
      listOpenGameNightPosts()
        .filter((post) => post.scheduledFor != null && post.scheduledFor - REMIND_BEFORE_MS <= now)
        .map((post) => post.game),
    )

    for (const [key, group] of groups) {
      const since = forming.get(key)
      if (since == null) {
        forming.set(key, now)
        continue
      }
      if (now - since < HOLD_MS) continue
      if (planned.has(group.game)) continue

      const last = lastGameNight(group.channelId, group.game)
      if (last != null && now - last < COOLDOWN_MS) continue

      await announce(channelId, group, now)
    }
  } catch (error) {
    log.error`check failed: ${error}`
  } finally {
    running = false
  }
}

/** The game night channel, if it's set and the bot can post in it. */
async function announceChannel(guild: Guild) {
  const channelId = getSettings().gameNightChannelId
  if (!channelId) return { ok: false as const, reason: 'off' as const }
  const channel = await textChannel(guild, channelId)
  if (!channel) {
    log.warning`the configured game night channel no longer exists`
    return { ok: false as const, reason: 'missing' as const, channelId }
  }
  const me = guild.members.me ?? (await guild.members.fetchMe())
  const canSend = channel
    .permissionsFor(me)
    ?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])
  if (!canSend) {
    log.warning`the bot cannot post in #${channel.name}`
    return { ok: false as const, reason: 'no_access' as const, channelId }
  }
  return { ok: true as const, channel }
}

/** The post's first line, with the game's emoji when it has one. */
async function title(game: string, at: number): Promise<string> {
  const lng = DEFAULT_LOCALE
  const emoji = await gameEmoji(game)
  const period = t(`game_night.period_${sessionPeriod(at)}`, { lng })
  return emoji
    ? t('game_night.title_emoji', { lng, game, emoji, period })
    : t('game_night.title', { lng, game, period })
}

async function announce(
  channelId: string,
  group: { channelId: string; game: string; memberIds: string[] },
  now: number,
): Promise<void> {
  const guild = await getGuild()
  const target = await announceChannel(guild)
  if (!target.ok) return
  const { channel } = target

  const lng = DEFAULT_LOCALE
  const roleId = getGameRole(group.game)
  const role = roleId ? guild.roles.cache.get(roleId) : undefined
  const voice = guild.channels.cache.get(group.channelId)

  const players = new Intl.ListFormat(lng, { type: 'conjunction' }).format(
    group.memberIds.map((id) => `<@${id}>`),
  )
  const intros = tlList('game_night.intros', lng)
  const intro = intros[Math.floor(Math.random() * intros.length)] ?? ''

  const lines = [
    await title(group.game, now),
    intro,
    t('game_night.trigger', {
      lng,
      count: group.memberIds.length,
      players,
      game: group.game,
      channel: `<#${group.channelId}>`,
    }),
  ]
  let content = lines.filter(Boolean).join('\n')
  // A blank line sets the ping apart from the text above it.
  if (role) content += `\n\n${t('game_night.ping', { lng, role: role.toString() })}`

  // Mark first: a failed send waits out the cooldown rather than retrying every 30 seconds.
  markGameNight(group.channelId, group.game, now)

  const message = await channel.send({
    components: buildGameNight({ messageId: null, content, planned: false }),
    flags: MessageFlags.IsComponentsV2,
    // Names the players without pinging them; only the game's role is pinged.
    allowedMentions: { parse: [], roles: role ? [role.id] : [] },
  })

  saveGameNightPost({
    messageId: message.id,
    channelId: channel.id,
    voiceChannelId: group.channelId,
    game: group.game,
    content,
    postedAt: now,
  })
  notify('gamenights')

  recordAudit({
    action: 'gamenight.announce',
    source: 'system',
    targetId: channel.id,
    targetName: `#${channel.name}`,
    detail: {
      game: group.game,
      voiceChannelId: group.channelId,
      voiceChannelName: voice?.name ?? null,
      memberNames: group.memberIds.map((id) => guild.members.cache.get(id)?.displayName ?? id),
      roleId: role?.id ?? null,
      messageId: message.id,
    },
  })

  log.info`announced ${group.game} night in #${voice?.name ?? group.channelId}`
}

/**
 * Posts a game night planned for later, with /gamenight plan. Its role is pinged
 * `REMIND_BEFORE_MS` before it starts, or straight away if it starts sooner than that.
 */
export async function planGameNight(input: {
  game: string
  at: number
  host: { id: string; name: string }
  now?: number
}): Promise<Result<{ url: string }>> {
  const now = input.now ?? Date.now()
  if (input.at <= now) return err('invalid_input', 'game_night.plan_past')
  if (input.at - now > MAX_PLAN_DAYS * 86_400_000) {
    return err('invalid_input', 'game_night.plan_too_far', { count: MAX_PLAN_DAYS })
  }
  const waiting = listOpenGameNightPosts().filter((post) => post.hostId === input.host.id).length
  if (waiting >= MAX_PLANNED_PER_HOST) {
    return err('limit_reached', 'game_night.plan_too_many', { count: MAX_PLANNED_PER_HOST })
  }

  const guild = await getGuild()
  const target = await announceChannel(guild)
  if (!target.ok) {
    return target.reason === 'off'
      ? err('not_configured', 'game_night.plan_off')
      : err('channel_not_sendable', 'game_night.plan_no_access', {
          channel: `<#${target.channelId}>`,
        })
  }
  const { channel } = target

  const lng = DEFAULT_LOCALE
  const soon = input.at - now <= REMIND_BEFORE_MS
  const roleId = getGameRole(input.game)
  const role = soon && roleId ? guild.roles.cache.get(roleId) : undefined
  const at = Math.floor(input.at / 1000)

  let content = [
    await title(input.game, input.at),
    t('game_night.planned_intro', { lng, host: `<@${input.host.id}>` }),
    t('game_night.planned_when', { lng, game: input.game, at }),
  ].join('\n')
  // Starting within the ping window: ping now, as there's no time to wait for it.
  if (role) content += `\n\n${t('game_night.ping', { lng, role: role.toString() })}`

  const message = await channel.send({
    components: buildGameNight({ messageId: null, content, planned: true }),
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [], roles: role ? [role.id] : [] },
  })

  saveGameNightPost({
    messageId: message.id,
    channelId: channel.id,
    voiceChannelId: null,
    game: input.game,
    content,
    postedAt: now,
    scheduledFor: input.at,
    hostId: input.host.id,
    remindedAt: soon ? now : null,
  })
  notify('gamenights')

  recordAudit({
    action: 'gamenight.plan',
    source: 'discord',
    actorId: input.host.id,
    actorName: input.host.name,
    targetId: channel.id,
    targetName: `#${channel.name}`,
    detail: { game: input.game, scheduledFor: input.at, messageId: message.id },
  })

  log.info`${input.host.name} planned a ${input.game} night`
  return ok({ url: message.url })
}

/** Records a click on a game night's buttons and shows it on the announcement. */
export async function respondToGameNight(
  interaction: ButtonInteraction,
  action: GameNightAction,
): Promise<void> {
  const post = getGameNightPost(interaction.message.id)
  if (!post) {
    await interaction.reply({
      content: tl('game_night.unknown', interaction.locale),
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  if (post.endedAt != null) {
    await interaction.update({ components: buildGameNight(post), allowedMentions: { parse: [] } })
    await interaction.followUp({
      content: tl('game_night.ended_reply', interaction.locale),
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  if (action === 'cancel') {
    await cancel(interaction, post)
    return
  }

  const member = interaction.guild?.members.cache.get(interaction.user.id)
  toggleGameNightResponse({
    messageId: post.messageId,
    memberId: interaction.user.id,
    displayName: member?.displayName ?? interaction.user.displayName,
    response: action satisfies GameNightResponse,
    at: Date.now(),
  })
  notify('gamenights')

  await interaction.update({
    components: buildGameNight(post),
    // The answers are mentions, and the role is still in the text: ping none of them.
    allowedMentions: { parse: [] },
  })
}

/** "Cancel" on a planned night: for whoever planned it, and staff. */
async function cancel(interaction: ButtonInteraction, post: GameNightPost): Promise<void> {
  if (post.scheduledFor == null) return
  if (interaction.user.id !== post.hostId && !isStaff(interaction)) {
    await interaction.reply({
      content: tl('game_night.cancel_not_allowed', interaction.locale, {
        host: post.hostId ? `<@${post.hostId}>` : '—',
      }),
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    })
    return
  }

  const now = Date.now()
  cancelGameNightPost(post.messageId, interaction.user.id, now)
  notify('gamenights')
  await interaction.update({
    components: buildGameNight({ ...post, endedAt: now, cancelledBy: interaction.user.id }),
    allowedMentions: { parse: [] },
  })

  recordAudit({
    action: 'gamenight.cancel',
    source: 'discord',
    actorId: interaction.user.id,
    actorName: interaction.user.tag,
    targetId: post.channelId,
    targetName:
      interaction.channel && 'name' in interaction.channel ? `#${interaction.channel.name}` : null,
    detail: { game: post.game, scheduledFor: post.scheduledFor, messageId: post.messageId },
  })
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export type GameNightEntry = {
  messageId: string
  /** The post in Discord. */
  url: string
  game: string
  iconUrl: string | null
  status: 'planned' | 'live' | 'ended' | 'cancelled'
  /** When it started: the plan's time, or when Plana announced it. */
  startsAt: number
  postedAt: number
  endedAt: number | null
  planned: boolean
  host: ActivityMember | null
  voiceChannel: { id: string; name: string } | null
  joining: ActivityMember[]
  declined: ActivityMember[]
  /** Who was in voice for it; empty until it ends. */
  came: ActivityMember[]
  /** How many who said "I'm in" came, once it has ended. */
  showedUp: number | null
}

/** Game nights newest first, a page at a time, for the Game nights page. */
export async function getGameNightHistory(
  before: number | null,
  limit: number,
): Promise<Result<{ entries: GameNightEntry[]; hasMore: boolean }>> {
  await primeMemberCache()
  const guild = await getGuild()
  const members = guild.members.cache
  const now = Date.now()

  const posts = listGameNightHistory(before ?? Number.MAX_SAFE_INTEGER, limit + 1)
  const entries = posts.slice(0, limit).map((post): GameNightEntry => {
    const responses = listGameNightResponses(post.messageId)
    const joining = responses.filter((row) => row.response === 'in').map((row) => row.memberId)
    const declined = responses.filter((row) => row.response === 'out').map((row) => row.memberId)
    const came = listGameNightAttendees(post.messageId)
    const cameSet = new Set(came)
    const voice = post.voiceChannelId ? guild.channels.cache.get(post.voiceChannelId) : undefined

    return {
      messageId: post.messageId,
      url: `https://discord.com/channels/${guild.id}/${post.channelId}/${post.messageId}`,
      game: post.game,
      iconUrl: gameIconUrl(post.game),
      status: post.cancelledBy
        ? 'cancelled'
        : post.endedAt != null
          ? 'ended'
          : post.scheduledFor != null && post.scheduledFor > now
            ? 'planned'
            : 'live',
      startsAt: post.scheduledFor ?? post.postedAt,
      postedAt: post.postedAt,
      endedAt: post.endedAt,
      planned: post.scheduledFor != null,
      host: post.hostId ? describe(members, post.hostId) : null,
      voiceChannel: post.voiceChannelId
        ? { id: post.voiceChannelId, name: voice?.name ?? t('fallback.deleted_channel') }
        : null,
      joining: joining.map((id) => describe(members, id)),
      declined: declined.map((id) => describe(members, id)),
      came: came.map((id) => describe(members, id)),
      showedUp:
        post.endedAt != null && !post.cancelledBy
          ? joining.filter((id) => cameSet.has(id)).length
          : null,
    }
  })

  return ok({ entries, hasMore: posts.length > limit })
}
