import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
  type GuildMember,
  type Role,
} from 'discord.js'

import { tl } from '../i18n'
import { encodeAssignId } from './ids'

const ACCENT_PENDING = 0x5865f2
const ACCENT_RESOLVED = 0x57f287

/** Discord allows 38 characters on a button label when there is no emoji. */
const LABEL_LIMIT = 38

function truncate(value: string, limit = LABEL_LIMIT): string {
  return value.length <= limit ? value : `${value.slice(0, limit - 1)}…`
}

function relative(date: Date): string {
  return `<t:${Math.floor(date.getTime() / 1000)}:R>`
}

/**
 * A message is seen by the whole server rather than one caller, so the card is rendered
 * in the guild's own preferred locale instead of any individual's.
 */
function describeMember(member: GuildMember, locale: string): string {
  const lines = [
    tl('announcement.welcome', locale, { member: member.toString() }),
    tl('announcement.identity', locale, { tag: member.user.tag, id: member.id }),
    tl('announcement.account_created', locale, { timestamp: relative(member.user.createdAt) }),
  ]

  if (member.joinedAt) {
    lines.push(tl('announcement.joined', locale, { timestamp: relative(member.joinedAt) }))
  }

  return lines.join('\n')
}

function memberSection(member: GuildMember, locale: string, body: string): SectionBuilder {
  return new SectionBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(body))
    .setThumbnailAccessory(
      new ThumbnailBuilder()
        .setURL(member.displayAvatarURL({ size: 256, extension: 'png' }))
        .setDescription(tl('announcement.avatar_alt', locale, { username: member.user.username })),
    )
}

function divider(): SeparatorBuilder {
  return new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
}

/**
 * The triage announcement: member card plus one button per assignable role, each
 * labelled with the role's own name so the buttons stay correct if a role is renamed.
 */
export function buildTriageAnnouncement(
  member: GuildMember,
  roles: Role[],
  locale: string,
): ContainerBuilder {
  const container = new ContainerBuilder()
    .setAccentColor(ACCENT_PENDING)
    .addSectionComponents(memberSection(member, locale, describeMember(member, locale)))
    .addSeparatorComponents(divider())

  if (roles.length === 0) {
    return container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(tl('announcement.no_roles_configured', locale)),
    )
  }

  const buttons = roles.map((role, index) =>
    new ButtonBuilder()
      .setCustomId(encodeAssignId({ memberId: member.id, roleId: role.id }))
      .setLabel(truncate(role.name))
      .setStyle(index === 0 ? ButtonStyle.Primary : ButtonStyle.Secondary),
  )

  return container
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(tl('announcement.assign_prompt', locale)),
    )
    .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons))
}

/**
 * Replaces the announcement once a decision is made. The buttons are dropped rather
 * than disabled so the message reads as a record instead of a dead control.
 */
export function buildResolvedAnnouncement(options: {
  member: GuildMember
  roleName: string
  actorName: string
  source: 'discord' | 'dashboard'
  locale: string
}): ContainerBuilder {
  const { member, roleName, actorName, source, locale } = options
  const key =
    source === 'dashboard' ? 'announcement.resolved_via_dashboard' : 'announcement.resolved'

  return new ContainerBuilder()
    .setAccentColor(ACCENT_RESOLVED)
    .addSectionComponents(memberSection(member, locale, describeMember(member, locale)))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        tl(key, locale, { role: roleName, actor: actorName, timestamp: relative(new Date()) }),
      ),
    )
}
