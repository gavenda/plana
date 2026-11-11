<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Tooltip } from 'tailwind-material3'

import { discordTextColor, roleColor } from '@/lib/discord'
import { formatDuration, relativeTime } from '@/lib/format'
import { loadMention, mentionEntry } from '@/lib/mentions'

/**
 * A role, channel or user drawn like a Discord mention. With an `id`, hovering (or focusing) it
 * opens a tooltip with a few numbers about it.
 */
const props = defineProps<{
  kind: 'role' | 'channel' | 'user'
  /** Without the leading # or @; empty for a user the page can't name until it is hovered. */
  name: string
  /** A role's hex colour from Discord; ignored for channels. */
  color?: string | null
  /** The role, channel or member's ID; without one there is no tooltip. */
  id?: string | null
}>()

const style = computed(() => {
  if (props.kind !== 'role') return undefined
  const base = roleColor(props.color) ?? 'var(--color-secondary)'
  return {
    color:
      discordTextColor(props.color) ?? `color-mix(in oklab, ${base} 80%, var(--color-on-surface))`,
    backgroundColor: `color-mix(in srgb, ${base} 16%, transparent)`,
  }
})

// The tooltip's popup is a block element, which the server's HTML (a mention often sits inside a
// <p>) can't hold, so it is added once the page is live.
const ready = ref(false)
onMounted(() => (ready.value = true))

const open = ref(false)
watch(open, (on) => {
  if (on && props.id) void loadMention(props.kind, props.id)
})

const entry = computed(() => (props.id ? mentionEntry(props.kind, props.id) : undefined))
const brief = computed(() => (entry.value?.status === 'ready' ? entry.value.brief : null))

/** A user the page has no name for is named by the brief once hovering has loaded it. */
const shownName = computed(() => {
  if (props.name) return props.name
  return brief.value?.kind === 'user' ? brief.value.member.displayName : 'unknown-user'
})

const label = computed(() =>
  props.kind === 'channel' ? `#${shownName.value}` : `@${shownName.value}`,
)

const spent = (ms: number) => (ms > 0 ? formatDuration(ms) : 'none')

/** Label and value pairs for whatever is loaded. */
const rows = computed<[string, string][]>(() => {
  const loaded = brief.value
  if (!loaded) return []

  if (loaded.kind === 'user') {
    const days = `Last ${loaded.days} days`
    return [
      [
        'Joined',
        loaded.inServer && loaded.joinedAt != null ? relativeTime(loaded.joinedAt) : 'Left',
      ],
      [`Voice, ${days.toLowerCase()}`, spent(loaded.voiceMs)],
      [
        `Games, ${days.toLowerCase()}`,
        loaded.gameMs > 0
          ? `${formatDuration(loaded.gameMs)}${loaded.topGame ? `, mostly ${loaded.topGame}` : ''}`
          : 'none',
      ],
      [`Music, ${days.toLowerCase()}`, loaded.plays > 0 ? `${loaded.plays} plays` : 'none'],
    ]
  }

  if (loaded.kind === 'role') {
    return [['Members', loaded.members.toLocaleString('en')]]
  }

  const result: [string, string][] = loaded.category ? [['Category', loaded.category]] : []
  if (loaded.voice) {
    result.push(
      [`Voice, last ${loaded.voice.days} days`, spent(loaded.voice.ms)],
      ['People', loaded.voice.members.toLocaleString('en')],
    )
    if (loaded.voice.top.length > 0) {
      result.push(['Most time', loaded.voice.top.map((person) => person.displayName).join(', ')])
    }
  }
  return result
})
</script>

<template>
  <Tooltip v-if="id && ready" v-model:open="open" variant="rich" placement="bottom-start">
    <span
      class="rounded-extra-small px-1 font-medium whitespace-nowrap"
      :class="kind !== 'role' && 'mention-blurple'"
      :style="style"
      tabindex="0"
      >{{ label }}</span
    >
    <template #subhead>{{ label }}</template>
    <template #content>
      <p v-if="!entry || entry.status === 'loading'" class="text-on-surface-variant">Loading…</p>
      <p v-else-if="entry.status === 'error'">{{ entry.message }}</p>
      <p v-else-if="rows.length === 0">Nothing is recorded for this one.</p>
      <dl v-else class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5">
        <template v-for="[term, value] in rows" :key="term">
          <dt class="text-on-surface-variant">{{ term }}</dt>
          <dd class="text-on-surface">{{ value }}</dd>
        </template>
      </dl>
    </template>
  </Tooltip>
  <span
    v-else
    class="rounded-extra-small px-1 font-medium whitespace-nowrap"
    :class="kind !== 'role' && 'mention-blurple'"
    :style="style"
    >{{ label }}</span
  >
</template>
