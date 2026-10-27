<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AppSearchBar from '@/components/AppSearchBar.vue'
import AppSelect from '@/components/AppSelect.vue'
import FilterChip from '@/components/FilterChip.vue'
import RichTooltip from '@/components/RichTooltip.vue'
import SkeletonList from '@/components/SkeletonList.vue'
import StateBlock from '@/components/StateBlock.vue'
import type { GameNightRole } from '@/lib/activity'
import { apiFetch } from '@/lib/api'
import { roleColor } from '@/lib/discord'
import { formatDuration } from '@/lib/format'
import type { SelectOption } from '@/lib/select'
import { useSnackbar } from '@/lib/snackbar'
import { useAsync } from '@/lib/useAsync'
import { useGuildStore } from '@/stores/guild'
import { useSettingsStore } from '@/stores/settings'

/**
 * Which role each game's game nights ping. Each game has one setting, so every row carries its
 * own picker rather than opening a detail pane.
 */

/** A long history is drawn a page at a time; the search reaches every game. */
const PAGE_SIZE = 50
const DEFAULT_MIN_PLAYERS = 3

const route = useRoute()
const router = useRouter()
const guild = useGuildStore()
const settings = useSettingsStore()
const snackbar = useSnackbar()

const games = useAsync(() => apiFetch<GameNightRole[]>('/api/activity/game/roles'))
const loading = computed(() => !games.data.value && !games.error.value)

onMounted(() => {
  void games.run()
  void guild.load()
  void settings.load()
})

const search = ref(typeof route.query.q === 'string' ? route.query.q : '')
const pingingOnly = ref(route.query.pinging === '1')
const shown = ref(PAGE_SIZE)

watch([search, pingingOnly], ([text, pinging]) => {
  shown.value = PAGE_SIZE
  void router.replace({
    query: { ...route.query, q: text.trim() || undefined, pinging: pinging ? '1' : undefined },
  })
})

const matches = computed(() => {
  const needle = search.value.trim().toLowerCase()
  return (games.data.value ?? []).filter(
    (game) =>
      (!pingingOnly.value || game.roleId) && (!needle || game.name.toLowerCase().includes(needle)),
  )
})
const visible = computed(() => matches.value.slice(0, shown.value))
const pingingCount = computed(() => (games.data.value ?? []).filter((game) => game.roleId).length)

/** Any role can be pinged, whether or not the bot could grant it. */
const roleOptions = computed<SelectOption<string | null>[]>(() => [
  { value: null, label: 'Nobody' },
  ...guild.roles.map((role) => ({
    value: role.id,
    label: role.name,
    swatch: roleColor(role.color),
  })),
])

/** Games whose role is on its way to the server. */
const saving = ref(new Set<string>())

function setRole(name: string, roleId: string | null) {
  const list = games.data.value
  if (list) games.data.value = list.map((game) => (game.name === name ? { ...game, roleId } : game))
}

/** Shows the new role at once, and puts the old one back if the save fails. */
async function saveRole(game: GameNightRole, roleId: string | null) {
  const before = game.roleId
  if (roleId === before) return

  setRole(game.name, roleId)
  saving.value.add(game.name)
  try {
    await apiFetch('/api/activity/game/role', {
      method: 'PUT',
      body: { name: game.name, roleId },
    })
    snackbar.show(
      roleId
        ? `${game.name} game nights will ping @${guild.roleName(roleId) ?? 'role'}.`
        : `${game.name} game nights will no longer ping anyone.`,
    )
  } catch (cause) {
    setRole(game.name, before)
    snackbar.showError(cause, 'Could not save the ping role.')
  } finally {
    saving.value.delete(game.name)
  }
}

/** Where game nights are announced, from Settings; null while they are off. */
const channelName = computed(() => {
  const id = settings.settings.gameNightChannelId
  if (!id) return null
  return guild.channels.find((channel) => channel.id === id)?.name ?? 'unknown channel'
})

const minPlayers = computed(() => settings.settings.gameNightMinPlayers ?? DEFAULT_MIN_PLAYERS)

const plural = (count: number, one: string, many: string) =>
  `${count.toLocaleString()} ${count === 1 ? one : many}`
</script>

