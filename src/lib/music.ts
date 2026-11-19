/**
 * The Music page's data, from /api/music (see src/server/discord/music.ts and the contract
 * with Vivy in src/server/vivy-contract.ts, whose shapes these repeat).
 */

export type MusicQueueType = 'now' | 'next' | 'later'
export type MusicSource = 'ytmsearch' | 'ytsearch'
export type MusicRepeat = 'off' | 'track' | 'queue'

export type MusicTrack = {
  identifier: string
  title: string
  author: string
  lengthMs: number
  isStream: boolean
  /** Whether it can be seeked; missing from a Vivy older than 2.5.0, which can't seek. */
  isSeekable?: boolean
  uri: string | null
  artworkUrl: string | null
  /** Who asked for it; null when Vivy queued it on her own. */
  requester: { id: string; name: string } | null
}

export type MusicSearchTrack = MusicTrack & { encoded: string }

export type MusicState = {
  guildId: string
  voiceChannelId: string | null
  voiceChannelName: string | null
  paused: boolean
  current: MusicTrack | null
  /** Position in `current` when the server sent this, to count forward from its arrival while playing. */
  positionMs: number
  positionAt: number
  /** How fast the position moves: 1, or faster under a speed filter such as nightcore. */
  rate: number
  /** Upcoming tracks, the first hundred; `queueSize` counts them all. */
  queue: MusicTrack[]
  queueSize: number
  durationMs: number
  volume: number
  repeat: MusicRepeat
  /** Whether Vivy queues similar tracks once the queue runs out; missing from a Vivy older than 2.6.0. */
  autoplay?: boolean
}

/** `state` is null while Vivy is offline. */
export type MusicView = { online: boolean; state: MusicState | null }

/** A playing track's position, sent every few seconds to correct the one counted forward. */
export type MusicProgress = Pick<MusicState, 'paused' | 'positionMs' | 'positionAt' | 'rate'>

/** What the `music` topic carries: the whole view on a change, else a position. */
export type MusicLive = MusicView | { progress: MusicProgress }

export type MusicSearch = { tracks: MusicSearchTrack[]; playlistName: string | null }

export type MusicPlayed = {
  added: number
  first: MusicTrack | null
  playlistName: string | null
  view: MusicView
}

export type VoiceChannelOption = { id: string; name: string; category: string | null }

export type MusicChannels = { channels: VoiceChannelOption[]; userChannelId: string | null }

/** Where in the queue a track goes, as the result rows offer it. */
export const QUEUE_PLACES: { type: MusicQueueType; label: string; icon: string }[] = [
  { type: 'now', label: 'Play now', icon: 'play_arrow' },
  { type: 'next', label: 'Play next', icon: 'skip_next' },
  { type: 'later', label: 'Add to queue', icon: 'playlist_add' },
]

/** "3:07", or "1:02:11" past an hour. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = String(total % 60).padStart(2, '0')
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
    : `${minutes}:${seconds}`
}

/** Whether what was typed is a link to load rather than words to search for. */
export function isLink(query: string): boolean {
  return /^https?:\/\//i.test(query.trim())
}
