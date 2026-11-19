import { RedisClient } from 'bun'

import { recordAudit, type AuditAction } from '../db/audit'
import { env } from '../env'
import { publish } from '../live'
import { logger } from '../logging'
import {
  REMOTE_PROTOCOL_VERSION,
  RemoteChannel,
  type RemoteError,
  type RemoteEvent,
  type RemoteGuildState,
  type RemoteOp,
  type RemoteOps,
  type RemoteQueueType,
  type RemoteResponse,
  type RemoteSource,
} from '../vivy-contract'
import { client, getGuild } from './client'
import { err, ok, type Actor, type ErrorCode, type Result } from './service'

/**
 * Controls Vivy, the server's music bot, from the dashboard. Requests go over the Redis both
 * bots share (REDIS_URL, with VIVY_CONTROL on) and Vivy answers on another channel; it also
 * publishes its player's state whenever it changes, which is relayed to open pages on the
 * `music` topic. The messages are in `vivy-contract.ts`, a copy of Vivy's `src/remote/contract.ts`.
 */

const log = logger('music')

export const isMusicEnabled = () => env.VIVY_CONTROL && Boolean(env.REDIS_URL)

/** How long to wait for Vivy; a playlist or a fresh search takes the longest. */
const TIMEOUT_MS: Partial<Record<RemoteOp, number>> = { search: 8000, play: 15_000 }
const DEFAULT_TIMEOUT_MS = 5000
const RECONNECT_MIN_MS = 1000
const RECONNECT_MAX_MS = 30_000

type MusicState = RemoteGuildState & { voiceChannelName: string | null }

/** What the Music page shows, and what the `music` topic carries. */
export type MusicView = { online: boolean; state: MusicState | null }

type VoiceChannelOption = { id: string; name: string; category: string | null }

// ---------------------------------------------------------------------------
// Redis
// ---------------------------------------------------------------------------

/** Publishes requests. A failure should show on the page, so no offline queue. */
let publisher: RedisClient | null = null
/** Its own connection: one that has subscribed can run nothing else. It reconnects itself, see `connectSubscriber`. */
let subscriber: RedisClient | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | undefined
let reconnectDelay = RECONNECT_MIN_MS
let closed = false

const pending = new Map<string, (response: RemoteResponse | null) => void>()

let online = false
let latest: RemoteGuildState | null = null
/** Vivy's run and the order of its states, to drop one that arrives after a newer one. */
let lastInstance: string | null = null
let lastSeq = 0

/** Best-effort connect at startup, so a wrong URL or password shows in the log straight away. */
export async function connectMusic(): Promise<void> {
  if (!isMusicEnabled()) return
  closed = false
  publisher = new RedisClient(env.REDIS_URL, {
    enableOfflineQueue: false,
    autoReconnect: true,
    connectionTimeout: 2000,
  })
  try {
    await publisher.connect()
  } catch (error) {
    log.warning`Vivy control unavailable: ${error instanceof Error ? error.message : error}`
  }
  await connectSubscriber()
}

export function closeMusic(): void {
  closed = true
  clearTimeout(reconnectTimer)
  for (const settle of pending.values()) settle(null)
  pending.clear()
  const sub = subscriber
  subscriber = null
  sub?.close()
  publisher?.close()
  publisher = null
}

/**
 * Bun's auto reconnect isn't documented to subscribe again, so the subscriber is replaced
 * instead, backing off while Redis stays down.
 */
async function connectSubscriber(): Promise<void> {
  subscriber?.close()
  const sub = new RedisClient(env.REDIS_URL, { autoReconnect: false, connectionTimeout: 2000 })
  subscriber = sub
  sub.onclose = () => {
    if (subscriber === sub) scheduleReconnect()
  }

  try {
    await sub.subscribe([RemoteChannel.response, RemoteChannel.event], onMessage)
    reconnectDelay = RECONNECT_MIN_MS
    log.info`controlling Vivy over Redis`
    // Whatever changed while we weren't listening.
    void refresh()
  } catch (error) {
    log.warning`Vivy control unavailable: ${error instanceof Error ? error.message : error}`
    if (subscriber === sub) {
      subscriber = null
      sub.close()
      scheduleReconnect()
    }
  }
}

function scheduleReconnect(): void {
  if (closed || reconnectTimer) return
  setOnline(false)
  reconnectTimer = setTimeout(() => {
    reconnectTimer = undefined
    void connectSubscriber()
  }, reconnectDelay)
  reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS)
}

function onMessage(message: string, channel: string): void {
  let body: unknown
  try {
    body = JSON.parse(message)
  } catch {
    return
  }
  if (typeof body !== 'object' || body === null) return

  if (channel === RemoteChannel.response) {
    const response = body as RemoteResponse
    pending.get(response.id)?.(response)
  } else if (channel === RemoteChannel.event) {
    onEvent(body as RemoteEvent)
  }
}

