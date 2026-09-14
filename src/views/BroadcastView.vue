<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import StateBlock from '@/components/StateBlock.vue'
import { apiFetch } from '@/lib/api'
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

/** Grouped so a long channel list stays navigable. */
const grouped = computed(() => {
  const groups = new Map<string, typeof guild.channels>()
  for (const channel of guild.channels) {
    const key = channel.category ?? 'No category'
    const bucket = groups.get(key) ?? []
    bucket.push(channel)
    groups.set(key, bucket)
  }
  return [...groups.entries()]
})

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
  <div class="flex flex-col gap-5">
    <div class="rounded-lg border border-line bg-surface">
      <div class="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
        <div>
          <p class="text-[15px] font-semibold">Send a message as the bot</p>
          <p class="text-[13px] text-faint">
            Equivalent to the <code class="font-mono text-xs">/broadcast</code> command.
          </p>
        </div>
      </div>

      <div class="p-5">
        <StateBlock :loading="guild.loading && !guild.directory" :error="guild.error">
          <div
            class="grid grid-cols-1 items-start gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]"
          >
            <form class="flex flex-col gap-[18px]" @submit.prevent="send">
              <div class="flex flex-col gap-1.5">
                <label class="text-[13px] font-semibold" for="channel">Channel</label>
                <select id="channel" v-model="channelId" class="select">
                  <option :value="null" disabled>Choose a channel…</option>
                  <optgroup v-for="[category, list] in grouped" :key="category" :label="category">
                    <option
                      v-for="channel in list"
                      :key="channel.id"
                      :value="channel.id"
                      :disabled="!channel.sendable"
                    >
                      #{{ channel.name }}{{ channel.sendable ? '' : ' (no access)' }}
                    </option>
                  </optgroup>
                </select>
              </div>

              <div class="flex flex-col gap-1.5">
                <label class="text-[13px] font-semibold" for="content">Message</label>
                <textarea
                  id="content"
                  v-model="content"
                  class="textarea"
                  placeholder="Discord markdown is supported."
                  :maxlength="MAX_LENGTH"
                ></textarea>
                <p class="text-[12.5px]" :class="remaining < 0 ? 'text-danger' : 'text-muted'">
                  {{ remaining }} characters remaining
                </p>
              </div>

              <p v-if="error" class="alert alert-error">{{ error }}</p>
              <p v-else-if="result" class="alert alert-success">
                Posted to #{{ result.channelName }} —
                <a class="underline" :href="result.url" target="_blank" rel="noopener">
                  open in Discord
                </a>
              </p>

              <div>
                <button class="btn btn-primary" type="submit" :disabled="!canSend || sending">
                  {{ sending ? 'Sending…' : 'Send message' }}
                </button>
              </div>
            </form>

            <aside class="flex flex-col gap-2.5">
              <p class="text-[13px] font-semibold">Preview</p>

              <div class="flex gap-3 rounded-md border border-line bg-canvas p-3.5">
                <div
                  class="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent font-bold text-white"
                  aria-hidden="true"
                >
                  P
                </div>
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="font-semibold">Plana</span>
                    <span class="badge badge-accent">BOT</span>
                    <span class="text-[13px] text-faint">
                      in {{ selected ? `#${selected.name}` : 'no channel selected' }}
                    </span>
                  </div>
                  <p class="mt-1 [overflow-wrap:anywhere] whitespace-pre-wrap text-ink">
                    {{ content || 'Your message will appear here.' }}
                  </p>
                </div>
              </div>

              <p class="text-[13px] text-faint">
                Sent by {{ session.user?.displayName }} and recorded in the audit log.
              </p>
            </aside>
          </div>
        </StateBlock>
      </div>
    </div>
  </div>
</template>
