import { onBeforeUnmount, onMounted, readonly, ref } from 'vue'

import type { RightNow } from './activity'
import type { AuditEntry } from './audit'

/**
 * Live updates over `/ws` (see src/server/live.ts). Most topics are a bare "this changed",
 * and the page reloads through the endpoint it already uses, so every page still works
 * without the socket. `audit` and `presence` carry their data.
 */
export type LiveMessages = {
  triage: object
  audit: { entry: AuditEntry }
  presence: RightNow
  voice: object
  guild: object
  birthdays: object
  settings: object
  backup: object
}

export type LiveTopic = keyof LiveMessages

/** Null after a reconnect: messages may have been missed, so reload rather than patch. */
type Listener<K extends LiveTopic> = (message: LiveMessages[K] | null) => void

/** Matches CLOSE_FORBIDDEN in src/server/http/live-socket.ts: access is gone, stop retrying. */
const CLOSE_FORBIDDEN = 4403
const RETRY_MIN_MS = 1000
const RETRY_MAX_MS = 30_000

const listeners = new Map<LiveTopic, Set<Listener<LiveTopic>>>()

/** One socket per tab, shared by every page that follows something. */
let socket: WebSocket | null = null
let connectedBefore = false
let retryDelay = RETRY_MIN_MS
let retryTimer: ReturnType<typeof setTimeout> | undefined
let forbidden = false

/**
 * Whether the socket is down for longer than a quick reconnect takes, for the banner in App.vue.
 * Only the browser ever changes these, so the server render always shows no banner.
 */
const failing = ref(false)
/** Whether the socket is open right now, so pages following a topic update on their own. */
const connected = ref(false)
/** Closed for lost access: it won't come back without a reload. */
const lost = ref(false)
const FAILING_GRACE_MS = 3000
let failingTimer: ReturnType<typeof setTimeout> | undefined

function markUp() {
  clearTimeout(failingTimer)
  failingTimer = undefined
  failing.value = false
}

function markDown() {
  if (failingTimer || failing.value) return
  failingTimer = setTimeout(() => {
    failingTimer = undefined
    failing.value = true
  }, FAILING_GRACE_MS)
}

function send(type: 'subscribe' | 'unsubscribe', topic: LiveTopic) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type, topic }))
}

function dispatch(topic: LiveTopic, message: LiveMessages[LiveTopic] | null) {
  for (const listener of listeners.get(topic) ?? []) {
    try {
      listener(message)
    } catch (error) {
      console.error(`[live] a ${topic} listener failed:`, error)
    }
  }
}

function connect() {
  if (socket || forbidden || listeners.size === 0) return

  const url = new URL('/ws', window.location.href)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  const ws = new WebSocket(url)
  socket = ws

  ws.onopen = () => {
    retryDelay = RETRY_MIN_MS
    connected.value = true
    markUp()
    for (const topic of listeners.keys()) send('subscribe', topic)
    if (connectedBefore) for (const topic of listeners.keys()) dispatch(topic, null)
    connectedBefore = true
  }

  ws.onmessage = (event) => {
    let message: { topic?: unknown }
    try {
      message = JSON.parse(String(event.data)) as typeof message
    } catch {
      return
    }
    const topic = message.topic as LiveTopic
    if (listeners.has(topic)) dispatch(topic, message as LiveMessages[LiveTopic])
  }

  ws.onclose = (event) => {
    if (socket === ws) socket = null
    connected.value = false
    if (event.code === CLOSE_FORBIDDEN) {
      forbidden = true
      lost.value = true
      markUp()
      return
    }
    markDown()
    // Whatever happened while it was down is caught up on reconnect.
    connectedBefore = true
    scheduleReconnect()
  }
}

/** Backs off from a second to half a minute, with jitter so a restart isn't met by every tab at once. */
function scheduleReconnect() {
  if (retryTimer || listeners.size === 0 || forbidden) return
  const delay = retryDelay * (0.5 + Math.random() / 2)
  retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS)
  retryTimer = setTimeout(() => {
    retryTimer = undefined
    connect()
  }, delay)
}

function subscribe<K extends LiveTopic>(topic: K, listener: Listener<K>) {
  let set = listeners.get(topic)
  if (!set) {
    set = new Set()
    listeners.set(topic, set)
    send('subscribe', topic)
  }
  set.add(listener as Listener<LiveTopic>)
  connect()
}

function unsubscribe<K extends LiveTopic>(topic: K, listener: Listener<K>) {
  const set = listeners.get(topic)
  if (!set) return
  set.delete(listener as Listener<LiveTopic>)
  if (set.size === 0) {
    listeners.delete(topic)
    send('unsubscribe', topic)
  }
}

/**
 * The connection's health: `connected` while it is open, `failing` while it keeps retrying,
 * `lost` once access is gone.
 */
export function useLiveStatus() {
  return { connected: readonly(connected), failing: readonly(failing), lost: readonly(lost) }
}

/**
 * Follows `topic` while the calling component is mounted (so only in the browser, after
 * hydration). `listener` gets each message, or null after a reconnect.
 */
export function useLive<K extends LiveTopic>(topic: K, listener: Listener<K>) {
  onMounted(() => subscribe(topic, listener))
  onBeforeUnmount(() => unsubscribe(topic, listener))
}
