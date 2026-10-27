<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

import AppSelect from '@/components/AppSelect.vue'
import AppTextArea from '@/components/AppTextArea.vue'
import ComponentList from '@/components/ComponentList.vue'
import ComponentsPreview from '@/components/ComponentsPreview.vue'
import DiscordMention from '@/components/DiscordMention.vue'
import DiscordMessage from '@/components/DiscordMessage.vue'
import SegmentedButtons from '@/components/SegmentedButtons.vue'
import StateBlock from '@/components/StateBlock.vue'
import { apiFetch } from '@/lib/api'
import { BLOCK_KINDS } from '@/lib/components-builder'
import {
  MAX_COMPONENTS,
  countComponents,
  readComponentsJson,
  validateComponents,
  type TopLevelComponent,
} from '@/lib/components-v2'
import { groupOptions, type SelectOption } from '@/lib/select'
import { useSnackbar } from '@/lib/snackbar'
import { useGuildStore } from '@/stores/guild'
import { useSessionStore } from '@/stores/session'

const MAX_LENGTH = 2000

type BroadcastResult = { channelName: string; url: string }

const guild = useGuildStore()
const session = useSessionStore()
const snackbar = useSnackbar()

const channelId = ref<string | null>(null)
const sending = ref(false)

/** Plain text, or a Components V2 layout. */
const mode = ref<'text' | 'components'>('text')
const content = ref('')

const newLayout = (): TopLevelComponent[] => [BLOCK_KINDS[0]!.create()]

/**
 * The layout, in Discord's JSON shape. The builder edits it in place; the JSON tab replaces it
 * whenever what is typed there reads as a component array.
 */
const components = ref<TopLevelComponent[]>(newLayout())
const editor = ref<'builder' | 'json'>('builder')
const json = ref('')
const jsonError = ref<string | null>(null)

const layout = computed(() => validateComponents(components.value))
const componentCount = computed(() => countComponents(components.value))

// Opening the JSON tab writes out the layout as it stands, tidied if it is ready to send.
watch(editor, (value) => {
  if (value !== 'json') return
  json.value = JSON.stringify(layout.value.ok ? layout.value.components : components.value, null, 2)
  jsonError.value = null
})

function onJsonInput(text: string) {
  json.value = text
  const read = readComponentsJson(text)
  if (read.ok) {
    components.value = read.components
    jsonError.value = null
  } else {
    jsonError.value = read.error
  }
}

async function copyJson() {
  try {
    await navigator.clipboard.writeText(json.value)
    snackbar.show('JSON copied.')
  } catch {
    snackbar.show('Could not copy the JSON.')
  }
}

onMounted(() => {
  void guild.load()
})

/** Grouped by category so a long channel list stays navigable. */
const channelOptions = computed<SelectOption<string | null>[]>(() =>
  groupOptions(
    guild.channels.map((channel) => ({
      value: channel.id,
      label: `#${channel.name}`,
      trailing: channel.sendable ? undefined : 'No access',
      disabled: !channel.sendable,
      group: channel.category ?? 'No category',
    })),
  ),
)

const selected = computed(
  () => guild.channels.find((channel) => channel.id === channelId.value) ?? null,
)

const remaining = computed(() => MAX_LENGTH - content.value.length)
const canSend = computed(() => {
  if (channelId.value == null) return false
  if (mode.value === 'components') return layout.value.ok && !jsonError.value
  return content.value.trim().length > 0 && remaining.value >= 0
})