<template>
  <div class="flex flex-col gap-4">
    <header class="flex min-h-14 items-center gap-4">
      <RouterLink
        to="/activity"
        class="icon-btn shrink-0 text-on-surface"
        aria-label="Back to Games & music"
      >
        <span class="icon" aria-hidden="true">arrow_back</span>
      </RouterLink>
      <div class="min-w-0 flex-1">
        <h2 class="truncate text-headline-small">Game nights</h2>
        <p class="text-body-medium text-on-surface-variant">
          The role pinged when a game night of each game is announced.
        </p>
      </div>
      <RichTooltip
        title="Pings"
        text="Discord only pings a role if it allows anyone to mention it, or the bot can mention all roles."
      />
    </header>

    <!-- How game nights are set up, so a role picked here isn't a mystery when nothing happens. -->
    <div
      v-if="settings.loaded"
      class="card flex flex-wrap items-center gap-x-4 gap-y-2 py-3 pr-3 pl-6"
      :class="!channelName && 'card-warn'"
    >
      <span v-if="channelName" class="shrink-0 icon" aria-hidden="true">campaign</span>
      <p class="min-w-0 flex-1 text-body-medium">
        <template v-if="channelName">
          Announced in <span class="font-medium">#{{ channelName }}</span> once
          {{ minPlayers }} people in one voice channel play the same game.
        </template>
        <template v-else>
          Game nights are off until a channel is chosen in Settings. Roles picked here wait until
          then.
        </template>
      </p>
      <RouterLink
        to="/settings"
        class="btn btn-text"
        :class="!channelName && 'text-on-warning-container'"
        >{{ channelName ? 'Settings' : 'Choose a channel' }}</RouterLink
      >
    </div>

    <div class="flex flex-col gap-3 medium:flex-row medium:items-center">
      <AppSearchBar
        v-model="search"
        class="min-w-0 flex-1"
        placeholder="Search games"
        label="Search games"
      >
        <template v-if="search.trim() && games.data.value" #trailing>{{
          plural(matches.length, 'game', 'games')
        }}</template>
      </AppSearchBar>
      <div class="flex gap-2">
        <FilterChip
          v-model="pingingOnly"
          :label="`Configured${pingingCount ? ` (${pingingCount})` : ''}`"
        />
      </div>
    </div>

    <div :class="!loading && matches.length === 0 && 'card'">
      <StateBlock
        :loading="loading"
        :error="games.error.value"
        :retry="games.run"
        :empty="matches.length === 0"
        :empty-text="
          search.trim() || pingingOnly
            ? 'No games match.'
            : 'No games played yet. They show up here once someone plays one.'
        "
        compact
      >
        <template #skeleton><SkeletonList :rows="6" leading="art" two-line /></template>
        <ul class="segmented-list">
          <li
            v-for="game in visible"
            :key="game.name"
            class="segmented-item grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 py-3 medium:grid-cols-[auto_1fr_16rem]"
          >
            <img
              v-if="game.iconUrl"
              class="size-10 shrink-0 rounded-sm bg-surface-container-highest object-cover"
              :src="game.iconUrl"
              alt=""
              width="40"
              height="40"
            />
            <span
              v-else
              class="grid size-10 shrink-0 place-items-center rounded-sm bg-surface-container-highest text-on-surface-variant"
              aria-hidden="true"
              ><span class="icon [--icon-size:20px]">sports_esports</span></span
            >
            <div class="min-w-0">
              <p class="truncate text-body-large" :title="game.name">{{ game.name }}</p>
              <p class="truncate text-body-small text-on-surface-variant">
                <template v-if="game.players > 0"
                  >{{ formatDuration(game.ms) }} ·
                  {{ plural(game.players, 'player', 'players') }}</template
                >
                <template v-else>No play recorded</template>
              </p>
            </div>
            <AppSelect
              class="col-span-2 medium:col-span-1"
              :model-value="game.roleId"
              label="Ping"
              :options="roleOptions"
              :disabled="saving.has(game.name) || guild.roles.length === 0"
              @update:model-value="(roleId) => saveRole(game, roleId)"
            />
          </li>
        </ul>
        <div v-if="matches.length > visible.length" class="flex justify-center pt-3">
          <button class="btn btn-tonal" type="button" @click="shown += PAGE_SIZE">Show more</button>
        </div>
      </StateBlock>
    </div>
  </div>
</template>
