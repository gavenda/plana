<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'

import AppSelect from '@/components/AppSelect.vue'
import BackupSection from '@/components/BackupSection.vue'
import RichTooltip from '@/components/RichTooltip.vue'
import StateBlock from '@/components/StateBlock.vue'
import { roleColor } from '@/lib/discord'
import { groupOptions, type SelectOption } from '@/lib/select'
import { useSnackbar } from '@/lib/snackbar'
import { useGuildStore } from '@/stores/guild'
import { useSettingsStore, type GuildSettings } from '@/stores/settings'

const guild = useGuildStore()
const store = useSettingsStore()

const draft = reactive<GuildSettings>({
  triageRoleId: null,
  unitOwnerRoleId: null,
  boardersRoleId: null,
  announceChannelId: null,
  birthdayChannelId: null,
  triageReminderDays: null,
  birthdayRoleId: null,
  moderatorRoleId: null,
  trustedProxyHops: null,
})

const snackbar = useSnackbar()
const saving = ref(false)

type RoleKey =
  'triageRoleId' | 'unitOwnerRoleId' | 'boardersRoleId' | 'moderatorRoleId' | 'birthdayRoleId'
type ChannelKey = 'announceChannelId' | 'birthdayChannelId'

type Field = { label: string; hint: string } & (
  | {
      kind: 'role'
      key: RoleKey
      /** Label for leaving it unset. */
      empty: string
      /** Plana only reads who holds it, so any role will do, not just ones the bot can grant. */
      readOnly?: boolean
    }
  | { kind: 'channel'; key: ChannelKey; empty: string }
  | { kind: 'reminder'; key: 'triageReminderDays' }
  | { kind: 'proxy'; key: 'trustedProxyHops' }
)

/**
 * The form, one group per feature, its roles first. A field's label leaves out the group's name.
 */
const GROUPS: { id: string; title: string; fields: Field[] }[] = [
  {
    id: 'settings-triage',
    title: 'Triage',
    fields: [
      {
        kind: 'role',
        key: 'triageRoleId',
        label: 'Role',
        hint: 'Assigned by Discord when someone joins, and removed once they are given a role.',
        empty: 'Not set',
      },
      {
        kind: 'role',
        key: 'unitOwnerRoleId',
        label: 'Trusted',
        hint: 'First button on the join announcement.',
        empty: 'Not set',
      },
      {
        kind: 'role',
        key: 'boardersRoleId',
        label: 'Allowed',
        hint: 'Second button on the join announcement.',
        empty: 'Not set',
      },
      {
        kind: 'channel',
        key: 'announceChannelId',
        label: 'Announcement channel',
        hint: 'Where new member cards are posted.',
        empty: 'Not set',
      },
      {
        kind: 'reminder',
        key: 'triageReminderDays',
        label: 'Reminder',
        hint: 'Members still waiting this long are listed in the announcement channel, once each, without a ping.',
      },
    ],
  },
  {
    id: 'settings-birthday',
    title: 'Birthday',
    fields: [
      {
        kind: 'channel',
        key: 'birthdayChannelId',
        label: 'Channel',
        hint: 'Where birthday wishes are posted. Members add theirs with /birthday set. Optional.',
        empty: 'Off',
      },
      {
        kind: 'role',
        key: 'birthdayRoleId',
        label: 'Role',
        hint: 'Given on a member’s birthday and taken back the next day. Use a role made just for this: it is removed from everyone else.',
        empty: 'Off',
      },
    ],
  },
  {
    id: 'settings-system',
    title: 'System',
    fields: [
      {
        kind: 'role',
        key: 'moderatorRoleId',
        label: 'Moderator role',
        hint: 'Can sign in here and handle triage, but cannot change settings or broadcast. Administrators always have full access.',
        empty: 'Administrators only',
        readOnly: true,
      },
      {
        kind: 'proxy',
        key: 'trustedProxyHops',
        label: 'Reverse proxies',
        hint: 'How many proxies (nginx, Caddy) sit between visitors and the dashboard.',
      },
    ],
  },
]

/** A group's roles in one column and its other settings in the next, leaving out an empty one. */
function columnsFor(fields: Field[]): Field[][] {
  const roles = fields.filter((field) => field.kind === 'role')
  const rest = fields.filter((field) => field.kind !== 'role')
  return [roles, rest].filter((column) => column.length > 0)
}

const COLUMNS = GROUPS.map((group) => ({ ...group, columns: columnsFor(group.fields) }))

/**
 * The page's cards: each feature's roles and channels, then the system's own settings. Each saves
 * only its own fields, so changing one never saves a half-edited other.
 */
