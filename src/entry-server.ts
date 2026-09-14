import { renderToString } from 'vue/server-renderer'
import { createMemoryHistory } from 'vue-router'

import { createApp } from './app'
import { useSessionStore, type SessionUser } from './stores/session'

export type SSRContext = {
  url: string
  user: SessionUser | null
}

export type RenderResult = {
  html: string
  head?: string
  state?: Record<string, unknown>
  redirect?: string
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] as string,
  )
}

export async function render(context: SSRContext): Promise<RenderResult> {
  const { app, router, pinia } = createApp(createMemoryHistory())

  useSessionStore(pinia).setUser(context.user)

  await router.push(context.url)
  await router.isReady()

  const route = router.currentRoute.value

  // A navigation guard rewrote the target (usually an unauthenticated visitor being
  // sent to /login). Let the browser follow a real redirect instead of rendering
  // one URL's markup under another URL.
  if (route.fullPath !== context.url) {
    return { html: '', redirect: route.fullPath }
  }

  const html = await renderToString(app)

  return {
    html,
    head: `<title>${escapeHtml(route.meta.title ?? 'Plana')} · Plana</title>`,
    state: pinia.state.value,
  }
}