function onEvent(event: RemoteEvent): void {
  if (event.v !== REMOTE_PROTOCOL_VERSION) return
  switch (event.type) {
    case 'state': {
      if (event.state.guildId !== env.DISCORD_GUILD_ID) return
      if (event.instanceId === lastInstance && event.seq <= lastSeq) return
      lastInstance = event.instanceId
      lastSeq = event.seq
      setState(event.state)
      return
    }
    case 'ready':
      void refresh()
      return
    case 'shutdown':
      setOnline(false)
      return
  }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/**
 * What the page shows. The position is carried forward to now here, on the host Vivy shares,
 * so the browser only has to count from when the view arrived, whatever its own clock says.
 */
function view(): MusicView {
  if (!online || !latest) return { online, state: null }
  const now = Date.now()
  const { current, paused, positionMs, positionAt, voiceChannelId } = latest
  const elapsed = current && !paused ? Math.max(0, now - positionAt) : 0
  const length = current && !current.isStream ? current.lengthMs : Infinity
  return {
    online,
    state: {
      ...latest,
      positionMs: Math.min(positionMs + elapsed, length),
      positionAt: now,
      voiceChannelName: voiceChannelId ? channelName(voiceChannelId) : null,
    },
  }
}

/** From the cache, so relaying a state never waits on Discord. */
function channelName(channelId: string): string | null {
  return client.guilds.cache.get(env.DISCORD_GUILD_ID)?.channels.cache.get(channelId)?.name ?? null
}

/** Vivy's latest state, which also means she is online; open pages get it straight away. */
function setState(state: RemoteGuildState): void {
  latest = state
  online = true
  publish('music', view())
}

function setOnline(value: boolean): void {
  if (online === value) return
  online = value
  if (!value) latest = null
  publish('music', view())
}

/** Asks Vivy for its state, after (re)connecting or when it says it started. */
async function refresh(): Promise<void> {
  const result = await request('state', { guildId: env.DISCORD_GUILD_ID })
  if (result.ok) setState(result.data)
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

/** What Vivy refused, as the dashboard's own error codes. */
const ERROR_BY_CODE: Partial<Record<RemoteError['code'], { code: ErrorCode; key: string }>> = {
  NODE_UNAVAILABLE: { code: 'vivy_unavailable', key: 'error.vivy_unavailable' },
  NOT_CONNECTED: { code: 'music_idle', key: 'error.music_idle' },
  NOTHING_PLAYING: { code: 'music_idle', key: 'error.music_idle' },
  NO_RESULTS: { code: 'no_results', key: 'error.no_results' },
  UNSUPPORTED_QUERY: { code: 'invalid_input', key: 'error.music_unsupported' },
  INVALID_TRACK: { code: 'invalid_input', key: 'error.music_invalid_track' },
  CHANNEL_NOT_FOUND: { code: 'unknown_channel', key: 'error.unknown_voice_channel' },
  VOICE_NOT_JOINABLE: { code: 'missing_permissions', key: 'error.voice_not_joinable' },
  INDEX_OUT_OF_RANGE: { code: 'queue_changed', key: 'error.queue_changed' },
  STALE_INDEX: { code: 'queue_changed', key: 'error.queue_changed' },
  LOAD_FAILED: { code: 'vivy_error', key: 'error.music_load_failed' },
}

function toFailure(error: RemoteError) {
  if (error.code === 'WRONG_VOICE_CHANNEL') {
    const channelId = error.details?.voiceChannelId ?? null
    const channel = channelId ? channelName(channelId) : null
    return err('voice_conflict', 'error.voice_conflict', {
      channelId,
      channel: channel ?? 'another channel',
    })
  }
  const mapped = ERROR_BY_CODE[error.code]
  if (mapped) return err(mapped.code, mapped.key)
  log.warning`Vivy refused a request: ${error.code} ${error.message}`
  return err('vivy_error', 'error.vivy_error')
}

/** Sends a request to Vivy and waits for its answer. */
async function request<Op extends RemoteOp>(
  op: Op,
  params: RemoteOps[Op]['params'],
): Promise<Result<RemoteOps[Op]['result']>> {
  if (!publisher) return err('music_disabled', 'error.music_disabled')

  const id = crypto.randomUUID()
  const timeoutMs = TIMEOUT_MS[op] ?? DEFAULT_TIMEOUT_MS
  // Listening before sending, so a quick answer isn't missed.
  const answer = new Promise<RemoteResponse | null | 'timeout'>((resolve) => {
    const timer = setTimeout(() => resolve('timeout'), timeoutMs)
    pending.set(id, (response) => {
      clearTimeout(timer)
      resolve(response)
    })
  })

  try {
    const message = { v: REMOTE_PROTOCOL_VERSION, id, op, sentAt: Date.now(), timeoutMs, params }
    const receivers = await publisher.publish(RemoteChannel.request, JSON.stringify(message))
    if (receivers === 0) {
      setOnline(false)
      return err('vivy_offline', 'error.vivy_offline')
    }

    const response = await answer
    if (response === 'timeout') return err('vivy_timeout', 'error.vivy_timeout')
    if (response === null) return err('vivy_offline', 'error.vivy_offline')
    if (!response.ok) return toFailure(response.error)
    return ok(response.result as RemoteOps[Op]['result'])
  } catch (error) {
    log.warning`Couldn't reach Vivy: ${error instanceof Error ? error.message : error}`
    return err('vivy_offline', 'error.vivy_offline')
  } finally {
    // Settles the answer (and its timer) on every way out, and forgets it.
    pending.get(id)?.(null)
    pending.delete(id)
  }
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

/** Vivy's state, from the last one it published, or asked for when there is none. */
export async function getMusicState(): Promise<Result<MusicView>> {
  if (!isMusicEnabled()) return err('music_disabled', 'error.music_disabled')
  if (!online || !latest) await refresh()
  return ok(view())
}

/** The voice channels Vivy could join, and the one the member is in. */
export async function listVoiceChannels(
  userId: string,
): Promise<Result<{ channels: VoiceChannelOption[]; userChannelId: string | null }>> {
  const guild = await getGuild()
  const channels = [...guild.channels.cache.values()]
    .filter((channel) => channel.isVoiceBased())
    .sort((a, b) => a.position - b.position)
    .map((channel) => ({
      id: channel.id,
      name: channel.name,
      category: channel.parent?.name ?? null,
    }))
  return ok({ channels, userChannelId: guild.voiceStates.cache.get(userId)?.channelId ?? null })
}

export async function searchMusic(query: string, source: RemoteSource) {
  return request('search', { query, source })
}

type PlayInput = {
  target: { encoded: string } | { query: string; source?: RemoteSource }
  /** What the audit log shows, since an encoded track says nothing readable. */
  title: string | null
  queueType: RemoteQueueType
  voiceChannelId: string
  actor: Actor
}

export async function playMusic(input: PlayInput) {
  const { target, queueType, voiceChannelId, actor } = input
  const result = await request('play', {
    guildId: env.DISCORD_GUILD_ID,
    voiceChannelId,
    requester: { id: actor.id, name: actor.name },
    queueType,
    target,
  })
  if (!result.ok) return result

  setState(result.data.state)
  const { first, added, playlistName } = result.data
  audit('music.play', actor, {
    targetName: playlistName ?? first?.title ?? input.title,
    detail: {
      queueType,
      added,
      channelId: voiceChannelId,
      channelName: channelName(voiceChannelId),
      uri: first?.uri ?? null,
      playlist: playlistName,
    },
  })
  return ok({ added, first, playlistName, view: view() })
}

type AuditEntry = { targetName?: string | null; detail?: Record<string, unknown> }

type StateOp = Exclude<RemoteOp, 'search' | 'play' | 'state'>

/**
 * Sends a change Vivy answers with her new state, shows that state, and audits the change.
 * `describe` is read before the change, while the track or channel it names is still there.
 */
async function change<Op extends StateOp>(
  op: Op,
  params: Omit<RemoteOps[Op]['params'], 'guildId'>,
  actor: Actor,
  describe: () => AuditEntry = () => ({}),
): Promise<Result<MusicView>> {
  const entry = describe()
  const result = await request(op, {
    guildId: env.DISCORD_GUILD_ID,
    ...params,
  } as RemoteOps[Op]['params'])
  if (!result.ok) return result
  setState(result.data as RemoteGuildState)
  audit(`music.${op}`, actor, entry)
  return ok(view())
}

export type MusicControl = 'pause' | 'resume' | 'skip' | 'stop' | 'clear' | 'shuffle'

export function controlMusic(op: MusicControl, actor: Actor) {
  const aboutTrack = op !== 'clear' && op !== 'shuffle'
  return change(op, {}, actor, () => ({
    targetName: aboutTrack ? (latest?.current?.title ?? null) : null,
  }))
}

export function removeMusic(index: number, identifier: string | undefined, actor: Actor) {
  return change('remove', { index, identifier }, actor, () => ({
    targetName: latest?.queue[index]?.title ?? null,
    detail: { index },
  }))
}

export function moveMusic(voiceChannelId: string, actor: Actor) {
  return change('move', { voiceChannelId }, actor, () => {
    const from = latest?.voiceChannelId ?? null
    return {
      detail: {
        fromChannelId: from,
        fromChannelName: from && channelName(from),
        channelId: voiceChannelId,
        channelName: channelName(voiceChannelId),
      },
    }
  })
}

function audit(action: `music.${RemoteOp}` & AuditAction, actor: Actor, entry: AuditEntry): void {
  recordAudit({ action, source: 'dashboard', actorId: actor.id, actorName: actor.name, ...entry })
}
