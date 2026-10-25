<script setup lang="ts">
import { computed } from 'vue'

import { discordTextColor, roleColor } from '@/lib/discord'

/**
 * A role, channel or user name, drawn the way Discord draws a mention: a role in its own colour
 * on a faint wash of it, a channel (#name) or user (@name) in Discord's mention blurple. Role
 * colours are mixed a little towards on-surface so a dark one still reads on the dark theme; a
 * role without a colour takes secondary (lilac), as navigation and selection do.
 */
const props = defineProps<{
  kind: 'role' | 'channel' | 'user'
  /** Without the leading # or @. */
  name: string
  /** A role's hex colour from Discord; ignored for channels. */
  color?: string | null
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
</script>

<template>
  <span
    class="rounded-xs px-1 font-medium whitespace-nowrap"
    :class="kind !== 'role' && 'mention-blurple'"
    :style="style"
    >{{ kind === 'channel' ? `#${name}` : `@${name}` }}</span
  >
</template>
