import { randomBytes, timingSafeEqual } from 'node:crypto'

import { Hono } from 'hono'

import { isReady } from '../discord/client'
import { isGuildAdmin } from '../discord/service'
import { env } from '../env'
import { endSession, readSession, setStateCookie, startSession, takeStateCookie } from './session'
import type { AppEnv } from './session'

const DISCORD_API = 'https://discord.com/api/v10'
const REDIRECT_PATH = '/auth/callback'
/** Membership and permissions are read through the bot, so the user grant stays minimal. */
const SCOPES = 'identify'

type DiscordUser = {
  id: string
  username: string
  global_name: string | null
  avatar: string | null
}

function redirectUri(): string {
  return new URL(REDIRECT_PATH, env.PUBLIC_BASE_URL).toString()
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

/**
 * Only same-site absolute paths may be used as a post-login destination.
 * `//evil.com` and `https://evil.com` are both rejected, so the callback cannot be
 * turned into an open redirect.
 */
function safeNext(value: string | undefined): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return null
  return value
}

function loginError(code: string): Response {
  return Response.redirect(new URL(`/login?error=${code}`, env.PUBLIC_BASE_URL).toString(), 302)
}

async function exchangeCode(code: string): Promise<string | null> {
  const response = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(
        `${env.DISCORD_CLIENT_ID}:${env.DISCORD_CLIENT_SECRET}`,
      ).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(),
    }),
  })

  if (!response.ok) {
    console.error('[auth] token exchange failed:', response.status, await response.text())
    return null
  }

  const token = (await response.json()) as { access_token?: string }
  return token.access_token ?? null
}

async function fetchUser(accessToken: string): Promise<DiscordUser | null> {
  const response = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) {
    console.error('[auth] /users/@me failed:', response.status)
    return null
  }
  return (await response.json()) as DiscordUser
}

export const authRoutes = new Hono<AppEnv>()

authRoutes.get('/login', async (c) => {
  const state = randomBytes(16).toString('base64url')
  await setStateCookie(c, { state, next: safeNext(c.req.query('next')) })

  const url = new URL('https://discord.com/oauth2/authorize')
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', env.DISCORD_CLIENT_ID)
  url.searchParams.set('scope', SCOPES)
  url.searchParams.set('redirect_uri', redirectUri())
  url.searchParams.set('state', state)
  url.searchParams.set('prompt', 'none')

  return c.redirect(url.toString())
})

authRoutes.get('/callback', async (c) => {
  const code = c.req.query('code')
  const state = c.req.query('state')
  const expected = await takeStateCookie(c)

  if (c.req.query('error')) return loginError('denied')
  if (!code || !state || !expected || !safeEqual(state, expected.state)) {
    return loginError('state')
  }

  const accessToken = await exchangeCode(code)
  if (!accessToken) return loginError('exchange')

  const user = await fetchUser(accessToken)
  if (!user) return loginError('profile')

  if (!isReady()) return loginError('not_ready')
  if (!(await isGuildAdmin(user.id))) return loginError('forbidden')

  await startSession(c, {
    id: user.id,
    username: user.username,
    displayName: user.global_name ?? user.username,
    avatar: user.avatar
      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
      : null,
  })

  return c.redirect(expected.next ?? '/')
})

authRoutes.post('/logout', async (c) => {
  await endSession(c)
  return c.json({ ok: true })
})

/** Unauthenticated probe used by the client to decide whether to show the app shell. */
authRoutes.get('/me', async (c) => {
  const user = await readSession(c)
  return c.json({ user })
})
