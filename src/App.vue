<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import AppHeader from '@/components/AppHeader.vue'
import AppNavigationRail from '@/components/AppNavigationRail.vue'
import PhoneNotice from '@/components/PhoneNotice.vue'
import { useSessionStore } from '@/stores/session'

const route = useRoute()
const session = useSessionStore()

/** The login and not-found screens stand alone, without nav chrome. */
const chromeless = computed(() => !session.isAuthenticated || route.meta.public === true)
</script>

<template>
  <PhoneNotice />

  <div v-if="chromeless" class="grid min-h-full place-items-center p-6 phone:hidden">
    <RouterView />
  </div>

  <div v-else class="flex min-h-full phone:hidden">
    <AppNavigationRail />

    <div class="flex min-w-0 flex-1 flex-col">
      <AppHeader />
      <main class="w-full max-w-[1200px] flex-1 px-6 pb-8">
        <RouterView />
      </main>
    </div>
  </div>
</template>
