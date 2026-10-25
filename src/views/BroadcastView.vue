<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import AppSelect from '@/components/AppSelect.vue'
import AppTextArea from '@/components/AppTextArea.vue'
import DiscordMention from '@/components/DiscordMention.vue'
import DiscordMessage from '@/components/DiscordMessage.vue'
import StateBlock from '@/components/StateBlock.vue'
import { apiFetch } from '@/lib/api'
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
const content = ref('')
const sending = ref(false)

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
  try {
    const result = await apiFetch<BroadcastResult>('/api/broadcast', {
      method: 'POST',
      body: { channelId: channelId.value, content: content.value },
    })
    content.value = ''
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
            :loading="guild.loading && !guild.directory"
            :error="guild.error"
            :retry="() => guild.load(true)"
          >
            <form class="flex flex-col gap-6" @submit.prevent="send">
              <AppSelect v-model="channelId" label="Channel" :options="channelOptions" />

              <AppTextArea
                v-model="content"
                label="Message"
                :maxlength="MAX_LENGTH"
                supporting-text="Discord markdown is supported."
              />

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
            <div class="min-w-0">
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
              <p class="mt-1 [overflow-wrap:anywhere] whitespace-pre-wrap text-on-surface">
                <DiscordMessage v-if="content" :content="content" />
                <template v-else>Your message will appear here.</template>
              </p>
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
