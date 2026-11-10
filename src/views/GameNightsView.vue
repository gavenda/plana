<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, Card, Chip, List, ListItem } from 'tailwind-material3'

import AppSearchBar from '@/components/AppSearchBar.vue'
import AppSelect from '@/components/AppSelect.vue'
import ChoiceGroup from '@/components/ChoiceGroup.vue'
import LinkButton from '@/components/LinkButton.vue'
import LinkIconButton from '@/components/LinkIconButton.vue'
import RichTooltip from '@/components/RichTooltip.vue'
import SkeletonList from '@/components/SkeletonList.vue'
import StateBlock from '@/components/StateBlock.vue'
import type { GameNightRole } from '@/lib/activity'
import { apiFetch } from '@/lib/api'
import { roleColor } from '@/lib/discord'
import { absoluteTime, clockTime, dayLabel, formatDuration } from '@/lib/format'
import type { GameNightEntry, GameNightHistory } from '@/lib/game-nights'
import { useLive } from '@/lib/live'
import type { SelectOption } from '@/lib/select'
import { useSnackbar } from '@/lib/snackbar'
import { useAsync } from '@/lib/useAsync'
import { useGuildStore } from '@/stores/guild'
import { useSessionStore } from '@/stores/session'
import { useSettingsStore } from '@/stores/settings'

/**
 * Game nights: every one so far, newest first, and (for administrators) which role each game's
 * nights ping. Each game has one setting, so every row carries its own picker rather than
 * opening a detail pane.
 */

/** A long history is drawn a page at a time; the search reaches every game. */
const PAGE_SIZE = 50
const DEFAULT_MIN_PLAYERS = 3

const route = useRoute()
const router = useRouter()
const guild = useGuildStore()
const settings = useSettingsStore()
const session = useSessionStore()
const snackbar = useSnackbar()

type Tab = 'history' | 'roles'
const TABS: { value: Tab; label: string; icon: string }[] = [
  { value: 'history', label: 'History', icon: 'history' },
  { value: 'roles', label: 'Ping roles', icon: 'notifications' },
]
/** Ping roles are for administrators; everyone else sees the history alone. */
const tab = ref<Tab>(session.isAdmin && route.query.tab === 'roles' ? 'roles' : 'history')
watch(tab, (value) => {
  void router.replace({ query: { ...route.query, tab: value === 'roles' ? 'roles' : undefined } })
  if (value === 'roles' && !games.data.value) void games.run()
})

const games = useAsync(() => apiFetch<GameNightRole[]>('/api/activity/game/roles'))
const loading = computed(() => !games.data.value && !games.error.value)

onMounted(() => {
  void history.run()
  if (tab.value === 'roles') void games.run()
  void guild.load()
  void settings.load()
})

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

const HISTORY_PAGE = 20
/** The most the server sends at once, so a reload keeps at most this many rows. */
const HISTORY_MAX = 50

/** How many of the newest a reload fetches, replacing what's shown; "Show more" appends. */
const historyLimit = ref(HISTORY_PAGE)
const history = useAsync(() =>
  apiFetch<GameNightHistory>(`/api/game-nights?limit=${historyLimit.value}`),
)
const loadingMore = ref(false)

async function showMoreNights() {
  const list = history.data.value
  const last = list?.entries.at(-1)
  if (!list || !last) return
  loadingMore.value = true
  try {
    const next = await apiFetch<GameNightHistory>(
      `/api/game-nights?limit=${HISTORY_PAGE}&before=${last.postedAt}`,
    )
    history.data.value = { entries: [...list.entries, ...next.entries], hasMore: next.hasMore }
  } catch (cause) {
    snackbar.showError(cause, 'Could not load more game nights.')
  } finally {
    loadingMore.value = false
  }
}

// An answer, a new post or one ending anywhere reloads what's shown.
useLive('gamenights', () => {
  const shownCount = history.data.value?.entries.length ?? HISTORY_PAGE
  historyLimit.value = Math.min(Math.max(shownCount, HISTORY_PAGE), HISTORY_MAX)
  void history.run()
})

const STATUS: Record<GameNightEntry['status'], { label: string; tone: string }> = {
  planned: { label: 'Planned', tone: 'bg-secondary-container text-on-secondary-container' },
  live: { label: 'Going on', tone: 'bg-tertiary-container text-on-tertiary-container' },
  ended: { label: 'Ended', tone: 'bg-surface-container-highest text-on-surface-variant' },
  cancelled: { label: 'Cancelled', tone: 'bg-error-container text-on-error-container' },
}

/** "Today, 21:00 · 2.5 h · #Lounge" */
function nightWhen(night: GameNightEntry): string {
  const parts = [`${dayLabel(night.startsAt)}, ${clockTime(night.startsAt)}`]
  if (night.status === 'ended' && night.came.length > 0 && night.endedAt != null) {
    parts.push(formatDuration(Math.max(0, night.endedAt - night.startsAt)))
  }
  if (night.voiceChannel) parts.push(`#${night.voiceChannel.name}`)
  return parts.join(' · ')
}

