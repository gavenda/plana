import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

export type SessionUser = {
  id: string
  username: string
  displayName: string
  avatar: string | null
}

export const useSessionStore = defineStore('session', () => {
  const user = ref<SessionUser | null>(null)

  const isAuthenticated = computed(() => user.value !== null)

  function setUser(next: SessionUser | null) {
    user.value = next
  }

  return { user, isAuthenticated, setUser }
})
