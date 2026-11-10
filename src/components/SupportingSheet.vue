<script setup lang="ts">
import { SideSheet } from 'tailwind-material3'

/**
 * A supporting pane: tailwind-material3's modal side sheet, floating 16dp from the window's edges.
 * The `leading` slot (art, an avatar) and `supporting` slot open its content, beside each other.
 * Escape, the scrim and the close button shut it.
 */
defineProps<{
  headline?: string
  /** The sheet's name for assistive tech when it has no visible headline. */
  label?: string
}>()
const open = defineModel<boolean>('open', { required: true })
</script>

<template>
  <SideSheet
    v-model:open="open"
    detached
    close-label="Close"
    :aria-label="headline ? undefined : label"
  >
    <template v-if="headline" #headline>
      <span :title="headline">{{ headline }}</span>
    </template>
    <div v-if="$slots.leading || $slots.supporting" class="flex items-center gap-4 pb-4">
      <slot name="leading" />
      <p v-if="$slots.supporting" class="text-body-medium text-on-surface-variant">
        <slot name="supporting" />
      </p>
    </div>
    <div class="pb-4 text-on-surface">
      <slot />
    </div>
  </SideSheet>
</template>
