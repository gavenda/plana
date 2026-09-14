<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import { useSessionStore } from '@/stores/session'

const route = useRoute()
const session = useSessionStore()

/** The login and not-found screens stand alone, without nav chrome. */
const chromeless = computed(() => !session.isAuthenticated || route.meta.public === true)
</script>

<template>
  <div v-if="chromeless" class="grid min-h-full place-items-center p-6">
    <RouterView />
  </div>

  <div v-else class="grid min-h-full grid-cols-1 md:grid-cols-[240px_minmax(0,1fr)]">
    <AppSidebar />

    <div class="flex min-w-0 flex-col">
      <AppHeader />
      <main class="w-full max-w-[1100px] flex-1 px-4 py-5 md:px-7 md:py-7">
        <RouterView />
      </main>
    </div>
  </div>
</template>
