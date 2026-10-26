import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
  type GuildMember,
  type Role,
} from 'discord.js'

import { env } from '../env'
import { tl, tlList } from '../i18n'
import { encodeAssignId } from './ids'

/** An account younger than this gets a warning on its card, as on the dashboard's Triage page. */
const NEW_ACCOUNT_MS = 7 * 86_400_000

/** Discord allows 38 characters on a button label when there is no emoji. */
const LABEL_LIMIT = 38

/** The parts of a Components V2 message, laid out straight in it with no container. */
export type AnnouncementComponents = (
  SectionBuilder | SeparatorBuilder | TextDisplayBuilder | ActionRowBuilder<ButtonBuilder>
)[]

function truncate(value: string, limit = LABEL_LIMIT): string {
  return value.length <= limit ? value : `${value.slice(0, limit - 1)}…`
}

function relative(date: Date | number): string {
  return `<t:${Math.floor(new Date(date).getTime() / 1000)}:R>`
}

/**
 * One of her greetings, picked from the member and when their card was posted. The same pair
 * always gives the same line, so the resolved card keeps the greeting the waiting one had,
 * while a member who leaves and comes back may get a different one.
 */
function greeting(member: GuildMember, postedAt: number, locale: string): string {
  const lines = tlList('announcement.greetings', locale)
  if (lines.length === 0) return ''

  let hash = 0
  for (const char of `${member.id}:${postedAt}`) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return lines[hash % lines.length] ?? ''
}

/**
 * The welcome, her greeting, and a warning for an account made in the week before the card
 * was posted. Written for the members reading the channel, so it says nothing they can't use.
 * A message is seen by the whole server rather than one caller, so it is in the guild's own
 * preferred locale instead of any individual's.
 */
function welcome(member: GuildMember, postedAt: number, locale: string): SectionBuilder {
  const lines = [
    tl('announcement.welcome', locale, { member: member.toString() }),
    greeting(member, postedAt, locale),
  ]

  const created = member.user.createdTimestamp
  if (postedAt - created < NEW_ACCOUNT_MS) {
    lines.push('', tl('announcement.new_account', locale, { timestamp: relative(created) }))
  }

  return new SectionBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')))
    .setThumbnailAccessory(
      new ThumbnailBuilder()
        .setURL(member.displayAvatarURL({ size: 256, extension: 'png' }))
        .setDescription(tl('announcement.avatar_alt', locale, { username: member.user.username })),
    )
}

function divider(): SeparatorBuilder {
  return new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large)
}

function text(content: string): TextDisplayBuilder {
  return new TextDisplayBuilder().setContent(content)
}

/**
 * The triage announcement: the welcome, then one button per assignable role, each labelled
 * with the role's own name so the buttons stay correct if a role is renamed, and a link to
 * the dashboard's Triage page.
 */
export function buildTriageAnnouncement(
  member: GuildMember,
  roles: Role[],
  locale: string,
  postedAt: number,
): AnnouncementComponents {
  const openTriage = new ButtonBuilder()
    .setStyle(ButtonStyle.Link)
    .setLabel(tl('announcement.open_triage', locale))
    .setURL(new URL('/queue', env.PUBLIC_BASE_URL).toString())

  if (roles.length === 0) {
    return [
      welcome(member, postedAt, locale),
      divider(),
      text(tl('announcement.no_roles_configured', locale)),
      new ActionRowBuilder<ButtonBuilder>().addComponents(openTriage),
    ]
  }

  const buttons = roles.map((role, index) =>
    new ButtonBuilder()
      .setCustomId(encodeAssignId({ memberId: member.id, roleId: role.id }))
      .setLabel(truncate(role.name))
      .setStyle(index === 0 ? ButtonStyle.Primary : ButtonStyle.Secondary),
  )

  return [
    welcome(member, postedAt, locale),
    divider(),
    text(tl('announcement.assign_prompt', locale)),
    new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons, openTriage),
  ]
}

/**
 * Replaces the announcement once a decision is made. The buttons are dropped rather
 * than disabled so the message reads as a record instead of a dead control.
 */
export function buildResolvedAnnouncement(options: {
  member: GuildMember
  postedAt: number
  roleName: string
  actorName: string
  source: 'discord' | 'dashboard'
  locale: string
}): AnnouncementComponents {
  const { member, postedAt, roleName, actorName, source, locale } = options
  const key =
    source === 'dashboard' ? 'announcement.resolved_via_dashboard' : 'announcement.resolved'

  return [
    welcome(member, postedAt, locale),
    divider(),
    text(tl(key, locale, { role: roleName, actor: actorName, timestamp: relative(Date.now()) })),
  ]
}
