import type { Context, MiddlewareHandler } from 'hono'
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie'

import { createSession, destroySession, getSession, type SessionUser } from '../db/sessions'
import { isReady } from '../discord/client'
import { getAccessLevel, type AccessLevel } from '../discord/service'
import { env, isProduction } from '../env'

export const SESSION_COOKIE = 'plana_session'
export const OAUTH_STATE_COOKIE = 'plana_oauth_state'

export type AppEnv = {
  Variables: {
    user: SessionUser
    access: AccessLevel
  }
}

const cookieOptions = {
  httpOnly: true,
  sameSite: 'Lax',
  path: '/',
  secure: isProduction || env.PUBLIC_BASE_URL.startsWith('https://'),
} as const

export async function startSession(c: Context, user: SessionUser): Promise<void> {
  const { id, expiresAt } = createSession(user)
  await setSignedCookie(c, SESSION_COOKIE, id, env.SESSION_SECRET, {
    ...cookieOptions,
    expires: new Date(expiresAt),
  })
}

export async function readSession(c: Context): Promise<SessionUser | null> {
  const id = await getSignedCookie(c, env.SESSION_SECRET, SESSION_COOKIE)
  if (!id) return null
  return getSession(id)
}

export async function endSession(c: Context): Promise<void> {
  const id = await getSignedCookie(c, env.SESSION_SECRET, SESSION_COOKIE)
  if (id) destroySession(id)
  deleteCookie(c, SESSION_COOKIE, cookieOptions)
}

export type OAuthState = { state: string; next: string | null }

/** The CSRF nonce and the page the user was heading for travel together, signed. */
export async function setStateCookie(c: Context, value: OAuthState): Promise<void> {
  await setSignedCookie(c, OAUTH_STATE_COOKIE, JSON.stringify(value), env.SESSION_SECRET, {
    ...cookieOptions,
    maxAge: 600,
  })
}

export async function takeStateCookie(c: Context): Promise<OAuthState | null> {
  const raw = await getSignedCookie(c, env.SESSION_SECRET, OAUTH_STATE_COOKIE)
  deleteCookie(c, OAUTH_STATE_COOKIE, cookieOptions)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as OAuthState
    return typeof parsed.state === 'string' ? parsed : null
  } catch {
    return null
  }
}

/**
 * Guards every API endpoint: administrators and moderators only. Access is re-checked against
 * Discord on each request rather than trusted from the session, so revoking someone's
 * permissions or role in Discord locks them out of the dashboard immediately.
 */
export const requireStaff: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = await readSession(c)
  if (!user) return c.json({ error: 'Not signed in.', code: 'unauthenticated' }, 401)

  if (!isReady()) {
    return c.json({ error: 'The bot is still connecting to Discord.', code: 'not_ready' }, 503)
  }

  const access = await getAccessLevel(user.id)
  if (!access) {
    await endSession(c)
    return c.json(
      { error: 'You are not an administrator or moderator of this server.', code: 'forbidden' },
      403,
    )
  }

  c.set('user', user)
  c.set('access', access)
  await next()
}

/** For the endpoints moderators may not use: changing settings and posting as the bot. Runs after `requireStaff`. */
export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get('access') !== 'admin') {
    return c.json({ error: 'Only administrators can do that.', code: 'admin_only' }, 403)
  }
  await next()
}
