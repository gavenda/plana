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

/** The dispatcher matches handlers on this, so ids must keep the prefix first. */
export function customIdPrefix(customId: string): string {
  return customId.split(':')[0] ?? ''
}
