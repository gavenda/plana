/**
 * A role's colour as Discord gives it (`hexColor`), or null for a role with none: Discord
 * reports those as #000000, and draws them in its default text colour.
 */
export function roleColor(hex: string | null | undefined): string | null {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex) || hex === '#000000') return null
  return hex
}

/**
 * A Discord colour as text on the dark theme: mixed 20% towards on-surface, so a dark role
 * colour still reads. Undefined for no colour, leaving the text its usual colour.
 */
export function discordTextColor(hex: string | null | undefined): string | undefined {
  const color = roleColor(hex)
  return color ? `color-mix(in oklab, ${color} 80%, var(--color-on-surface))` : undefined
}

/** A piece of a Discord message: plain text, or markup Discord draws as a mention or emoji. */
export type MessageToken =
  | string
  | { channelId: string }
  | { roleId: string }
  | { everyone: '@everyone' | '@here' }
  | { emoji: string; emojiId: string; animated: boolean }

const MARKUP = /<#(\d+)>|<@&(\d+)>|(@everyone|@here)|<(a?):(\w+):(\d+)>/g

/**
 * Splits a message into text and the markup Discord renders specially: channel and role
 * mentions, @everyone and @here, and custom emoji. User mentions (<@id>) stay as written,
 * since the dashboard has no way to name an arbitrary member.
 */
export function parseMessage(content: string): MessageToken[] {
  const tokens: MessageToken[] = []
  let last = 0
  for (const match of content.matchAll(MARKUP)) {
    if (match.index > last) tokens.push(content.slice(last, match.index))
    const [, channelId, roleId, everyone, animated, emoji, emojiId] = match
    if (channelId) tokens.push({ channelId })
    else if (roleId) tokens.push({ roleId })
    else if (everyone) tokens.push({ everyone: everyone as '@everyone' | '@here' })
    else if (emoji && emojiId) tokens.push({ emoji, emojiId, animated: animated === 'a' })
    last = match.index + match[0].length
  }
  if (last < content.length) tokens.push(content.slice(last))
  return tokens
}

/** A custom emoji's image on Discord's CDN. */
export function emojiUrl(id: string, animated: boolean): string {
  return `https://cdn.discordapp.com/emojis/${id}.${animated ? 'gif' : 'webp'}?size=48`
}