const SECTIONS = [
  {
    id: 'settings-roles',
    title: 'Roles and channels',
    first: true,
    /** Whether each group gets its own tonal heading inside the card. */
    titled: true,
    groups: COLUMNS.filter((group) => group.id !== 'settings-system'),
  },
  {
    id: 'settings-system-card',
    title: 'System',
    first: false,
    titled: false,
    groups: COLUMNS.filter((group) => group.id === 'settings-system'),
  },
]

type Section = (typeof SECTIONS)[number]

/** The settings a card holds. */
const keysOf = (section: Section) =>
  section.groups.flatMap((group) => group.fields.map((field) => field.key))

/** A failed load shows once, in the first card. */
const visibleSections = computed(() =>
  SECTIONS.filter((section) => section.first || !store.error),
)

onMounted(() => {
  void guild.load()
  void store.load()
})

/**
 * The form follows the saved settings, including another administrator's change arriving live.
 * A field this admin has already changed is kept, so their edit isn't lost; the rest take the
 * newer value, so saving never puts back something stale.
 */
watch(
  () => store.settings,
  (next, previous) => {
    let kept = false
    for (const key of Object.keys(draft) as (keyof GuildSettings)[]) {
      const edited = previous != null && draft[key] !== previous[key]
      if (!edited) Object.assign(draft, { [key]: next[key] })
      else if (draft[key] !== next[key]) kept = true
    }
    if (kept && !saving.value) {
      snackbar.show('Another administrator changed the settings. Your unsaved changes were kept.')
    }
  },
  { immediate: true, deep: true },
)

const dirtyIn = (section: Section) =>
  keysOf(section).some((key) => draft[key] !== store.settings[key])

const REMINDER_OPTIONS: SelectOption<number | null>[] = [
  { value: null, label: 'Off' },
  ...[1, 2, 3, 5, 7, 14].map((days) => ({
    value: days,
    label: days === 1 ? 'After 1 day' : `After ${days} days`,
  })),
]

const PROXY_OPTIONS: SelectOption<number | null>[] = [
  { value: null, label: 'None' },
  ...[1, 2, 3].map((count) => ({
    value: count,
    label: count === 1 ? '1 proxy' : `${count} proxies`,
  })),
]

/** Roles Discord will actually let the bot grant, plus whatever is already selected. */
function roleOptions(key: RoleKey, empty: string, readOnly = false): SelectOption<string | null>[] {
  return [
    { value: null, label: empty },
    ...guild.roles
      .filter((role) => readOnly || role.assignable || role.id === draft[key])
      .map((role) => ({ value: role.id, label: role.name, swatch: roleColor(role.color) })),
  ]
}

/** Channels grouped by category, after an option for leaving the setting empty. */
function channelOptions(empty: string): SelectOption<string | null>[] {
  return [
    { value: null, label: empty },
    ...groupOptions(
      guild.channels.map((channel) => ({
        value: channel.id,
        label: `#${channel.name}`,
        group: channel.category ?? 'No category',
      })),
    ),
  ]
}

function optionsFor(field: Field): SelectOption<string | number | null>[] {
  if (field.kind === 'role') return roleOptions(field.key, field.empty, field.readOnly)
  if (field.kind === 'channel') return channelOptions(field.empty)
  if (field.kind === 'proxy') return PROXY_OPTIONS
  return REMINDER_OPTIONS
}

function roleWarning(key: RoleKey, readOnly = false): string | null {
  const id = draft[key]
  if (!id || guild.roles.length === 0) return null

  const role = guild.roles.find((candidate) => candidate.id === id)
  if (!role) return 'This role no longer exists in the server.'
  if (!readOnly && !role.assignable)
    return 'The bot cannot manage this role — move its own role higher.'
  return null
}

function channelWarning(key: ChannelKey): string | null {
  const id = draft[key]
  if (!id || guild.channels.length === 0) return null

  const channel = guild.channels.find((candidate) => candidate.id === id)
  if (!channel) return 'This channel no longer exists.'
  if (!channel.sendable) return 'The bot cannot post in this channel.'
  return null
}

function warningFor(field: Field): string | null {
  if (field.kind === 'role') return roleWarning(field.key, field.readOnly)
  if (field.kind === 'channel') return channelWarning(field.key)
  return null
}

async function submit(section: Section) {
  saving.value = true
  try {
    await store.save(Object.fromEntries(keysOf(section).map((key) => [key, draft[key]])))
    snackbar.show('Settings saved.')
  } catch (cause) {
    snackbar.showError(cause, 'Could not save settings.')
  } finally {
    saving.value = false
  }
}

