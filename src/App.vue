<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import AppDialog from '@/components/AppDialog.vue'
import AppNavigationRail from '@/components/AppNavigationRail.vue'
import PhoneNotice from '@/components/PhoneNotice.vue'
import PlanaPortrait from '@/components/PlanaPortrait.vue'
import SchaleMark from '@/components/SchaleMark.vue'
import { backdropUrl } from '@/lib/plana'
import { useRail } from '@/lib/rail'
import { useSessionStore } from '@/stores/session'

const route = useRoute()
const session = useSessionStore()
const { expanded: railExpanded, still: railStill, restore: restoreRail } = useRail()

/** The login and not-found screens stand alone, without nav chrome. */
const chromeless = computed(() => !session.isAuthenticated || route.meta.public === true)

onMounted(restoreRail)

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
       faint backdrop of her seaside scene. -->
  <div v-if="chromeless" class="relative isolate flex min-h-full flex-col p-6 phone:hidden">
    <img
      class="pointer-events-none fixed inset-0 -z-10 size-full object-cover opacity-24 select-none"
      :src="backdropUrl"
      alt=""
      aria-hidden="true"
    />
    <div class="grid flex-1 place-items-center">
      <RouterView />
    </div>
    <footer class="flex justify-center pt-6">
      <SchaleMark class="w-24 text-on-surface-variant" />
    </footer>
  </div>

  <!-- No top app bar: the rail marks where you are. The page makes room for the rail (`.shell` in
       main.css): a slim one always, an open one only where it fits beside the page. -->
  <div
    v-else
    class="shell min-h-full phone:hidden"
    :data-rail-open="railExpanded"
    :data-rail-still="railStill"
  >
    <AppNavigationRail @sign-out="confirmingSignOut = true" />

    <main class="w-full px-6 py-6">
      <!-- Pages are titled for assistive tech only, as the rail already shows where you are. -->
      <h1 class="sr-only">{{ route.meta.title }}</h1>
      <RouterView />
    </main>

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
