import type { Server } from 'bun'

/**
 * What open dashboard pages can follow over `/ws`. Most topics are a bare "this changed":
 * the page refetches through the endpoint it already loads from. `audit`, `presence` and
 * `logs` carry their data, an entry being cheap to send and the others too frequent to refetch for.
 */
export const LIVE_TOPICS = [
  'triage',
  'audit',
  'presence',
  'voice',
  'guild',
  'birthdays',
  'settings',
  'backup',
  'logs',
] as const

export type LiveTopic = (typeof LIVE_TOPICS)[number]

/** Topics only administrators may follow. */
export const ADMIN_TOPICS: ReadonlySet<LiveTopic> = new Set(['settings', 'backup', 'logs'])

/** The only topics viewers (the stats role) may follow: what the stats pages reload on. */
export const VIEWER_TOPICS: ReadonlySet<LiveTopic> = new Set([
  'presence',
  'voice',
  'guild',
  'birthdays',
])

/** Bursts of the same notice (a role edit touches many members) go out as one. */
const NOTICE_DELAY_MS = 500

let server: Server<unknown> | null = null
const pending = new Set<LiveTopic>()
let flushTimer: ReturnType<typeof setTimeout> | undefined

/** Called once `Bun.serve` is up; until then publishing does nothing. */
export function attachLiveServer(value: Server<unknown>): void {
  server = value
}

/** Whether any open page follows `topic`, to skip building a message nobody would get. */
export function hasSubscribers(topic: LiveTopic): boolean {
  return server != null && server.subscriberCount(topic) > 0
}

function send(topic: LiveTopic, message: Record<string, unknown>): void {
  if (!server || !hasSubscribers(topic)) return
  server.publish(topic, JSON.stringify({ topic, ...message }))
}

/** Tells pages following `topic` to reload it, a moment later so a burst sends one notice. */
export function notify(...topics: LiveTopic[]): void {
  for (const topic of topics) pending.add(topic)
  flushTimer ??= setTimeout(() => {
    flushTimer = undefined
    const topics = [...pending]
    pending.clear()
    for (const topic of topics) send(topic, {})
  }, NOTICE_DELAY_MS)
}

/** Sends `data` to pages following `topic` straight away. */
export function publish(topic: LiveTopic, data: Record<string, unknown>): void {
  send(topic, data)
}
