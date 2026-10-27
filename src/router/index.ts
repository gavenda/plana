import {
  createRouter,
  createWebHistory,
  type RouteRecordRaw,
  type Router,
  type RouterHistory,
} from 'vue-router'

import { pageSwapped } from '@/lib/page-transition'
import { useSessionStore } from '@/stores/session'

declare module 'vue-router' {
  interface RouteMeta {
    title: string
    /** Reachable without a session. */
    public?: boolean
    /** Administrators only; moderators are sent to the overview. */
    adminOnly?: boolean
    /** Fills the left of the window with art and moves the page to a column on the right. */
    scene?: boolean
    /** Fits the window above the footer and scrolls its own panes, rather than the page scrolling. */
    fit?: boolean
    /** The page's main action, as a FAB in the rail; the page gives it its action (`useRailFab`). */
    fab?: { label: string; icon: string }
    /** How far below a rail destination the page sits; 0 (unset) is a destination itself. */
    depth?: number
    /** Set on each navigation: how the page arrives. */
    transition?: PageTransition
  }
}

/**
 * M3 transition patterns: going deeper or back up slides along the x axis (shared axis); moving
 * between rail destinations, which have no order, fades through.
 */
export type PageTransition = 'page-forward' | 'page-back' | 'page-fade'

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { title: 'Sign in', public: true, scene: true },
  },
  {
    path: '/',
    name: 'overview',
    component: () => import('@/views/OverviewView.vue'),
    meta: { title: 'Overview' },
  },
  {
    path: '/queue',
    name: 'queue',
    component: () => import('@/views/QueueView.vue'),
    meta: { title: 'Triage queue' },
  },
  {
    path: '/broadcast',
    name: 'broadcast',
    component: () => import('@/views/BroadcastView.vue'),
    meta: { title: 'Broadcast', adminOnly: true },
  },
  {
    path: '/members',
    name: 'members',
    component: () => import('@/views/MembersView.vue'),
    meta: { title: 'Members', fit: true },
  },
  {
    path: '/birthdays',
    name: 'birthdays',
    component: () => import('@/views/BirthdaysView.vue'),
    meta: { title: 'Birthdays', fab: { label: 'Add birthday', icon: 'add' } },
  },
  {
    path: '/activity',
    name: 'activity',
    component: () => import('@/views/ActivityView.vue'),
    meta: { title: 'Games & music' },
  },
  {
    path: '/activity/game-nights',
    name: 'game-nights',
    component: () => import('@/views/GameNightsView.vue'),
    meta: { title: 'Game nights', adminOnly: true, depth: 1 },
  },
  {
    path: '/voice',
    name: 'voice',
    component: () => import('@/views/VoiceView.vue'),
    meta: { title: 'Voice' },
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('@/views/SettingsView.vue'),
    meta: { title: 'Settings', adminOnly: true },
  },
  {
    path: '/audit',
    name: 'audit',
    component: () => import('@/views/AuditView.vue'),
    meta: { title: 'Audit log' },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/views/NotFoundView.vue'),
    meta: { title: 'Not found', public: true },
  },
]

export function createAppRouter(history?: RouterHistory): Router {
  const router = createRouter({
    history: history ?? createWebHistory(import.meta.env.BASE_URL),
    routes,
    scrollBehavior: (to, from, savedPosition) => {
      // The first page is already in place: nothing to wait for.
      if (from.matched.length === 0) return savedPosition ?? { top: 0 }
      // Query-only changes (opening a supporting pane, changing a filter) stay where the reader is.
      if (to.path === from.path) return false
      // Scroll once the new page is in, not under the old one as it leaves.
      return pageSwapped().then(() => savedPosition ?? { top: 0 })
    },
  })

  router.beforeEach((to) => {
    const session = useSessionStore()

    if (!to.meta.public && !session.isAuthenticated) {
      return { name: 'login', query: to.fullPath === '/' ? {} : { next: to.fullPath } }
    }
    if (to.name === 'login' && session.isAuthenticated) {
      return { name: 'overview' }
    }
    if (to.meta.adminOnly && !session.isAdmin) {
      return { name: 'overview' }
    }
    return true
  })

  router.afterEach((to, from) => {
    const toDepth = to.meta.depth ?? 0
    const fromDepth = from.meta.depth ?? 0
    to.meta.transition =
      toDepth > fromDepth ? 'page-forward' : toDepth < fromDepth ? 'page-back' : 'page-fade'
  })

  // SSR emits the initial title; this keeps it correct across client-side routing.
  router.afterEach((to) => {
    if (typeof document !== 'undefined') {
      document.title = `${to.meta.title} \u00b7 Plana`
    }
  })

  return router
}
