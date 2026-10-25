import { ref } from 'vue'
import { defineStore } from 'pinia'

/** The bot's own Discord profile, filled in when the page is served. */
export const useBotStore = defineStore('bot', () => {
  /** Its custom avatar; null when it has none or was not connected yet. */
  const avatarUrl = ref<string | null>(null)

  function setAvatarUrl(next: string | null) {
    avatarUrl.value = next
  }

  return { avatarUrl, setAvatarUrl }
})
