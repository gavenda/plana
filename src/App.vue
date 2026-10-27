<script setup lang="ts">
import { computed, onMounted, ref, watchEffect } from 'vue'
import { useRoute } from 'vue-router'

import AppDialog from '@/components/AppDialog.vue'
import AppNavigationRail from '@/components/AppNavigationRail.vue'
import AppSnackbar from '@/components/AppSnackbar.vue'
import PhoneNotice from '@/components/PhoneNotice.vue'
import PlanaPortrait from '@/components/PlanaPortrait.vue'
import PlanaSays from '@/components/PlanaSays.vue'
import SchaleMark from '@/components/SchaleMark.vue'
import SupportingSheet from '@/components/SupportingSheet.vue'
import { useLiveStatus } from '@/lib/live'
import { notifyPageSwapped } from '@/lib/page-transition'
import { backdropUrl } from '@/lib/plana'
import { useRail } from '@/lib/rail'
import { useSnackbar } from '@/lib/snackbar'
import { useSessionStore } from '@/stores/session'

const route = useRoute()

/**
 * Both pages animate at once, so the leaving one is taken out of the flow and fixed where it
 * stands: the new page lays out in its place, and scrolling to it doesn't move the old one.
 */
function pinLeavingPage(el: Element) {
  if (!(el instanceof HTMLElement)) return
  const { top, left, width, height } = el.getBoundingClientRect()
  Object.assign(el.style, {
    position: 'fixed',
    top: `${top}px`,
    left: `${left}px`,
    width: `${width}px`,
    height: `${height}px`,
    margin: '0',
  })
}
const session = useSessionStore()
const { expanded: railExpanded, still: railStill, restore: restoreRail } = useRail()

/** The login and not-found screens stand alone, without nav chrome. */
const chromeless = computed(() => !session.isAuthenticated || route.meta.public === true)

onMounted(restoreRail)

const aboutOpen = ref(false)

/** A standing snackbar while the live connection is down: pages still work, but stop updating. */
const { failing: liveFailing, lost: liveLost } = useLiveStatus()
const snackbar = useSnackbar()
watchEffect(() => {
  if (liveLost.value) {
    snackbar.showStanding('Live updates stopped. Your access may have been revoked.', {
      error: true,
    })
  } else if (liveFailing.value) {
    snackbar.showStanding('Connection lost. Reconnecting…', { busy: true })
  } else {
    snackbar.clearStanding()
  }
})

/** Signing out asks first, in her voice. */
const confirmingSignOut = ref(false)
const signingOut = ref(false)

async function signOut() {
  signingOut.value = true
  try {
    await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' })
  } finally {
    window.location.href = '/login'
  }
}
</script>

<template>
  <PhoneNotice />

  <!-- Sign-in and 404: the panel centred, with Schale's emblem in the footer beneath it, over a
       faint backdrop of her seaside scene. A page with a scene (sign-in) draws its own art on the
       left from the large class up, so the panel, the footer and the backdrop move aside for it. -->
  <div v-if="chromeless" class="relative isolate flex min-h-full phone:hidden">
    <img
      class="pointer-events-none fixed inset-0 -z-10 size-full object-cover opacity-50 blur-md select-none"
      :class="{ 'large:hidden': route.meta.scene }"
      :src="backdropUrl"
      alt=""
      aria-hidden="true"
    />
    <div
      class="flex flex-1 flex-col p-6"
      :class="{ 'large:ml-auto large:w-scene-panel large:flex-none': route.meta.scene }"
    >
      <div class="grid flex-1 place-items-center">
        <RouterView />
      </div>
      <footer class="flex justify-center pt-6">
        <SchaleMark class="w-24 text-on-surface-variant" />
      </footer>
    </div>
  </div>

  <!-- No top app bar: the rail marks where you are. The page makes room for the rail (`.shell` in
       main.css): a slim one always, an open one only where it fits beside the page. -->
  <div
    v-else
    class="shell min-h-full phone:hidden"
    :data-rail-open="railExpanded"
    :data-rail-still="railStill"
  >
    <AppNavigationRail @sign-out="confirmingSignOut = true" @about="aboutOpen = true" />

    <!-- Clipped sideways so a page sliding in or out never brings up a horizontal scrollbar. -->
    <main
      class="flex w-full flex-col overflow-x-clip px-6 py-6"
      :class="route.meta.fit ? 'h-dvh' : 'min-h-dvh'"
    >
      <!-- Pages are titled for assistive tech only, as the rail already shows where you are. -->
      <h1 class="sr-only">{{ route.meta.title }}</h1>
      <!-- A page that fits the window fills what the footer leaves and scrolls its own panes. -->
      <div class="flex-1" :class="route.meta.fit && 'flex min-h-0 flex-col'">
        <!-- Only a change of page animates; a change of query keeps the same page in place. -->
        <RouterView v-slot="{ Component, route: shown }">
          <Transition
            :name="shown.meta.transition ?? 'page-fade'"
            @before-leave="pinLeavingPage"
            @before-enter="notifyPageSwapped"
          >
            <component :is="Component" :key="shown.path" />
          </Transition>
        </RouterView>
      </div>
      <!-- Schale's emblem closes every page, as on the stand-alone ones: after the content, or at
           the foot of the window when the page is short. -->
      <footer class="flex justify-center pt-10">
        <SchaleMark class="w-24 text-on-surface-variant" />
      </footer>
    </main>

    <AppSnackbar />

    <!-- Opened from the rail's mark and name. -->
    <SupportingSheet v-model:open="aboutOpen" label="About Plana">
      <section
        aria-label="About"
        class="flex flex-col items-center gap-3 px-2 pt-2 pb-4 text-center"
      >
        <PlanaSays mood="content" layout="column"
          >Connection confirmed. I've been waiting for you, Sensei.</PlanaSays
        >
        <p class="mt-2 text-body-medium text-on-surface-variant">
          Administered by <span class="text-tertiary">Plana</span>, OS of the Shittim Chest
        </p>
        <p class="text-body-small text-on-surface-variant">
          Character design by DoReMi, from Blue Archive.
        </p>
      </section>
    </SupportingSheet>

    <AppDialog v-model:open="confirmingSignOut" headline="You mean that?">
      <template #hero><PlanaPortrait mood="hesitant" /></template>
      I'll be standing by until you return, Sensei.
      <template #actions>
        <button class="btn btn-text" type="button" @click="confirmingSignOut = false">Stay</button>
        <button class="btn btn-text" type="button" :disabled="signingOut" @click="signOut">
          Sign out
        </button>
      </template>
    </AppDialog>
  </div>
</template>
