<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'

import { logoUrl } from '@/lib/plana'

type Destination = { to: string; label: string; icon: string }

/** Icon names are Material Symbols; add new ones to the icon_names list in index.html. */
const destinations: Destination[] = [
  { to: '/', label: 'Overview', icon: 'dashboard' },
  { to: '/queue', label: 'Triage', icon: 'how_to_reg' },
  { to: '/broadcast', label: 'Broadcast', icon: 'campaign' },
  { to: '/birthdays', label: 'Birthdays', icon: 'cake' },
  { to: '/audit', label: 'Audit log', icon: 'history' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
]

const version = __APP_VERSION__

const STORAGE_KEY = 'plana:rail-expanded'

// Starts collapsed so the server render and first client render agree;
// the remembered preference is applied after hydration.
const expanded = ref(false)

onMounted(() => {
  try {
    expanded.value = localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    // Storage can be unavailable (private windows, blocked site data).
  }
})

watch(expanded, (value) => {
  try {
    localStorage.setItem(STORAGE_KEY, value ? '1' : '0')
  } catch {
    // Not worth surfacing; the rail just forgets.
  }
})
</script>

<template>
  <nav
    aria-label="Main"
    class="sticky top-0 flex h-dvh shrink-0 flex-col gap-1 overflow-x-hidden overflow-y-auto bg-surface pt-5 pb-6 transition-[width] duration-500 ease-spatial"
    :class="expanded ? 'w-[240px] px-3' : 'w-24 items-center'"
  >
    <!-- The app's mark, in either state, with its name and version beside it once the rail is
         open. It is a mark, not a control (no link, and never beside the menu button, which sits
         beneath it); Overview is the way home. -->
    <div
      class="flex h-12 items-center"
      :class="expanded ? 'px-2' : 'justify-center'"
      aria-hidden="true"
    >
      <img class="size-10 shrink-0 rounded-full" :src="logoUrl" alt="" width="40" height="40" />
      <span v-if="expanded" class="flex items-baseline gap-1.5 truncate pl-3 text-on-surface">
        <span class="text-title-large">Plana</span>
        <span class="text-label-small text-on-surface-variant">v{{ version }}</span>
      </span>
    </div>

    <div class="mb-6 flex h-14 items-center" :class="expanded ? 'px-2' : 'justify-center'">
      <button
        class="icon-btn text-on-surface"
        type="button"
        :aria-expanded="expanded"
        :aria-label="expanded ? 'Collapse navigation' : 'Expand navigation'"
        @click="expanded = !expanded"
      >
        <span class="icon" aria-hidden="true">{{ expanded ? 'menu_open' : 'menu' }}</span>
      </button>
    </div>

    <RouterLink
      v-for="item in destinations"
      :key="item.to"
      v-slot="{ href, navigate, isActive, isExactActive }"
      :to="item.to"
      custom
    >
      <a
        :href="href"
        :aria-current="(item.to === '/' ? isExactActive : isActive) ? 'page' : undefined"
        class="group outline-none"
        :class="expanded ? 'block w-full' : 'flex w-full flex-col items-center gap-1 pb-3'"
        @click="navigate"
      >
        <!-- The active indicator: a pill behind the icon (collapsed) or the whole row (expanded). -->
        <span
          class="state-layer flex items-center rounded-full transition-[background-color,color,width] duration-200 ease-effects group-focus-visible:outline-3 group-focus-visible:outline-offset-2 group-focus-visible:outline-secondary"
          :class="[
            expanded ? 'h-14 w-full gap-3 px-4' : 'h-8 w-14 justify-center',
            (item.to === '/' ? isExactActive : isActive)
              ? 'bg-secondary-container text-on-secondary-container'
              : 'text-on-surface-variant',
          ]"
        >
          <span
            class="icon"
            :class="(item.to === '/' ? isExactActive : isActive) && 'icon-filled'"
            aria-hidden="true"
            >{{ item.icon }}</span
          >
          <span v-if="expanded" class="truncate text-label-large">{{ item.label }}</span>
        </span>

        <span
          v-if="!expanded"
          class="text-center text-label-medium"
          :class="
            (item.to === '/' ? isExactActive : isActive)
              ? 'text-secondary'
              : 'text-on-surface-variant'
          "
          >{{ item.label }}</span
        >
      </a>
    </RouterLink>
  </nav>
</template>
