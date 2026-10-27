import { escapeMarkdown } from 'discord.js'

/** "45m", "3h 20m", "12h". Minutes stop mattering past ten hours. */
export function duration(ms: number): string {
  const minutes = Math.round(ms / 60_000)
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest}m`
  if (rest === 0 || hours >= 10) return `${hours}h`
  return `${hours}h ${rest}m`
}

/** A name shortened to `limit` characters and made safe to put in markdown. */
export function clip(value: string, limit = 80): string {
  const text = value.length > limit ? `${value.slice(0, limit - 1)}…` : value
  return escapeMarkdown(text)
}
