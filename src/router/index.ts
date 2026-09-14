import {
  createRouter,
  createWebHistory,
  type RouteRecordRaw,
  type Router,
  type RouterHistory,
} from 'vue-router'

import { useSessionStore } from '@/stores/session'

declare module 'vue-router' {
  interface RouteMeta {
    title: string
    /** Reachable without a session. */
    public?: boolean
  }
}

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { title: 'Sign in', public: true },
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
    meta: { title: 'Broadcast' },
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('@/views/SettingsView.vue'),
    meta: { title: 'Settings' },
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
    scrollBehavior: () => ({ top: 0 }),
  })

  router.beforeEach((to) => {
    const session = useSessionStore()

    if (!to.meta.public && !session.isAuthenticated) {
      return { name: 'login', query: to.fullPath === '/' ? {} : { next: to.fullPath } }
    }
    if (to.name === 'login' && session.isAuthenticated) {
      return { name: 'overview' }
    }
    return true
  })

  // SSR emits the initial title; this keeps it correct across client-side routing.
  router.afterEach((to) => {
    if (typeof document !== 'undefined') {
      document.title = `${to.meta.title} \u00b7 Plana`
    }
  })

  return router
}
