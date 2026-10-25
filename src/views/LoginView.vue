<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import PlanaSays from '@/components/PlanaSays.vue'
import type { PlanaMood } from '@/lib/plana'

const route = useRoute()

const MESSAGES: Record<string, string> = {
  denied: 'Sign-in was cancelled.',
  state: 'That sign-in link expired. Please try again.',
  exchange: 'Discord rejected the sign-in. Please try again.',
  profile: 'Could not read your Discord profile. Please try again.',
  forbidden: 'That account is not an administrator of this server.',
  not_ready: 'The bot is still connecting to Discord. Try again in a moment.',
}

/** Carries the page the router bounced us from through the OAuth round trip. */
const loginHref = computed(() => {
  const next = route.query.next
  return typeof next === 'string' && next.startsWith('/')
    ? `/auth/login?next=${encodeURIComponent(next)}`
    : '/auth/login'
})

const code = computed(() => (typeof route.query.error === 'string' ? route.query.error : null))
const error = computed(() => (code.value ? (MESSAGES[code.value] ?? 'Sign-in failed.') : null))

/** She refuses someone who isn't an administrator; any other failure only unsettles her. */
const plana = computed<{ mood: PlanaMood; line: string }>(() => {
  if (!code.value) return { mood: 'standby', line: 'Standing by. Please verify your identity.' }
  if (code.value === 'forbidden') {
    return { mood: 'stern', line: "Verification failed. I can't let you in." }
  }
  return { mood: 'uneasy', line: "That didn't connect. Please try again." }
})
</script>

<template>
  <div class="flex w-full justify-center">
    <div
      class="flex w-full max-w-[420px] flex-col items-center gap-4 rounded-3xl bg-surface-container-low px-10 py-12 text-center shadow-level1"
    >
      <h1 class="sr-only">Sign in to Plana</h1>
      <PlanaSays :mood="plana.mood" :size="128" layout="column">{{ plana.line }}</PlanaSays>

      <p v-if="error" class="alert alert-error">{{ error }}</p>

      <a class="btn btn-filled mt-2 h-14 w-full text-title-medium" :href="loginHref">
        <svg viewBox="0 0 24 18" width="20" height="15" aria-hidden="true">
          <path
            fill="currentColor"
            d="M20.3 1.6A19.8 19.8 0 0 0 15.4.1l-.3.5a18.3 18.3 0 0 1 4.4 1.4A17.6 17.6 0 0 0 12 .9a17.7 17.7 0 0 0-7.5 1.1A18.3 18.3 0 0 1 8.9.6L8.6.1A19.8 19.8 0 0 0 3.7 1.6C.6 6.2-.3 10.7.2 15.2a19.9 19.9 0 0 0 6 3 14.6 14.6 0 0 0 1.3-2.1 13 13 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 12 0l.5.4a13 13 0 0 1-2 1 14.6 14.6 0 0 0 1.3 2.1 19.9 19.9 0 0 0 6-3c.6-5.2-.8-9.7-3.5-13.6ZM8 12.4c-1.2 0-2.1-1.1-2.1-2.4S6.8 7.6 8 7.6s2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm8 0c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z"
          />
        </svg>
        Sign in with Discord
      </a>
    </div>
  </div>
</template>
