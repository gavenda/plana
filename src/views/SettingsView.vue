<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'

import AppSelect from '@/components/AppSelect.vue'
import BackupSection from '@/components/BackupSection.vue'
import RichTooltip from '@/components/RichTooltip.vue'
import PlanaSays from '@/components/PlanaSays.vue'
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
})

const snackbar = useSnackbar()
const saving = ref(false)

type RoleKey =
  'triageRoleId' | 'unitOwnerRoleId' | 'boardersRoleId' | 'moderatorRoleId' | 'birthdayRoleId'

type RoleField = {
  key: RoleKey
  label: string
  hint: string
  /** Label for leaving it unset. */
  empty: string
  /** Plana only reads who holds it, so any role will do, not just ones the bot can grant. */
  readOnly?: boolean
}

const ROLE_FIELDS: RoleField[] = [
  {
    key: 'triageRoleId',
    label: 'Triage role',
    hint: 'Assigned by Discord when someone joins, and removed once they are given a role.',
    empty: 'Not set',
  },
  {
    key: 'unitOwnerRoleId',
    label: 'Unit Owner role',
    hint: 'First button on the join announcement.',
    empty: 'Not set',
  },
  {
    key: 'boardersRoleId',
    label: 'Boarders role',
    hint: 'Second button on the join announcement.',
    empty: 'Not set',
  },
  {
    key: 'moderatorRoleId',
    label: 'Moderator role',
    hint: 'Can sign in here and handle triage, but cannot change settings or broadcast. Administrators always have full access.',
    empty: 'Administrators only',
    readOnly: true,
  },
  {
    key: 'birthdayRoleId',
    label: 'Birthday role',
    hint: 'Given on a member’s birthday and taken back the next day. Use a role made just for this: it is removed from everyone else.',
    empty: 'Off',
  },
]

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

const dirty = computed(() =>
  (Object.keys(draft) as (keyof GuildSettings)[]).some((key) => draft[key] !== store.settings[key]),
)

const REMINDER_OPTIONS: SelectOption<number | null>[] = [
  { value: null, label: 'Off' },
  ...[1, 2, 3, 5, 7, 14].map((days) => ({
    value: days,
    label: days === 1 ? 'After 1 day' : `After ${days} days`,
  })),
]

/** Roles Discord will actually let the bot grant, plus whatever is already selected. */
function roleOptions(field: RoleField): SelectOption<string | null>[] {
  const key = field.key
  return [
    { value: null, label: field.empty },
    ...guild.roles
      .filter((role) => field.readOnly || role.assignable || role.id === draft[key])
      .map((role) => ({ value: role.id, label: role.name, swatch: roleColor(role.color) })),
  ]
}

/** Channels grouped by category, after an option for leaving the setting empty. */
function channelOptions(emptyLabel: string): SelectOption<string | null>[] {
  return [
    { value: null, label: emptyLabel },
    ...groupOptions(
      guild.channels.map((channel) => ({
        value: channel.id,
        label: `#${channel.name}`,
        group: channel.category ?? 'No category',
      })),
    ),
  ]
}

function warningFor(field: RoleField): string | null {
  const id = draft[field.key]
  if (!id || guild.roles.length === 0) return null

  const role = guild.roles.find((candidate) => candidate.id === id)
  if (!role) return 'This role no longer exists in the server.'
  if (!field.readOnly && !role.assignable)
    return 'The bot cannot manage this role — move its own role higher.'
  return null
}

function channelWarningFor(key: 'announceChannelId' | 'birthdayChannelId'): string | null {
  const id = draft[key]
  if (!id || guild.channels.length === 0) return null

  const channel = guild.channels.find((candidate) => candidate.id === id)
  if (!channel) return 'This channel no longer exists.'
  if (!channel.sendable) return 'The bot cannot post in this channel.'
  return null
}

async function submit() {
  saving.value = true
  try {
    await store.save({ ...draft })
    snackbar.show('Settings saved.')
  } catch (cause) {
    snackbar.showError(cause, 'Could not save settings.')
  } finally {
    saving.value = false
  }
}

function reset() {
  Object.assign(draft, store.settings)
}

const version = __APP_VERSION__
</script>

