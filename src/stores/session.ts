import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

export type SessionUser = {
  id: string
  username: string
  displayName: string
  avatar: string | null
  /**
   * What they may do, checked live against Discord when the page is served. Only shapes what
   * the dashboard shows: the API re-checks every request.
   */
  access?: 'admin' | 'moderator' | 'viewer' | null
}

export const useSessionStore = defineStore('session', () => {
  const user = ref<SessionUser | null>(null)

  const isAuthenticated = computed(() => user.value !== null)
  const isAdmin = computed(() => user.value?.access === 'admin')
  /** Holds the stats role: sees the stats pages and nothing staff-only. */
  const isViewer = computed(() => user.value?.access === 'viewer')

  function setUser(next: SessionUser | null) {
    user.value = next
  }

  return { user, isAuthenticated, isAdmin, isViewer, setUser }
})