const names = (members: { displayName: string }[]) =>
  new Intl.ListFormat('en', { type: 'conjunction' }).format(
    members.map((member) => member.displayName),
  )

/** Who answered, and once it's over how many of those who said yes came. */
function nightAnswers(night: GameNightEntry): string | null {
  const said = night.joining.length
  if (said === 0) return night.declined.length > 0 ? `${night.declined.length} can't make it` : null
  if (night.showedUp != null) return `${night.showedUp} of ${said} who said they were in came`
  const declined = night.declined.length > 0 ? ` · ${night.declined.length} can't make it` : ''
  return `${said} ${said === 1 ? 'is' : 'are'} in${declined}`
}

// ---------------------------------------------------------------------------
// Ping roles
// ---------------------------------------------------------------------------

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

/** The game whose picker is showing in place of its button; one at a time. */
const picking = ref<string | null>(null)

/** Swaps the button for the picker and opens its menu, so it takes one press, not two. */
async function openPicker(name: string, event: MouseEvent) {
  const row = (event.currentTarget as HTMLElement).parentElement
  picking.value = name
  await nextTick()
  const input = row?.querySelector('input')
  input?.focus()
  input?.click()
}

/** Back to the button once focus leaves the picker without a choice. */
function closePicker(event: FocusEvent, name: string) {
  // Only the picker's field leaving counts, not the button as it's swapped out.
  if (!(event.target instanceof HTMLInputElement)) return
  const row = event.currentTarget as HTMLElement
  if (row.contains(event.relatedTarget as Node | null)) return
  if (picking.value === name) picking.value = null
}

function pickRole(game: GameNightRole, roleId: string | null) {
  picking.value = null
  void saveRole(game, roleId)
}