async function send() {
  if (!canSend.value || !channelId.value) return

  const body =
    mode.value === 'components' && layout.value.ok
      ? { channelId: channelId.value, components: layout.value.components }
      : { channelId: channelId.value, content: content.value }

  sending.value = true
  try {
    const result = await apiFetch<BroadcastResult>('/api/broadcast', { method: 'POST', body })
    if (mode.value === 'components') {
      components.value = newLayout()
      if (editor.value === 'json') json.value = JSON.stringify(components.value, null, 2)
    } else {
      content.value = ''
    }
    snackbar.show(`Posted to #${result.channelName}.`, {
      action: { label: 'Open in Discord', href: result.url },
    })
  } catch (cause) {
    snackbar.showError(cause, 'Could not send the message.')
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <section aria-labelledby="broadcast-compose">
      <div class="section-header">
        <h2 id="broadcast-compose" class="text-title-medium">Send a message as the bot</h2>
      </div>

      <!-- The form in its card; the preview beside it on the page, so it isn't a card in a card. -->
      <div class="grid grid-cols-1 items-start gap-6 large:grid-cols-[minmax(0,1fr)_360px]">
        <div class="card card-body">
          <StateBlock
            :loading="!guild.directory && !guild.error"
            :error="guild.error"
            :retry="() => guild.load(true)"
          >
            <!-- The channel, the message and Send, as they will stand. -->
            <template #skeleton>
              <div class="flex flex-col gap-6">
                <span class="skeleton h-14 rounded-xs" />
                <span class="skeleton mb-5 h-40 rounded-xs" />
                <span class="skeleton h-10 w-44 self-end" />
              </div>
            </template>
            <form class="flex flex-col gap-6" @submit.prevent="send">
              <AppSelect v-model="channelId" label="Channel" :options="channelOptions" />

              <SegmentedButtons
                v-model="mode"
                label="Message type"
                :options="[
                  { value: 'text', label: 'Text', icon: 'notes' },
                  { value: 'components', label: 'Components', icon: 'widgets' },
                ]"
              />

              <AppTextArea
                v-if="mode === 'text'"
                v-model="content"
                label="Message"
                :maxlength="MAX_LENGTH"
                supporting-text="Discord markdown is supported."
              />

              <template v-else>
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <SegmentedButtons
                    v-model="editor"
                    label="Edit with"
                    :options="[
                      {
                        value: 'builder',
                        label: 'Builder',
                        icon: 'widgets',
                        disabled: jsonError != null,
                      },
                      { value: 'json', label: 'JSON', icon: 'data_object' },
                    ]"
                  />
                  <span
                    class="text-body-small tabular-nums"
                    :class="
                      componentCount > MAX_COMPONENTS ? 'text-error' : 'text-on-surface-variant'
                    "
                  >
                    {{ componentCount }} / {{ MAX_COMPONENTS }} components
                  </span>
                </div>

                <ComponentList v-if="editor === 'builder'" v-model="components" />

                <div v-else class="flex flex-col gap-2">
                  <AppTextArea
                    :model-value="json"
                    label="Components JSON"
                    mono
                    :error="jsonError != null"
                    :supporting-text="
                      jsonError ??
                      'A component array, or a message payload with `components`. Fix any errors here to go back to the builder.'
                    "
                    @update:model-value="onJsonInput"
                  />
                  <button type="button" class="btn btn-text btn-sm self-end" @click="copyJson">
                    <span class="icon [--icon-size:18px]" aria-hidden="true">content_copy</span>
                    Copy JSON
                  </button>
                </div>

                <p
                  v-if="!layout.ok && !jsonError"
                  class="supporting-text flex items-start gap-2"
                  role="status"
                >
                  <span class="icon [--icon-size:16px]" aria-hidden="true">info</span>
                  Not ready to send — {{ layout.error }}
                </p>
              </template>

              <div class="flex justify-end">
                <button
                  class="btn btn-filled btn-wide"
                  type="submit"
                  :disabled="!canSend || sending"
                >
                  <span class="icon [--icon-size:20px]" aria-hidden="true">send</span>
                  {{ sending ? 'Sending…' : 'Send message' }}
                </button>
              </div>
            </form>
          </StateBlock>
        </div>

        <aside class="flex flex-col gap-2.5">
          <p class="px-4 text-title-small">Preview</p>

          <div class="flex gap-3 rounded-lg bg-surface-container-lowest p-4">
            <div
              class="grid size-10 shrink-0 place-items-center rounded-full bg-primary font-bold text-on-primary"
              aria-hidden="true"
            >
              P
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-title-small">Plana</span>
                <span
                  class="rounded-xs bg-primary-container px-1 text-label-small text-on-primary-container"
                  >BOT</span
                >
                <span class="text-body-medium text-on-surface-variant">
                  in
                  <DiscordMention v-if="selected" kind="channel" :name="selected.name" />
                  <template v-else>no channel selected</template>
                </span>
              </div>
              <ComponentsPreview
                v-if="mode === 'components'"
                class="mt-1"
                :components="components"
              />
              <div v-else class="mt-1 text-on-surface">
                <DiscordMessage v-if="content" :content="content" />
                <template v-else>Your message will appear here.</template>
              </div>
            </div>
          </div>

          <p class="px-4 text-body-medium text-on-surface-variant">
            Sent by {{ session.user?.displayName }} and recorded in the audit log.
          </p>
        </aside>
      </div>
    </section>
  </div>
</template>
