import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  PermissionFlagsBits,
  TextDisplayBuilder,
  type ButtonInteraction,
} from 'discord.js'

import { recordAudit } from '../db/audit'
import {
  getGameNightPost,
  getGameRole,
  lastGameNight,
  listGameNightResponses,
  markGameNight,
  saveGameNightPost,
  toggleGameNightResponse,
  type GameNightResponse,
} from '../db/game-nights'
import { getSettings } from '../db/settings'
import { DEFAULT_LOCALE, t, tlList } from '../i18n'
import { logger } from '../logging'
import { memberActivityNow } from './activity'
import type { AnnouncementComponents } from './components'
import { gameEmoji } from './game-emojis'
import { getGuild, isReady } from './client'
import { encodeGameNightId } from './ids'
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

/** Since when each group (voice channel and game) has had enough players, keyed `channel\ngame`. */
const forming = new Map<string, number>()

let running = false

const keyOf = (channelId: string, game: string) => `${channelId}\n${game}`

/** Names listed per answer before the rest are counted, keeping the message under Discord's limit. */
const MAX_NAMES = 25

function buttons(): ActionRowBuilder<ButtonBuilder> {
  const lng = DEFAULT_LOCALE
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(encodeGameNightId('in'))
      .setLabel(t('game_night.button_in', { lng }))
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(encodeGameNightId('out'))
      .setLabel(t('game_night.button_out', { lng }))
      .setStyle(ButtonStyle.Secondary),
  )
}

/** Mentions of the members; the message's allowed mentions keep them from pinging anyone. */
function mentionList(memberIds: string[]): string {
  const lng = DEFAULT_LOCALE
  const shown = memberIds.slice(0, MAX_NAMES).map((id) => `<@${id}>`)
  const rest = memberIds.length - shown.length
  if (rest > 0) shown.push(t('game_night.more', { lng, count: rest }))
  return new Intl.ListFormat(lng, { type: 'conjunction' }).format(shown)
}

/** Who is joining and who declined, or a nudge to answer while nobody has. */
function responseText(messageId: string): string {
  const lng = DEFAULT_LOCALE
  const responses = listGameNightResponses(messageId)
  const joining = responses.filter((row) => row.response === 'in').map((row) => row.memberId)
  const declined = responses.filter((row) => row.response === 'out').map((row) => row.memberId)

  const lines: string[] = []
  if (joining.length > 0) lines.push(t('game_night.joining', { lng, names: mentionList(joining) }))
  if (declined.length > 0)
    lines.push(t('game_night.declined', { lng, names: mentionList(declined) }))
  return lines.length > 0 ? lines.join('\n') : t('game_night.prompt', { lng })
}

/**
 * The announcement as a Components V2 message: what started it, then the answers so far and
 * the buttons. Rebuilt whole on every answer.
 */
function buildGameNight(post: {
  messageId: string | null
  content: string
}): AnnouncementComponents {
  return [
    new TextDisplayBuilder().setContent(post.content),
    new TextDisplayBuilder().setContent(
      post.messageId
        ? responseText(post.messageId)
        : t('game_night.prompt', { lng: DEFAULT_LOCALE }),
    ),
    buttons(),
  ]
}

/** Groups in voice right now with enough players: who is playing what, where. */
function currentGroups(
  minPlayers: number,
): Map<string, { channelId: string; game: string; memberIds: string[] }> {
  const groups = new Map<string, { channelId: string; game: string; memberIds: string[] }>()
  for (const [channelId, memberIds] of membersInVoice()) {
    if (memberIds.length < minPlayers) continue
    for (const memberId of memberIds) {
      for (const game of memberActivityNow(memberId).games.keys()) {
        const key = keyOf(channelId, game)
        const group = groups.get(key) ?? { channelId, game, memberIds: [] }
        group.memberIds.push(memberId)
        groups.set(key, group)
      }
    }
  }
  for (const [key, group] of groups) {
    if (group.memberIds.length < minPlayers) groups.delete(key)
  }
  return groups
}

/**
 * Announces a game night once enough people in one voice channel have been playing the same
 * game together for a few minutes. Safe to call as often as you like.
 */
export async function checkGameNights(now = Date.now()): Promise<void> {
  if (running || !isReady()) return
  running = true

  try {
    const { gameNightChannelId: channelId, gameNightMinPlayers } = getSettings()
    if (!channelId) {
      forming.clear()
      return
    }

    const groups = currentGroups(gameNightMinPlayers ?? DEFAULT_GAME_NIGHT_PLAYERS)

    // A group that dropped below the minimum starts its wait over.
    for (const key of forming.keys()) if (!groups.has(key)) forming.delete(key)

    for (const [key, group] of groups) {
      const since = forming.get(key)
      if (since == null) {
        forming.set(key, now)
        continue
      }
      if (now - since < HOLD_MS) continue

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

async function announce(
  channelId: string,
  group: { channelId: string; game: string; memberIds: string[] },
  now: number,
): Promise<void> {
  const guild = await getGuild()
  const channel =
    guild.channels.cache.get(channelId) ?? (await guild.channels.fetch(channelId).catch(() => null))

  if (!channel?.isTextBased()) {
    log.warning`the configured game night channel no longer exists`
    return
  }

  const me = guild.members.me ?? (await guild.members.fetchMe())
  const canSend = channel
    .permissionsFor(me)
    ?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])
  if (!canSend) {
    log.warning`the bot cannot post in #${channel.name}`
    return
  }

  const lng = DEFAULT_LOCALE
  const roleId = getGameRole(group.game)
  const role = roleId ? guild.roles.cache.get(roleId) : undefined
  const voice = guild.channels.cache.get(group.channelId)

  const players = new Intl.ListFormat(lng, { type: 'conjunction' }).format(
    group.memberIds.map((id) => `<@${id}>`),
  )
  const intros = tlList('game_night.intros', lng)
  const intro = intros[Math.floor(Math.random() * intros.length)] ?? ''

  const emoji = await gameEmoji(group.game)
  const lines = [
    emoji
      ? t('game_night.title_emoji', { lng, game: group.game, emoji })
      : t('game_night.title', { lng, game: group.game }),
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
    components: buildGameNight({ messageId: null, content }),
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

/** Records a click on "I'm in" or "Can't make it" and shows it on the announcement. */
export async function respondToGameNight(
  interaction: ButtonInteraction,
  response: GameNightResponse,
): Promise<void> {
  const post = getGameNightPost(interaction.message.id)
  if (!post) {
    await interaction.reply({
      content: t('game_night.unknown', { lng: interaction.locale }),
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const member = interaction.guild?.members.cache.get(interaction.user.id)
  toggleGameNightResponse({
    messageId: post.messageId,
    memberId: interaction.user.id,
    displayName: member?.displayName ?? interaction.user.displayName,
    response,
    at: Date.now(),
  })

  await interaction.update({
    components: buildGameNight(post),
    // The answers are mentions, and the role is still in the text: ping none of them.
    allowedMentions: { parse: [] },
  })
}
