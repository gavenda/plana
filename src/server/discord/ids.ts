/**
 * Button `custom_id`s carry the state the handler needs, because Discord gives an
 * interaction nothing but this string. Kept well under the 100 character limit:
 * two snowflakes plus the prefix is at most ~48 characters.
 */
export const ASSIGN_PREFIX = 'assign'

export type AssignCustomId = { memberId: string; roleId: string }

export function encodeAssignId({ memberId, roleId }: AssignCustomId): string {
  return `${ASSIGN_PREFIX}:${memberId}:${roleId}`
}

export function decodeAssignId(customId: string): AssignCustomId | null {
  const [prefix, memberId, roleId] = customId.split(':')
  if (prefix !== ASSIGN_PREFIX || !memberId || !roleId) return null
  return { memberId, roleId }
}

export const BROADCAST_PREFIX = 'broadcast'

export function encodeBroadcastId(channelId: string): string {
  return `${BROADCAST_PREFIX}:${channelId}`
}

export function decodeBroadcastId(customId: string): { channelId: string } | null {
  const [prefix, channelId] = customId.split(':')
  if (prefix !== BROADCAST_PREFIX || !channelId) return null
  return { channelId }
}

export const BROADCAST_INPUT_ID = 'content'

export const GAME_NIGHT_PREFIX = 'gamenight'

/** The message the button sits on says which game night it is, so only the answer is carried. */
export function encodeGameNightId(response: 'in' | 'out'): string {
  return `${GAME_NIGHT_PREFIX}:${response}`
}

export function decodeGameNightId(customId: string): { response: 'in' | 'out' } | null {
  const [prefix, response] = customId.split(':')
  if (prefix !== GAME_NIGHT_PREFIX || (response !== 'in' && response !== 'out')) return null
  return { response }
}

export const STATS_PREFIX = 'stats'

export type StatsTab = 'games' | 'music' | 'voice'

/** Whose stats, over how many days (0 for all time) and which tab to show. */
export type StatsCustomId = { memberId: string; days: number | null; tab: StatsTab }

export function encodeStatsId({ memberId, days, tab }: StatsCustomId): string {
  return `${STATS_PREFIX}:${memberId}:${days ?? 0}:${tab}`
}

export function decodeStatsId(customId: string): StatsCustomId | null {
  const [prefix, memberId, days, tab] = customId.split(':')
  if (prefix !== STATS_PREFIX || !memberId || !days || !/^\d+$/.test(days)) return null
  if (tab !== 'games' && tab !== 'music' && tab !== 'voice') return null
  const count = Number(days)
  return { memberId, days: count === 0 ? null : count, tab }
}

/** The dispatcher matches handlers on this, so ids must keep the prefix first. */
export function customIdPrefix(customId: string): string {
  return customId.split(':')[0] ?? ''
}
