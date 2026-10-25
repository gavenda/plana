<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import RailItem from '@/components/RailItem.vue'
import { logoUrl } from '@/lib/plana'
import { railDocks, useRail } from '@/lib/rail'
import { useGuildStore } from '@/stores/guild'
import { useSessionStore } from '@/stores/session'

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

const emit = defineEmits<{ signOut: [] }>()

const version = __APP_VERSION__
const session = useSessionStore()
const { expanded, toggle, collapse } = useRail()

const guild = useGuildStore()

const initial = computed(() => session.user?.displayName.trim().charAt(0).toUpperCase() || '?')

/** The server this dashboard runs, shown with the account at the foot of the open rail. */
const server = computed(() => {
  const info = guild.directory?.guild
  if (!info) return null
  return {
    name: info.name,
    iconUrl: info.iconUrl,
    initial: info.name.trim().charAt(0).toUpperCase() || '?',
    members: `${info.memberCount.toLocaleString()} ${info.memberCount === 1 ? 'member' : 'members'}`,
  }
})

/** A floating rail is in the way once it has done its job; a docked one stays put. */
function afterChoice() {
  if (!railDocks()) collapse()
}

function signOut() {
  afterChoice()
  emit('signOut')
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && expanded.value) collapse()
}

/**
 * The open rail is as wide as what it holds (the longest label, the account card), as M3's
 * expanded rail is: its content plus a 20px margin, between 220 and 360. The content is always
 * laid out at its open size (the slim rail only clips it), so its width can be read at any time,
 * and the page is told through `--rail-open` how far to move aside.
 */
const innerEl = ref<HTMLElement | null>(null)
let observer: ResizeObserver | undefined

function measure() {
  const width = innerEl.value?.offsetWidth
  if (!width) return
  document.documentElement.style.setProperty(
    '--rail-open',
    `${Math.min(360, Math.max(220, width + 20))}px`,
  )
}

onMounted(() => {
  // The rail shows without the server if this fails.
  void guild.load()
  measure()
  if (innerEl.value && typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(measure)
    observer.observe(innerEl.value)
  }
})

onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <!-- Below the expanded window class the open rail floats over the page, so the page behind it is
       dimmed and a click on it closes the rail. -->
  <Transition
    enter-active-class="transition-opacity duration-300 ease-standard-decelerate"
    enter-from-class="opacity-0"
    leave-active-class="transition-opacity duration-200 ease-standard-accelerate"
    leave-to-class="opacity-0"
  >
    <div
      v-if="expanded"
      class="fixed inset-0 z-30 bg-scrim/32 expanded:hidden"
      aria-hidden="true"
      @click="collapse"
    />
  </Transition>

  <!--
    One structure for both states. Opening the rail changes its width and flips `expanded`; every
    element below moves to its open geometry by CSS transition (`.rail-item`, `.rail-fade` and
    `.rail-collapse` in main.css), so the slim and the open rail morph into each other rather than
    swap. Icons sit 36px from the left in both, which is what lets them stay put while the rest moves.
  -->
  <nav
    id="primary-rail"
    aria-label="Main"
    class="rail fixed inset-y-0 left-0 z-40 overflow-hidden bg-surface"
    :class="{ 'max-expanded:bg-surface-container max-expanded:shadow-level2': expanded }"
    :data-expanded="expanded"
    @keydown="onKeydown"
  >
    <div ref="innerEl" class="rail-inner pt-11">
      <!-- The app's mark, in either state, with its name and version beside it once the rail is
           open. It is a mark, not a control (no link, and never beside the menu button, which sits
           beneath it); Overview is the way home. -->
      <div class="flex items-center pb-3 pl-7" aria-hidden="true">
        <img class="size-10 shrink-0 rounded-full" :src="logoUrl" alt="" width="40" height="40" />
        <span
          class="rail-fade flex items-baseline gap-1.5 pr-4 pl-3 whitespace-nowrap text-on-surface"
          :data-shown="expanded"
        >
          <span class="text-title-large">Plana</span>
          <span class="text-label-small text-on-surface-variant">v{{ version }}</span>
        </span>
      </div>

      <button
        type="button"
        class="icon-btn m-1 ml-7 text-on-surface"
        :aria-label="expanded ? 'Collapse navigation' : 'Expand navigation'"
        :aria-expanded="expanded"
        aria-controls="primary-rail"
        @click="toggle"
      >
        <!-- Both glyphs are always there, stacked; the one that matches the state shows. -->
        <span
          class="rail-fade col-start-1 row-start-1 icon"
          :data-shown="!expanded"
          aria-hidden="true"
          >menu</span
        >
        <span
          class="rail-fade col-start-1 row-start-1 icon"
          :data-shown="expanded"
          aria-hidden="true"
          >menu_open</span
        >
      </button>

      <!-- M3's expanded rail keeps this gap between its header and its items. -->
      <div class="mt-10 flex min-h-0 flex-1 flex-col">
        <!-- One scrolling column: on a short window the open rail would otherwise run off the bottom. -->
        <div class="min-h-0 flex-1 [scrollbar-width:none] overflow-x-hidden overflow-y-auto">
          <RailItem
            v-for="item in destinations"
            :key="item.to"
            :to="item.to"
            :exact="item.to === '/'"
            :label="item.label"
            :icon="item.icon"
            :expanded="expanded"
            @click="afterChoice"
          />

          <!-- Only in the open rail: it grows out of nothing rather than appearing, and is inert while shut. -->
          <div class="rail-collapse" :data-open="expanded" :inert="!expanded">
            <div>
              <RailItem label="Sign out" icon="logout" expanded @click="signOut" />
            </div>
          </div>
        </div>

        <!-- The server and who is signed in, at the foot of the open rail however far the
             destinations scroll. -->
        <div
          class="rail-collapse flex-none"
          :data-open="expanded && (!!session.user || !!server)"
          :inert="!expanded"
        >
          <div>
            <div class="segmented-list mx-6 my-4 w-fit">
              <div
                v-if="server"
                class="segmented-item gap-3 bg-surface-container-highest py-3 text-on-surface-variant"
              >
                <img
                  v-if="server.iconUrl"
                  class="size-10 shrink-0 rounded-full object-cover"
                  :src="server.iconUrl"
                  alt=""
                  width="40"
                  height="40"
                />
                <span
                  v-else
                  class="grid size-10 shrink-0 place-items-center rounded-full bg-secondary-container text-title-small text-on-secondary-container"
                  aria-hidden="true"
                  >{{ server.initial }}</span
                >
                <span class="max-w-[136px] min-w-0">
                  <span class="block truncate text-title-medium text-on-surface">{{
                    server.name
                  }}</span>
                  <span class="block truncate text-body-small">{{ server.members }}</span>
                </span>
              </div>

              <div
                v-if="session.user"
                class="segmented-item gap-3 bg-surface-container-highest py-3 text-on-surface-variant"
              >
                <img
                  v-if="session.user.avatar"
                  class="size-10 shrink-0 rounded-full object-cover"
                  :src="session.user.avatar"
                  alt=""
                  width="40"
                  height="40"
                />
                <span
                  v-else
                  class="grid size-10 shrink-0 place-items-center rounded-full bg-primary-container text-title-small text-on-primary-container"
                  aria-hidden="true"
                  >{{ initial }}</span
                >
                <span class="max-w-[136px] min-w-0">
                  <span class="block truncate text-title-medium text-on-surface">{{
                    session.user.displayName
                  }}</span>
                  <span class="block truncate font-mono text-body-small">{{
                    session.user.username
                  }}</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        <div class="h-6 flex-none" />
      </div>
    </div>
  </nav>
</template>
