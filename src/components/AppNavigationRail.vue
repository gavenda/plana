<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import {
  Card,
  Fab,
  ListItem,
  NavigationItem,
  NavigationRail,
  NavigationRailMenuButton,
} from 'tailwind-material3'

import { useLive } from '@/lib/live'
import { logoUrl } from '@/lib/plana'
import { runRailFab, useRail, useRailDocks } from '@/lib/rail'
import { useBotStore } from '@/stores/bot'
import { useGuildStore } from '@/stores/guild'
import { useSessionStore } from '@/stores/session'
import { useSettingsStore } from '@/stores/settings'

type Destination = {
  to: string
  label: string
  icon: string
  adminOnly?: boolean
  /** Open to viewers (the stats role); match the route's `stats`. */
  stats?: boolean
  /** Shown in the slim rail too. The rest appear only once it opens, as in Yuuka's. */
  slim?: boolean
}

/** Icon names are Material Symbols; add new ones to the icon_names list in index.html. */
const allDestinations: Destination[] = [
  { to: '/', label: 'Overview', icon: 'dashboard', slim: true, stats: true },
  { to: '/queue', label: 'Triage', icon: 'how_to_reg', slim: true },
  { to: '/broadcast', label: 'Broadcast', icon: 'campaign', adminOnly: true },
  { to: '/members', label: 'Members', icon: 'group' },
  { to: '/birthdays', label: 'Birthdays', icon: 'cake' },
  { to: '/activity', label: 'Games & music', icon: 'sports_esports', stats: true },
  { to: '/voice', label: 'Voice', icon: 'headset_mic', stats: true },
  { to: '/audit', label: 'Audit log', icon: 'history', slim: true },
  { to: '/settings', label: 'Settings', icon: 'settings', adminOnly: true },
]

const emit = defineEmits<{ signOut: []; about: [] }>()

const version = __APP_VERSION__
const session = useSessionStore()

/**
 * Everyone sees only the pages they can use. Viewers have just the stats pages, so all of
 * them fit the slim rail.
 */
const destinations = computed(() => {
  if (session.isViewer) {
    return allDestinations
      .filter((destination) => destination.stats)
      .map((destination) => ({ ...destination, slim: true }))
  }
  return allDestinations.filter((destination) => !destination.adminOnly || session.isAdmin)
})

/**
 * tailwind-material3's NavigationRail. Open, it docks beside the page where the window has room
 * (the expanded class) and floats over it, with a scrim, below that.
 */
const { expanded, set, collapse } = useRail()
const docks = useRailDocks()

const guild = useGuildStore()
const settings = useSettingsStore()

// The rail is on every signed-in page, so it keeps the shared stores current: roles and
// channels (Settings, Broadcast, role colours) and, for administrators, the settings.
useLive('guild', () => {
  if (guild.directory) void guild.load(true)
})
useLive('settings', () => {
  if (settings.loaded) void settings.load(true)
})

/** The bot's own avatar, as members see it in Discord; the logo when it has none. */
const bot = useBotStore()
const markUrl = computed(() => bot.avatarUrl ?? logoUrl)

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

/** Overview is only current at `/` itself; the rest are also current on pages beneath them. */
const route = useRoute()
function isActive(to: string) {
  return to === '/' ? route.path === '/' : route.path === to || route.path.startsWith(`${to}/`)
}

/** A floating rail is in the way once it has done its job; a docked one stays put. */
function afterChoice() {
  if (!docks.value) collapse()
}

/** The page's main action, from the route. */
const fab = computed(() => route.meta.fab ?? null)

function onFab() {
  afterChoice()
  runRailFab()
}

function openAbout() {
  afterChoice()
  emit('about')
}

function signOut() {
  afterChoice()
  emit('signOut')
}

// A rail left open in a window that shrinks below the dock width would float over the page.
watch(docks, (value) => {
  if (!value) collapse()
})

onMounted(() => {
  // The rail shows without the server if this fails.
  void guild.load()
})
</script>

<template>
  <NavigationRail
    id="primary-rail"
    :expanded="expanded"
    :modal="!docks"
    label="Main"
    @update:expanded="set"
  >
    <template #header="{ expanded: open }">
      <!-- The app's mark, with its name and version beside it once the rail is open. It opens the
           About pane, not Overview, which has its own destination below. -->
      <button
        type="button"
        class="relative ms-2 mb-2 flex cursor-pointer items-center rounded-full text-left before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-current before:opacity-0 before:transition-opacity hover:before:opacity-8 focus:outline-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-secondary focus-visible:outline-solid"
        aria-label="About Plana"
        @click="openAbout"
      >
        <img
          class="size-10 shrink-0 rounded-full bg-primary-container object-cover"
          :src="markUrl"
          alt=""
          width="40"
          height="40"
        />
        <span
          v-if="open"
          class="flex items-baseline gap-1.5 pr-4 pl-3 whitespace-nowrap text-on-surface"
          aria-hidden="true"
        >
          <span class="text-title-large">Plana</span>
          <span class="text-label-small text-on-surface-variant">v{{ version }}</span>
        </span>
      </button>

      <NavigationRailMenuButton
        expand-label="Expand navigation"
        collapse-label="Collapse navigation"
      >
        <template #menu-icon><span class="icon" aria-hidden="true">menu</span></template>
        <template #menu-open-icon><span class="icon" aria-hidden="true">menu_open</span></template>
      </NavigationRailMenuButton>

      <!-- The page's main action, under the menu button as in M3's rail: a FAB in the slim rail,
           an extended FAB in the open one. -->
      <Fab v-if="fab" :expanded="open" :label="fab.label" class="mt-2" @click="onFab">
        <template #icon>
          <span class="icon" aria-hidden="true">{{ fab.icon }}</span>
        </template>
        {{ fab.label }}
      </Fab>
    </template>

    <template #default="{ expanded: open }">
      <!-- The slim rail keeps only the everyday destinations; the rest join it once it opens. -->
      <template v-for="item in destinations" :key="item.to">
        <NavigationItem
          v-if="item.slim || open"
          :as="RouterLink"
          :to="item.to"
          :label="item.label"
          :active="isActive(item.to)"
          @click="afterChoice"
        >
          <template #icon>
            <span class="icon" aria-hidden="true">{{ item.icon }}</span>
          </template>
          <template #active-icon>
            <span class="icon icon-filled" aria-hidden="true">{{ item.icon }}</span>
          </template>
        </NavigationItem>
      </template>

      <template v-if="open">
        <NavigationItem label="Sign out" @click="signOut">
          <template #icon><span class="icon" aria-hidden="true">logout</span></template>
        </NavigationItem>

        <!-- The server and who is signed in, at the foot of the open rail. -->
        <Card
          v-if="session.user || server"
          :padded="false"
          class="ms-3 mt-6 mb-6 w-fit max-w-[260px]"
        >
          <ListItem v-if="server" :supporting-text="server.members">
            <template #leading>
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
            </template>
            <span class="block truncate">{{ server.name }}</span>
          </ListItem>
          <ListItem v-if="session.user">
            <template #leading>
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
            </template>
            <span class="block truncate">{{ session.user.displayName }}</span>
            <template #supporting-text>
              <span class="font-mono">{{ session.user.username }}</span>
            </template>
          </ListItem>
        </Card>
      </template>
    </template>
  </NavigationRail>
</template>