<template>
  <!-- Two panes on large windows: the form flexes, About is a fixed 360dp pane. -->
  <div class="grid grid-cols-1 items-start gap-6 large:grid-cols-[minmax(0,1fr)_480px]">
    <div class="flex min-w-0 flex-col gap-6">
      <section aria-labelledby="settings-roles">
        <div class="section-header">
          <h2 id="settings-roles" class="text-title-medium">Roles and channels</h2>
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
        </div>

        <div class="card card-body">
          <StateBlock
            :loading="!store.loaded && !store.error"
            :error="store.error"
            :retry="() => store.load(true)"
          >
            <!-- The form's fields and buttons, as they will stand. -->
            <template #skeleton>
              <div class="grid grid-cols-1 gap-6 expanded:grid-cols-2">
                <span
                  v-for="field in ROLE_FIELDS.length + 3"
                  :key="field"
                  class="skeleton h-14 rounded-xs"
                />
                <div class="flex justify-end gap-2 expanded:col-span-2">
                  <span class="skeleton h-10 w-20" />
                  <span class="skeleton h-10 w-40" />
                </div>
              </div>
            </template>
            <form
              class="grid grid-cols-1 gap-x-6 gap-y-6 expanded:grid-cols-2"
              @submit.prevent="submit"
            >
              <div v-for="field in ROLE_FIELDS" :key="field.key" class="flex flex-col gap-1">
                <div class="flex items-center gap-1">
                  <AppSelect
                    v-model="draft[field.key]"
                    class="min-w-0 flex-1"
                    :label="field.label"
                    :options="roleOptions(field)"
                  />
                  <RichTooltip :title="field.label" :text="field.hint" />
                </div>
                <p v-if="warningFor(field)" class="supporting-text text-warning">
                  {{ warningFor(field) }}
                </p>
              </div>

              <div class="flex flex-col gap-1">
                <div class="flex items-center gap-1">
                  <AppSelect
                    v-model="draft.announceChannelId"
                    class="min-w-0 flex-1"
                    label="Announcement channel"
                    :options="channelOptions('Not set')"
                  />
                  <RichTooltip
                    title="Announcement channel"
                    text="Where new member cards are posted."
                  />
                </div>
                <p
                  v-if="channelWarningFor('announceChannelId')"
                  class="supporting-text text-warning"
                >
                  {{ channelWarningFor('announceChannelId') }}
                </p>
              </div>

              <div class="flex flex-col gap-1">
                <div class="flex items-center gap-1">
                  <AppSelect
                    v-model="draft.birthdayChannelId"
                    class="min-w-0 flex-1"
                    label="Birthday channel"
                    :options="channelOptions('Off')"
                  />
                  <RichTooltip
                    title="Birthday channel"
                    text="Where birthday wishes are posted. Members add theirs with /birthday set. Optional."
                  />
                </div>
                <p
                  v-if="channelWarningFor('birthdayChannelId')"
                  class="supporting-text text-warning"
                >
                  {{ channelWarningFor('birthdayChannelId') }}
                </p>
              </div>

              <div class="flex flex-col gap-1">
                <div class="flex items-center gap-1">
                  <AppSelect
                    v-model="draft.triageReminderDays"
                    class="min-w-0 flex-1"
                    label="Triage reminder"
                    :options="REMINDER_OPTIONS"
                  />
                  <RichTooltip
                    title="Triage reminder"
                    text="Members still waiting this long are listed in the announcement channel, once each, without a ping."
                  />
                </div>
              </div>

              <div class="flex justify-end gap-2 expanded:col-span-2">
                <button
                  class="btn btn-text"
                  type="button"
                  :disabled="!dirty || saving"
                  @click="reset"
                >
                  Discard
                </button>
                <button class="btn btn-filled btn-wide" type="submit" :disabled="!dirty || saving">
                  <span class="icon [--icon-size:20px]" aria-hidden="true">save</span>
                  {{ saving ? 'Saving…' : 'Save changes' }}
                </button>
              </div>
            </form>
          </StateBlock>
        </div>
      </section>

      <BackupSection />
    </div>

    <!-- About: the last thing in Settings, with no card and no heading. -->
    <section
      aria-label="About"
      class="flex flex-col items-center gap-3 px-6 pt-8 pb-4 text-center large:pt-4"
    >
      <PlanaSays mood="content" layout="column"
        >Connection confirmed. I've been waiting for you, Sensei.</PlanaSays
      >
      <p class="mt-2 text-title-medium">Plana {{ version }}</p>
      <p class="text-body-medium text-on-surface-variant">
        Kept by <span class="text-tertiary">Plana</span>, system administrator of the Shittim Chest
      </p>
      <p class="text-body-small text-on-surface-variant">
        Character design by DoReMi, from Blue Archive.
      </p>
    </section>
  </div>
</template>
