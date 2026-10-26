import type { Server, ServerWebSocket, WebSocketHandler } from 'bun'
import type { Context } from 'hono'
import { getSignedCookie } from 'hono/cookie'

import { getSession } from '../db/sessions'
import { isReady } from '../discord/client'
import { getAccessLevel, type AccessLevel } from '../discord/service'
import { env } from '../env'
import { ADMIN_TOPICS, LIVE_TOPICS, type LiveTopic } from '../live'
import { SESSION_COOKIE } from './session'

/**
 * `requireStaff` asks Discord on every request so revoked access takes effect at once. A
 * socket stays open for hours, so it asks again on this interval and closes when access is gone.
 */
const ACCESS_RECHECK_MS = 60_000

/** Closed for lost access: the client stops reconnecting until the page is reloaded. */
export const CLOSE_FORBIDDEN = 4403

export type LiveSocketData = { sessionId: string; userId: string; access: AccessLevel }

type LiveSocket = ServerWebSocket<LiveSocketData>

const sockets = new Set<LiveSocket>()

const isTopic = (value: unknown): value is LiveTopic =>
  typeof value === 'string' && (LIVE_TOPICS as readonly string[]).includes(value)

const allowed = (socket: LiveSocket, topic: LiveTopic) =>
  socket.data.access === 'admin' || !ADMIN_TOPICS.has(topic)

/**
 * Only pages served from this origin may connect. A browser sends the session cookie with
 * a cross-site WebSocket handshake, so without this check another site could listen in.
 */
function sameOrigin(c: Context): boolean {
  const origin = c.req.header('origin')
  if (!origin) return false
  try {
    const { host } = new URL(origin)
    return host === c.req.header('host') || host === new URL(env.PUBLIC_BASE_URL).host
  } catch {
    return false
  }
}

/** `GET /ws`: the same staff check as `requireStaff`, then the upgrade. */
export async function upgradeLiveSocket(c: Context): Promise<Response> {
  if (c.req.header('upgrade')?.toLowerCase() !== 'websocket') {
    return c.text('Expected a WebSocket upgrade.', 426)
  }
  if (!sameOrigin(c)) return c.text('Cross-origin connections are not allowed.', 403)

  const sessionId = await getSignedCookie(c, env.SESSION_SECRET, SESSION_COOKIE)
  const user = sessionId ? getSession(sessionId) : null
  if (!sessionId || !user) return c.text('Not signed in.', 401)
  if (!isReady()) return c.text('The bot is still connecting to Discord.', 503)

  const access = await getAccessLevel(user.id)
  if (!access) return c.text('Not an administrator or moderator of this server.', 403)

  const server = c.env as Server<LiveSocketData>
  const data: LiveSocketData = { sessionId, userId: user.id, access }
  if (!server.upgrade(c.req.raw, { data })) return c.text('WebSocket upgrade failed.', 400)
  // Bun answers the handshake itself; this response is never sent.
  return new Response(null)
}

/** Messages from the page: `{ type: 'subscribe' | 'unsubscribe', topic }`. */
export const liveSocketHandler: WebSocketHandler<LiveSocketData> = {
  maxPayloadLength: 1024,
  open(socket) {
    sockets.add(socket)
  },
  message(socket, raw) {
    let message: { type?: unknown; topic?: unknown }
    try {
      message = JSON.parse(String(raw)) as typeof message
    } catch {
      return
    }
    if (!isTopic(message.topic)) return
    if (message.type === 'subscribe' && allowed(socket, message.topic)) {
      socket.subscribe(message.topic)
    } else if (message.type === 'unsubscribe') {
      socket.unsubscribe(message.topic)
    }
  },
  close(socket) {
    sockets.delete(socket)
  },
}

/** Closes sockets whose session ended or whose access was revoked; drops admin topics on a demotion. */
async function recheckAccess(): Promise<void> {
  if (!isReady()) return
  for (const socket of sockets) {
    try {
      const access = getSession(socket.data.sessionId)
        ? await getAccessLevel(socket.data.userId)
        : null
      if (!access) {
        socket.close(CLOSE_FORBIDDEN, 'Access revoked')
        continue
      }
      socket.data.access = access
      for (const topic of ADMIN_TOPICS) {
        if (!allowed(socket, topic)) socket.unsubscribe(topic)
      }
    } catch (error) {
      // Discord being unreachable is not a reason to cut everyone off; try again next time.
      console.warn('[live] could not re-check access:', error)
    }
  }
}

let recheckTimer: ReturnType<typeof setInterval> | undefined

export function startLiveSockets(): void {
  recheckTimer ??= setInterval(() => void recheckAccess(), ACCESS_RECHECK_MS)
}

export function stopLiveSockets(): void {
  clearInterval(recheckTimer)
  recheckTimer = undefined
  for (const socket of sockets) socket.close(1001, 'Server shutting down')
}
