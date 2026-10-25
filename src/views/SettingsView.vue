<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'

import AppSelect from '@/components/AppSelect.vue'
import PlanaSays from '@/components/PlanaSays.vue'
import StateBlock from '@/components/StateBlock.vue'
import { roleColor } from '@/lib/discord'
import { groupOptions, type SelectOption } from '@/lib/select'
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
})

const saving = ref(false)
const saved = ref(false)
const saveError = ref<string | null>(null)

const ROLE_FIELDS = [
  {
    key: 'triageRoleId',
    label: 'Triage role',
    hint: 'Assigned by Discord when someone joins. Plana removes it once a role is assigned.',
  },
  {
    key: 'unitOwnerRoleId',
    label: 'Unit Owner role',
    hint: 'First button on the join announcement.',
  },
  {
    key: 'boardersRoleId',
    label: 'Boarders role',
    hint: 'Second button on the join announcement.',
  },
] as const

onMounted(() => {
  void guild.load()
  void store.load()
})

watch(
  () => store.settings,
  (next) => Object.assign(draft, next),
  { immediate: true, deep: true },
)

const dirty = computed(() =>
  (Object.keys(draft) as (keyof GuildSettings)[]).some((key) => draft[key] !== store.settings[key]),
)

/** Roles Discord will actually let the bot grant, plus whatever is already selected. */
function roleOptions(key: keyof GuildSettings): SelectOption<string | null>[] {
  return [
    { value: null, label: 'Not set' },
    ...guild.roles
      .filter((role) => role.assignable || role.id === draft[key])
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

function warningFor(key: keyof GuildSettings): string | null {
  const id = draft[key]
  if (!id || guild.roles.length === 0) return null

  const role = guild.roles.find((candidate) => candidate.id === id)
  if (!role) return 'This role no longer exists in the server.'
  if (!role.assignable) return 'The bot cannot manage this role — move its own role higher.'
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
  saved.value = false
  saveError.value = null
  try {
    await store.save({ ...draft })
    saved.value = true
  } catch (cause) {
    saveError.value = cause instanceof Error ? cause.message : 'Could not save settings.'
  } finally {
    saving.value = false
  }
}

function reset() {
  Object.assign(draft, store.settings)
  saved.value = false
  saveError.value = null
}

const version = __APP_VERSION__
</script>

<template>
  <!-- Two panes on large windows: the form flexes, About is a fixed 360dp pane. -->
  <div class="grid grid-cols-1 items-start gap-6 large:grid-cols-[minmax(0,1fr)_360px]">
    <section aria-labelledby="settings-roles">
      <div class="section-header">
        <div>
          <h2 id="settings-roles" class="text-title-medium">Roles and channels</h2>
          <p class="text-body-medium text-on-surface-variant">
            These drive the join announcement and the triage queue.
          </p>
        </div>
        <span class="chip" :class="store.configured ? 'chip-success' : 'chip-warn'">
          {{ store.configured ? 'Configured' : 'Incomplete' }}
        </span>
      </div>

      <div class="card card-body">
        <StateBlock
          :loading="store.loading && !store.loaded"
          :error="store.error"
          :retry="() => store.load(true)"
        >
          <form
            class="grid grid-cols-1 gap-x-6 gap-y-6 expanded:grid-cols-2"
            @submit.prevent="submit"
          >
            <div v-for="field in ROLE_FIELDS" :key="field.key" class="flex flex-col gap-1">
              <AppSelect
                v-model="draft[field.key]"
                :label="field.label"
                :options="roleOptions(field.key)"
                :supporting-text="field.hint"
              />
              <p v-if="warningFor(field.key)" class="supporting-text text-warning">
                {{ warningFor(field.key) }}
              </p>
            </div>

            <div class="flex flex-col gap-1">
              <AppSelect
                v-model="draft.announceChannelId"
                label="Announcement channel"
                :options="channelOptions('Not set')"
                supporting-text="Where new member cards are posted."
              />
              <p v-if="channelWarningFor('announceChannelId')" class="supporting-text text-warning">
                {{ channelWarningFor('announceChannelId') }}
              </p>
            </div>

            <div class="flex flex-col gap-1">
              <AppSelect
                v-model="draft.birthdayChannelId"
                label="Birthday channel"
                :options="channelOptions('Off')"
                supporting-text="Where Plana wishes members happy birthday. Members add theirs with /birthday set. Optional."
              />
              <p v-if="channelWarningFor('birthdayChannelId')" class="supporting-text text-warning">
                {{ channelWarningFor('birthdayChannelId') }}
              </p>
            </div>

            <p v-if="saveError" class="alert alert-error expanded:col-span-2">{{ saveError }}</p>
            <p v-else-if="saved && !dirty" class="alert alert-success expanded:col-span-2">
              Settings saved.
            </p>

            <div class="flex gap-2.5 expanded:col-span-2">
              <button class="btn btn-filled" type="submit" :disabled="!dirty || saving">
                {{ saving ? 'Saving…' : 'Save changes' }}
              </button>
              <button
                class="btn btn-text"
                type="button"
                :disabled="!dirty || saving"
                @click="reset"
              >
                Discard
              </button>
            </div>
          </form>
        </StateBlock>
      </div>
    </section>

    <!-- About: the last thing in Settings, with no card and no heading. -->
    <section
      aria-label="About"
      class="flex flex-col items-center gap-3 px-6 pt-8 pb-4 text-center large:pt-4"
    >
      <PlanaSays mood="content">Connection confirmed. I've been waiting for you, Sensei.</PlanaSays>
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