/** The role's colour for the dot on its button; null for a role without one. */
function roleSwatch(roleId: string): string | null {
  return roleColor(guild.roles.find((role) => role.id === roleId)?.color)
}

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
    <header class="flex min-h-14 flex-wrap items-center gap-4">
      <LinkIconButton to="/activity" label="Back to Games & music" class="text-on-surface">
        <span class="icon" aria-hidden="true">arrow_back</span>
      </LinkIconButton>
      <div class="min-w-0 flex-1">
        <h2 class="truncate text-headline-small">Game nights</h2>
        <p class="text-body-medium text-on-surface-variant">
          {{
            tab === 'roles'
              ? 'The role pinged when a game night of each game is announced.'
              : 'Every game night so far, and who came.'
          }}
        </p>
      </div>
      <!-- Left of the info button; on narrow windows, a line of its own under the title. -->
      <div v-if="session.isAdmin" class="shrink-0 max-medium:order-last max-medium:basis-full">
        <ChoiceGroup v-model="tab" label="View" :options="TABS" />
      </div>
      <RichTooltip
        v-if="tab === 'roles'"
        title="Pings"
        text="Discord only pings a role if it allows anyone to mention it, or the bot can mention all roles."
      />
      <RichTooltip
        v-else
        title="Who came"
        text="Everyone who spent a minute or more in the game night's voice channel while it ran. Members plan their own with /gamenight plan."
      />
    </header>

    <template v-if="tab === 'history'">
      <div
        :class="
          history.data.value?.entries.length === 0 &&
          'overflow-hidden rounded-medium bg-surface-container'
        "
      >
        <StateBlock
          :loading="!history.data.value && !history.error.value"
          :error="history.data.value ? null : history.error.value"
          :retry="history.run"
          :empty="history.data.value?.entries.length === 0"
          empty-text="No game nights yet. They show up here once Plana announces one, or someone plans one with /gamenight plan."
          compact
        >
          <template #skeleton><SkeletonList :rows="5" leading="art" two-line /></template>
          <List segmented v-if="history.data.value">
            <ListItem
              v-for="night in history.data.value.entries"
              :key="night.messageId"
              class="items-start bg-surface-container!"
            >
              <template #leading>
                <span class="flex items-center gap-4">
                  <img
                    v-if="night.iconUrl"
                    class="size-10 shrink-0 rounded-small bg-surface-container-highest object-cover"
                    :src="night.iconUrl"
                    alt=""
                    width="40"
                    height="40"
                  />
                  <span
                    v-else
                    class="grid size-10 shrink-0 place-items-center rounded-small bg-surface-container-highest text-on-surface-variant"
                    aria-hidden="true"
                    ><span class="icon [--icon-size:20px]">sports_esports</span></span
                  >
                </span>
              </template>
              <span class="flex flex-col gap-0.5">
                <span class="flex min-w-0 items-center gap-2">
                  <span class="truncate text-body-large" :title="night.game">{{ night.game }}</span>
                  <span
                    class="shrink-0 rounded-small px-2 py-0.5 text-label-medium"
                    :class="STATUS[night.status].tone"
                    >{{ STATUS[night.status].label }}</span
                  >
                </span>
                <span
                  :title="absoluteTime(night.startsAt)"
                  class="block truncate text-body-small text-on-surface-variant"
                >
                  {{ nightWhen(night) }}
                </span>
                <span v-if="night.host" class="block truncate text-body-medium">
                  Planned by {{ night.host.displayName }}
                </span>
                <span v-if="night.came.length > 0" class="block text-body-medium">
                  <span class="text-on-surface-variant">Came:</span> {{ names(night.came) }}
                </span>
                <span
                  v-else-if="night.status === 'ended' && night.planned"
                  class="block text-body-medium text-on-surface-variant"
                >
                  Nobody gathered for it.
                </span>
                <span
                  v-if="nightAnswers(night)"
                  :title="night.joining.length ? `In: ${names(night.joining)}` : undefined"
                  class="block text-body-small text-on-surface-variant"
                >
                  {{ nightAnswers(night) }}
                </span>
              </span>
              <template #trailing>
                <RichTooltip
                  title="Open in Discord"
                  label="Open the post in Discord"
                  :href="night.url"
                  icon="open_in_new"
                />
              </template>
            </ListItem>
          </List>
          <div v-if="history.data.value?.hasMore" class="flex justify-center pt-3">
            <Button variant="tonal" :disabled="loadingMore" @click="showMoreNights">{{
              loadingMore ? 'Loading…' : 'Show more'
            }}</Button>
          </div>
        </StateBlock>
      </div>
    </template>

    <template v-else>
      <!-- How game nights are set up, so a role picked here isn't a mystery when nothing happens. -->
      <div
        v-if="settings.loaded"
        class="flex flex-wrap items-center gap-x-4 gap-y-2 overflow-hidden rounded-medium py-3 pr-3 pl-6"
        :class="
          channelName ? 'bg-surface-container' : 'bg-warning-container text-on-warning-container'
        "
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
        <LinkButton to="/settings" :variant="channelName ? 'text' : 'inherit'">{{
          channelName ? 'Settings' : 'Choose a channel'
        }}</LinkButton>
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
          <Chip type="filter" v-model:selected="pingingOnly">{{
            `Configured${pingingCount ? ` (${pingingCount})` : ''}`
          }}</Chip>
        </div>
      </div>

      <div
        :class="
          !loading && matches.length === 0 && 'overflow-hidden rounded-medium bg-surface-container'
        "
      >
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
          <List segmented>
            <ListItem v-for="game in visible" :key="game.name" class="bg-surface-container!">
              <template #leading>
                <img
                  v-if="game.iconUrl"
                  class="size-10 shrink-0 rounded-small bg-surface-container-highest object-cover"
                  :src="game.iconUrl"
                  alt=""
                  width="40"
                  height="40"
                />
                <span
                  v-else
                  class="grid size-10 shrink-0 place-items-center rounded-small bg-surface-container-highest text-on-surface-variant"
                  aria-hidden="true"
                  ><span class="icon [--icon-size:20px]">sports_esports</span></span
                >
              </template>
              <span class="block py-1">
                <span class="block truncate text-body-large" :title="game.name">{{
                  game.name
                }}</span>
                <span class="block truncate text-body-small text-on-surface-variant">
                  <template v-if="game.players > 0"
                    >{{ formatDuration(game.ms) }} ·
                    {{ plural(game.players, 'player', 'players') }}</template
                  >
                  <template v-else>No play recorded</template>
                </span>
              </span>
              <template #trailing>
                <div
                  class="flex w-44 items-center justify-end medium:w-64"
                  @focusout="closePicker($event, game.name)"
                >
                  <AppSelect
                    v-if="picking === game.name"
                    class="w-full"
                    :model-value="game.roleId"
                    label="Ping"
                    :options="roleOptions"
                    :disabled="saving.has(game.name)"
                    @update:model-value="(roleId) => pickRole(game, roleId)"
                  />
                  <Button
                    variant="tonal"
                    size="xs"
                    v-else
                    :disabled="saving.has(game.name) || guild.roles.length === 0"
                    :aria-label="`Ping role for ${game.name}: ${game.roleId ? `@${guild.roleName(game.roleId) ?? 'role'}` : 'nobody'}. Change`"
                    @click="openPicker(game.name, $event)"
                    class="max-w-full"
                    ><template #icon
                      ><span class="icon [--icon-size:20px]" aria-hidden="true">{{
                        game.roleId ? 'edit' : 'add'
                      }}</span></template
                    ><span
                      v-if="game.roleId && roleSwatch(game.roleId)"
                      class="size-2.5 shrink-0 rounded-full"
                      :style="{ background: roleSwatch(game.roleId) ?? undefined }"
                      aria-hidden="true"
                    />
                    <span class="truncate">{{
                      game.roleId ? (guild.roleName(game.roleId) ?? 'Unknown role') : 'Add ping'
                    }}</span></Button
                  >
                </div>
              </template>
            </ListItem>
          </List>
          <div v-if="matches.length > visible.length" class="flex justify-center pt-3">
            <Button variant="tonal" @click="shown += PAGE_SIZE">Show more</Button>
          </div>
        </StateBlock>
      </div>
    </template>
  </div>
</template>
