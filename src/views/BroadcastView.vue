<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import AppSelect from '@/components/AppSelect.vue'
import AppTextArea from '@/components/AppTextArea.vue'
import StateBlock from '@/components/StateBlock.vue'
import { apiFetch } from '@/lib/api'
import { groupOptions, type SelectOption } from '@/lib/select'
import { useGuildStore } from '@/stores/guild'
import { useSessionStore } from '@/stores/session'

const MAX_LENGTH = 2000

type BroadcastResult = { channelName: string; url: string }

const guild = useGuildStore()
const session = useSessionStore()

const channelId = ref<string | null>(null)
const content = ref('')
const sending = ref(false)
const result = ref<BroadcastResult | null>(null)
const error = ref<string | null>(null)

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
const canSend = computed(
  () => channelId.value != null && content.value.trim().length > 0 && remaining.value >= 0,
)

async function send() {
  if (!canSend.value || !channelId.value) return

  sending.value = true
  error.value = null
  result.value = null
  try {
    result.value = await apiFetch<BroadcastResult>('/api/broadcast', {
      method: 'POST',
      body: { channelId: channelId.value, content: content.value },
    })
    content.value = ''
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Could not send the message.'
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="card">
      <div class="card-header">
        <div>
          <p class="text-title-medium">Send a message as the bot</p>
          <p class="text-body-medium text-on-surface-variant">
            Equivalent to the <code>/broadcast</code> command.
          </p>
        </div>
      </div>

      <div class="card-body">
        <StateBlock
          :loading="guild.loading && !guild.directory"
          :error="guild.error"
          :retry="() => guild.load(true)"
        >
          <div
            class="grid grid-cols-1 items-start gap-7 large:grid-cols-[minmax(0,1fr)_minmax(0,380px)]"
          >
            <form class="flex flex-col gap-6" @submit.prevent="send">
              <AppSelect v-model="channelId" label="Channel" :options="channelOptions" />

              <AppTextArea
                v-model="content"
                label="Message"
                :maxlength="MAX_LENGTH"
                supporting-text="Discord markdown is supported."
              />

              <p v-if="error" class="alert alert-error">{{ error }}</p>
              <p v-else-if="result" class="alert alert-success">
                Posted to #{{ result.channelName }} —
                <a
                  class="font-medium underline underline-offset-2"
                  :href="result.url"
                  target="_blank"
                  rel="noopener"
                >
                  open in Discord
                </a>
              </p>

              <div>
                <button class="btn btn-filled" type="submit" :disabled="!canSend || sending">
                  {{ sending ? 'Sending…' : 'Send message' }}
                </button>
              </div>
            </form>

            <aside class="flex flex-col gap-2.5">
              <p class="text-title-small">Preview</p>

              <div class="flex gap-3 rounded-lg bg-surface-container-lowest p-4">
                <div
                  class="grid size-10 shrink-0 place-items-center rounded-full bg-primary font-bold text-on-primary"
                  aria-hidden="true"
                >
                  P
                </div>
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="text-title-small">Plana</span>
                    <span class="chip chip-accent">BOT</span>
                    <span class="text-body-medium text-on-surface-variant">
                      in {{ selected ? `#${selected.name}` : 'no channel selected' }}
                    </span>
                  </div>
                  <p class="mt-1 [overflow-wrap:anywhere] whitespace-pre-wrap text-on-surface">
                    {{ content || 'Your message will appear here.' }}
                  </p>
                </div>
              </div>

              <p class="text-body-medium text-on-surface-variant">
                Sent by {{ session.user?.displayName }} and recorded in the audit log.
              </p>
            </aside>
          </div>
        </StateBlock>
      </div>
    </div>
  </div>
</template>