function reset(section: Section) {
  for (const key of keysOf(section)) Object.assign(draft, { [key]: store.settings[key] })
}

</script>

<template>
  <div class="flex min-w-0 flex-col gap-6">
    <section v-for="section in visibleSections" :key="section.id" :aria-labelledby="section.id">
      <div class="section-header">
        <h2 :id="section.id" class="text-title-medium">{{ section.title }}</h2>
        <template v-if="section.first">
          <span
            v-if="!store.loaded && !store.error"
            class="skeleton mr-4 h-3.5 w-24"
            aria-hidden="true"
          />
          <span
            v-else
            class="inline-flex items-center gap-1.5 pr-4 text-label-large"
            :class="store.configured ? 'text-success' : 'text-warning'"
          >
            <span class="icon [--icon-size:18px] icon-filled" aria-hidden="true">{{
              store.configured ? 'assignment_turned_in' : 'assignment_late'
            }}</span>
            {{ store.configured ? 'Configured' : 'Incomplete' }}
          </span>
        </template>
      </div>

      <!-- A segmented list: per feature, a tonal item with its name and one with its fields;
           last, the buttons that save them all. A load failure shows in a card of its own. -->
      <div :class="{ 'card card-body': store.error }">
        <StateBlock
          :loading="!store.loaded && !store.error"
          :error="store.error"
          :retry="() => store.load(true)"
        >
          <!-- The form's cards, fields and buttons, as they will stand. -->
          <template #skeleton>
            <div class="segmented-list">
              <template v-for="group in section.groups" :key="group.id">
                <div v-if="section.titled" class="segmented-item min-h-12 bg-secondary-container px-6">
                  <span class="skeleton h-3.5 w-20" />
                </div>
                <div
                  class="segmented-item grid grid-cols-1 items-start gap-6 p-6 expanded:grid-cols-2"
                >
                  <div
                    v-for="(column, index) in group.columns"
                    :key="index"
                    class="flex flex-col gap-6"
                  >
                    <span
                      v-for="field in column"
                      :key="field.key"
                      class="skeleton h-14 rounded-xs"
                    />
                  </div>
                </div>
              </template>
              <div class="segmented-item justify-end gap-2 px-6 py-4">
                <span class="skeleton h-10 w-20" />
                <span class="skeleton h-10 w-40" />
              </div>
            </div>
          </template>
          <form @submit.prevent="submit(section)">
            <div class="segmented-list">
              <!-- Each feature: its name as a tonal item, then an item with its fields. Items
                   sit directly in the list so its corners land on the outer ones. -->
              <template v-for="group in section.groups" :key="group.id">
                <h3
                  v-if="section.titled"
                  :id="group.id"
                  class="segmented-item min-h-12 bg-secondary-container px-6 text-title-small text-on-secondary-container"
                >
                  {{ group.title }}
                </h3>
                <div
                  role="group"
                  :aria-labelledby="section.titled ? group.id : section.id"
                  class="segmented-item grid min-w-0 grid-cols-1 items-start gap-6 p-6 expanded:grid-cols-2"
                >
                  <div
                    v-for="(column, index) in group.columns"
                    :key="index"
                    class="flex min-w-0 flex-col gap-6"
                  >
                    <div v-for="field in column" :key="field.key" class="flex flex-col gap-1">
                      <div class="flex items-center gap-1">
                        <AppSelect
                          v-model="draft[field.key]"
                          class="min-w-0 flex-1"
                          :label="field.label"
                          :options="optionsFor(field)"
                        />
                        <RichTooltip :title="field.label" :text="field.hint" />
                      </div>
                      <p v-if="warningFor(field)" class="supporting-text text-warning">
                        {{ warningFor(field) }}
                      </p>
                    </div>
                  </div>
                </div>
              </template>

              <div class="segmented-item justify-end gap-2 px-6 py-4">
                <button
                  class="btn btn-text"
                  type="button"
                  :disabled="!dirtyIn(section) || saving"
                  @click="reset(section)"
                >
                  Discard
                </button>
                <button
                  class="btn btn-filled btn-wide"
                  type="submit"
                  :disabled="!dirtyIn(section) || saving"
                >
                  <span class="icon [--icon-size:20px]" aria-hidden="true">save</span>
                  {{ saving ? 'Saving…' : 'Save changes' }}
                </button>
              </div>
            </div>
          </form>
        </StateBlock>
      </div>
    </section>

    <BackupSection />
  </div>
</template>
