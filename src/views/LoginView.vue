<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import PlanaSays from '@/components/PlanaSays.vue'
import { sceneUrls, type PlanaMood, type SceneFrame } from '@/lib/plana'

const route = useRoute()

const MESSAGES: Record<string, string> = {
  denied: 'Sign-in was cancelled.',
  state: 'That sign-in link expired. Please try again.',
  exchange: 'Discord rejected the sign-in. Please try again.',
  profile: 'Could not read your Discord profile. Please try again.',
  forbidden: 'This account isn’t cleared for the Shittim Chest.',
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

/**
 * The scene on the left: she looks at you, raises a finger, and the scan grid comes up around
 * it. Each frame is drawn over the one before, so a crossfade never dips through the page.
 */
const FRAMES: SceneFrame[] = ['look', 'raise', 'scan']
const frame = ref<SceneFrame>('look')
const shown = (f: SceneFrame) => FRAMES.indexOf(f) <= FRAMES.indexOf(frame.value)

/** How long the button must be held to sign in; the button's fill takes as long. */
const HOLD_MS = 2500

const timers: number[] = []
function clearTimers() {
  timers.splice(0).forEach((t) => window.clearTimeout(t))
}

/** Set once the check has finished and the browser is on its way to Discord. */
const verified = ref(false)
/** Set when Sensei lets go before the check finishes; cleared by the next press. */
const interrupted = ref(false)

/** The check is only played where the scene is on screen and motion isn't reduced. */
function scenePlays(): boolean {
  return (
    window.matchMedia('(min-width: 1200px)').matches &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/** Plays the fingerprint check; if nothing cancels it, leaves for Discord at the end. */
function startCheck() {
  clearTimers()
  interrupted.value = false
  frame.value = 'raise'
  timers.push(window.setTimeout(() => (frame.value = 'scan'), 350))
  timers.push(
    window.setTimeout(() => {
      verified.value = true
      window.location.assign(loginHref.value)
    }, HOLD_MS),
  )
}

/** Letting go early turns her back, as a failed sign-in does. */
function cancelCheck() {
  if (verified.value || frame.value === 'look') return
  clearTimers()
  frame.value = 'look'
  interrupted.value = true
}

const opensElsewhere = (e: MouseEvent) => e.metaKey || e.ctrlKey || e.shiftKey || e.altKey

/** Holding the button is holding a finger to the scanner: the check runs while it's held. */
function onPress(event: PointerEvent) {
  if (event.button !== 0 || opensElsewhere(event) || verified.value || !scenePlays()) return
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  startCheck()
}

/**
 * A pointer's click never signs in by itself where the scene plays; the hold does. A keyboard
 * can't hold, so Enter plays the check through. Elsewhere the link is followed as usual.
 */
function onClick(event: MouseEvent) {
  if (opensElsewhere(event) || !scenePlays()) return
  event.preventDefault()
  const fromKeyboard = event.detail === 0
  if (fromKeyboard && frame.value === 'look' && !verified.value) startCheck()
}

/** Coming back with the browser's Back button restores the page as it was left; reset her. */
function onPageShow(event: PageTransitionEvent) {
  if (!event.persisted) return
  clearTimers()
  verified.value = false
  interrupted.value = false
  frame.value = 'look'
}
onMounted(() => window.addEventListener('pageshow', onPageShow))
onBeforeUnmount(() => {
  window.removeEventListener('pageshow', onPageShow)
  clearTimers()
})

/** She refuses someone who isn't staff; any other failure only unsettles her. */
const plana = computed<{ mood: PlanaMood; line: string }>(() => {
  if (frame.value !== 'look') return { mood: 'standby', line: 'Verifying. Please hold still.' }
  if (interrupted.value) {
    return { mood: 'uneasy', line: 'Verification interrupted. Please hold until I finish.' }
  }
  if (!code.value) return { mood: 'standby', line: 'Standing by. Please verify your identity.' }
  if (code.value === 'forbidden') {
    return { mood: 'stern', line: "Verification failed. I can't let you in." }
  }
  return { mood: 'uneasy', line: "That didn't connect. Please try again." }
})
</script>

<template>
  <!-- The scene, inset on the left; App.vue moves the panel into the column beside it. -->
  <div
    class="pointer-events-none fixed inset-y-6 right-scene-panel left-6 -z-10 hidden overflow-hidden rounded-3xl bg-surface-container-low select-none large:block"
    aria-hidden="true"
  >
    <img
      v-for="f in FRAMES"
      :key="f"
      class="absolute inset-0 size-full object-cover object-[70%_40%] transition-opacity duration-300 ease-effects-slow"
      :class="shown(f) ? 'opacity-100' : 'opacity-0'"
      :src="sceneUrls[f]"
      alt=""
      decoding="async"
    />
  </div>

  <div class="flex w-full justify-center">
    <div
      class="card card-elevated flex w-full max-w-[420px] flex-col items-center gap-4 px-10 py-12 text-center"
    >
      <h1 class="sr-only">Sign in to Plana</h1>
      <PlanaSays :mood="plana.mood" layout="column">{{ plana.line }}</PlanaSays>

      <p v-if="error" class="card card-error px-4 py-3">{{ error }}</p>

      <a
        class="btn btn-md btn-filled isolate mt-2 w-full touch-none overflow-hidden [-webkit-touch-callout:none]"
        :href="loginHref"
        draggable="false"
        :aria-disabled="verified"
        @pointerdown="onPress"
        @pointerup="cancelCheck"
        @pointercancel="cancelCheck"
        @lostpointercapture="cancelCheck"
        @contextmenu="frame !== 'look' && $event.preventDefault()"
        @click="onClick"
      >
        <!-- The hold's progress: fills left to right while held, and drains fast on letting go. -->
        <span
          class="absolute inset-0 -z-10 origin-left bg-on-primary/24"
          :class="
            frame === 'look'
              ? 'scale-x-0 transition-transform duration-200 ease-effects'
              : 'scale-x-100 transition-transform ease-linear'
          "
          :style="frame === 'look' ? undefined : { transitionDuration: `${HOLD_MS}ms` }"
          aria-hidden="true"
        />
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
