import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

import type { Context } from 'hono'

import { readSession } from './session'
import { isProduction } from '../env'

const VITE_DEV_PORT = Number(Bun.env.VITE_DEV_PORT ?? 5174)

/** Requests Vite owns in development: its client runtime, source modules and deps. */
const VITE_PREFIXES = ['/@', '/src/', '/node_modules/', '/__vite', '/public/']

export type SSRContext = {
  url: string
  user: unknown
}

export type RenderResult = {
  html: string
  head?: string
  state?: Record<string, unknown>
  redirect?: string
  status?: number
}

type RenderFn = (context: SSRContext) => Promise<RenderResult>

export type Renderer = {
  handle(c: Context): Promise<Response>
  close(): Promise<void>
}

/** Prevents a `</script>` inside serialized state from closing the inline script tag. */
function serializeState(state: Record<string, unknown>): string {
  return JSON.stringify(state).replace(/</g, '\\u003c')
}

function fillTemplate(template: string, result: RenderResult): string {
  return template
    .replace('<!--app-head-->', result.head ?? '')
    .replace('<!--app-html-->', result.html)
    .replace(
      '<!--app-state-->',
      result.state ? `<script>window.__PINIA__ = ${serializeState(result.state)}</script>` : '',
    )
}

async function renderPage(c: Context, template: string, render: RenderFn): Promise<Response> {
  const user = await readSession(c)
  const result = await render({ url: c.req.path + (new URL(c.req.url).search || ''), user })

  if (result.redirect) return c.redirect(result.redirect, 302)

  return c.html(fillTemplate(template, result), (result.status ?? 200) as 200)
}

// ---------------------------------------------------------------------------
// Development: Bun stays the front door and hands asset traffic to Vite.
// ---------------------------------------------------------------------------

async function createDevRenderer(): Promise<Renderer> {
  const { createServer } = await import('vite')

  const vite = await createServer({
    appType: 'custom',
    server: { port: VITE_DEV_PORT, strictPort: true },
  })
  await vite.listen()
  console.log(`[ssr] vite dev server on http://localhost:${VITE_DEV_PORT}`)

  async function proxy(c: Context): Promise<Response> {
    const incoming = new URL(c.req.url)
    const target = new URL(incoming.pathname + incoming.search, `http://localhost:${VITE_DEV_PORT}`)

    const headers = new Headers(c.req.raw.headers)
    headers.delete('host')

    return fetch(target, {
      method: c.req.method,
      headers,
      body: c.req.raw.body,
      redirect: 'manual',
    })
  }

  return {
    async handle(c) {
      const path = c.req.path
      if (VITE_PREFIXES.some((prefix) => path.startsWith(prefix))) return proxy(c)

      try {
        const raw = await Bun.file('index.html').text()
        const template = await vite.transformIndexHtml(path, raw)
        const module = await vite.ssrLoadModule('/src/entry-server.ts')
        return await renderPage(c, template, module.render as RenderFn)
      } catch (error) {
        // Rewrites the stack against original sources so the trace points at .vue files.
        if (error instanceof Error) vite.ssrFixStacktrace(error)
        console.error('[ssr] render failed:', error)
        return c.text(error instanceof Error ? error.stack || error.message : 'SSR error', 500)
      }
    },
    async close() {
      await vite.close()
    },
  }
}

// ---------------------------------------------------------------------------
// Production: read the built template and the prebuilt server bundle once.
// ---------------------------------------------------------------------------

async function createProdRenderer(): Promise<Renderer> {
  const template = await Bun.file('dist/client/index.html')
    .text()
    .catch(() => {
      console.error('[ssr] dist/client/index.html is missing. Run `bun run build` first.')
      process.exit(1)
    })

  const entry = pathToFileURL(resolve('dist/server/entry-server.js')).href
  const module = (await import(entry)) as { render: RenderFn }

  return {
    async handle(c) {
      try {
        return await renderPage(c, template, module.render)
      } catch (error) {
        console.error('[ssr] render failed:', error)
        return c.text('Internal server error', 500)
      }
    },
    async close() {},
  }
}

export function createRenderer(): Promise<Renderer> {
  return isProduction ? createProdRenderer() : createDevRenderer()
}
