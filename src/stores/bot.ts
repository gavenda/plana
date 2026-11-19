import { ref } from 'vue'
import { defineStore } from 'pinia'

/** The bot's own Discord profile and what it was set up to do, filled in when the page is served. */
export const useBotStore = defineStore('bot', () => {
  /** Its custom avatar; null when it has none or was not connected yet. */
  const avatarUrl = ref<string | null>(null)
  /** Whether it controls Vivy, the music bot (VIVY_CONTROL), which shows the Music page. */
  const music = ref(false)

  function setAvatarUrl(next: string | null) {
    avatarUrl.value = next
  }

  function setFeatures(features: { music: boolean }) {
    music.value = features.music
  }

  return { avatarUrl, music, setAvatarUrl, setFeatures }
})
