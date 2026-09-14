<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'

import StateBlock from '@/components/StateBlock.vue'
import { useGuildStore } from '@/stores/guild'
import { useSettingsStore, type GuildSettings } from '@/stores/settings'

const guild = useGuildStore()
const store = useSettingsStore()

const draft = reactive<GuildSettings>({
  triageRoleId: null,
  unitOwnerRoleId: null,
  boardersRoleId: null,
  announceChannelId: null,
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
function optionsFor(key: keyof GuildSettings) {
  return guild.roles.filter((role) => role.assignable || role.id === draft[key])
}

function warningFor(key: keyof GuildSettings): string | null {
  const id = draft[key]
  if (!id || guild.roles.length === 0) return null

  const role = guild.roles.find((candidate) => candidate.id === id)
  if (!role) return 'This role no longer exists in the server.'
  if (!role.assignable) return 'The bot cannot manage this role — move its own role higher.'
  return null
}

const channelWarning = computed(() => {
  const id = draft.announceChannelId
  if (!id || guild.channels.length === 0) return null

  const channel = guild.channels.find((candidate) => candidate.id === id)
  if (!channel) return 'This channel no longer exists.'
  if (!channel.sendable) return 'The bot cannot post in this channel.'
  return null
})

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
</script>

<template>
  <div class="flex flex-col gap-5">
    <div class="rounded-lg border border-line bg-surface">
      <div class="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
        <div>
          <p class="text-[15px] font-semibold">Roles and channels</p>
          <p class="text-[13px] text-faint">
            These drive the join announcement and the triage queue.
          </p>
        </div>
        <span class="badge" :class="store.configured ? 'badge-success' : 'badge-warn'">
          {{ store.configured ? 'Configured' : 'Incomplete' }}
        </span>
      </div>

      <div class="p-5">
        <StateBlock :loading="store.loading && !store.loaded" :error="store.error">
          <form class="flex max-w-[520px] flex-col gap-5" @submit.prevent="submit">
            <div v-for="field in ROLE_FIELDS" :key="field.key" class="flex flex-col gap-1.5">
              <label class="text-[13px] font-semibold" :for="field.key">{{ field.label }}</label>
              <select :id="field.key" v-model="draft[field.key]" class="select">
                <option :value="null">Not set</option>
                <option v-for="role in optionsFor(field.key)" :key="role.id" :value="role.id">
                  {{ role.name }}
                </option>
              </select>
              <p class="text-[12.5px] text-muted">{{ field.hint }}</p>
              <p v-if="warningFor(field.key)" class="text-[12.5px] text-warn">
                {{ warningFor(field.key) }}
              </p>
            </div>

            <div class="flex flex-col gap-1.5">
              <label class="text-[13px] font-semibold" for="announceChannelId">
                Announcement channel
              </label>
              <select id="announceChannelId" v-model="draft.announceChannelId" class="select">
                <option :value="null">Not set</option>
                <option v-for="channel in guild.channels" :key="channel.id" :value="channel.id">
                  #{{ channel.name }}{{ channel.category ? ` — ${channel.category}` : '' }}
                </option>
              </select>
              <p class="text-[12.5px] text-muted">Where new member cards are posted.</p>
              <p v-if="channelWarning" class="text-[12.5px] text-warn">{{ channelWarning }}</p>
            </div>

            <p v-if="saveError" class="alert alert-error">{{ saveError }}</p>
            <p v-else-if="saved && !dirty" class="alert alert-success">Settings saved.</p>

            <div class="flex gap-2.5">
              <button class="btn btn-primary" type="submit" :disabled="!dirty || saving">
                {{ saving ? 'Saving…' : 'Save changes' }}
              </button>
              <button
                class="btn btn-ghost"
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
    </div>
  </div>
</template>
