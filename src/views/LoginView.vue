<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

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

const error = computed(() => {
  const code = route.query.error
  return typeof code === 'string' ? (MESSAGES[code] ?? 'Sign-in failed.') : null
})
</script>

<template>
  <div
    class="flex w-full max-w-[400px] flex-col items-center gap-3.5 rounded-lg border border-line bg-surface px-8 py-10 text-center shadow-[0_8px_24px_rgba(0,0,0,0.32)]"
  >
    <div
      class="grid h-12 w-12 place-items-center rounded-xl bg-accent text-[22px] font-bold text-white"
      aria-hidden="true"
    >
      P
    </div>

    <h1 class="text-[22px] font-semibold">Plana</h1>
    <p class="-mt-2 text-sm text-muted">Administrative dashboard for your Discord server.</p>

    <p v-if="error" class="alert alert-error">{{ error }}</p>

    <a class="btn btn-primary w-full px-4 py-3" :href="loginHref">
      <svg viewBox="0 0 24 18" width="20" height="15" aria-hidden="true">
        <path
          fill="currentColor"
          d="M20.3 1.6A19.8 19.8 0 0 0 15.4.1l-.3.5a18.3 18.3 0 0 1 4.4 1.4A17.6 17.6 0 0 0 12 .9a17.7 17.7 0 0 0-7.5 1.1A18.3 18.3 0 0 1 8.9.6L8.6.1A19.8 19.8 0 0 0 3.7 1.6C.6 6.2-.3 10.7.2 15.2a19.9 19.9 0 0 0 6 3 14.6 14.6 0 0 0 1.3-2.1 13 13 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 12 0l.5.4a13 13 0 0 1-2 1 14.6 14.6 0 0 0 1.3 2.1 19.9 19.9 0 0 0 6-3c.6-5.2-.8-9.7-3.5-13.6ZM8 12.4c-1.2 0-2.1-1.1-2.1-2.4S6.8 7.6 8 7.6s2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm8 0c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z"
        />
      </svg>
      Sign in with Discord
    </a>

    <p class="mt-0.5 text-[13px] text-faint">
      You need the Administrator permission in the server to sign in.
    </p>
  </div>
</template>
