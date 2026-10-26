import { createHash } from 'node:crypto'

import { forgetGameEmoji, getGameEmoji, getGameIcon, saveGameEmoji } from '../db/game-icons'
import { logger } from '../logging'
import { client } from './client'

const log = logger('activity')

const REQUEST_TIMEOUT_MS = 10_000

/** Discord refuses emoji images over 256 KiB. */
const MAX_EMOJI_BYTES = 256 * 1024

/**
 * A valid, unique emoji name for a game: letters, digits and underscores, 2 to 32 characters.
 * The hash keeps two games whose names reduce to the same letters apart.
 */
function emojiName(game: string): string {
  const slug = game
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
    .slice(0, 24)
  const hash = createHash('sha1').update(game).digest('hex').slice(0, 6)
  return `${slug || 'game'}_${hash}`
}

async function download(url: string): Promise<Buffer | null> {
  const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  if (!response.ok) return null
  const bytes = Buffer.from(await response.arrayBuffer())
  return bytes.length <= MAX_EMOJI_BYTES ? bytes : null
}

/**
 * The game's icon as an emoji to write in a message (`<:name:id>`), or null when the game has
 * no icon or the upload failed. The icon is uploaded once as one of the bot's own application
 * emojis, which don't take any of the server's emoji slots, and uploaded again if it changes.
 */
export async function gameEmoji(game: string): Promise<string | null> {
  const iconUrl = getGameIcon(game)?.iconUrl
  if (!iconUrl) return null

  const emojis = client.application?.emojis
  if (!emojis) return null

  try {
    const saved = getGameEmoji(game)
    if (saved?.iconUrl === iconUrl) {
      const existing =
        emojis.cache.get(saved.emojiId) ?? (await emojis.fetch(saved.emojiId).catch(() => null))
      if (existing) return `<:${existing.name}:${existing.id}>`
    }

    // The icon changed, or the emoji was deleted from the developer portal.
    if (saved) {
      await emojis.delete(saved.emojiId).catch(() => undefined)
      forgetGameEmoji(game)
    }

    const image = await download(iconUrl)
    if (!image) return null

    // Names are unique per application; one left behind by a lost database is replaced.
    const name = emojiName(game)
    const leftover = (await emojis.fetch()).find((emoji) => emoji.name === name)
    if (leftover) await emojis.delete(leftover.id)

    const emoji = await emojis.create({ attachment: image, name })
    saveGameEmoji({ game, emojiId: emoji.id, name, iconUrl })
    log.info`uploaded an emoji for ${game}`
    return `<:${name}:${emoji.id}>`
  } catch (error) {
    log.warning`could not make an emoji for ${game}: ${error}`
    return null
  }
}
