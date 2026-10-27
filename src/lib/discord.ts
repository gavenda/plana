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

/** A custom emoji's image on Discord's CDN. */
export function emojiUrl(id: string, animated: boolean): string {
  return `https://cdn.discordapp.com/emojis/${id}.${animated ? 'gif' : 'webp'}?size=48`
}
