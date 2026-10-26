<script setup lang="ts">
import RichTooltip from '@/components/RichTooltip.vue'
import { useLiveStatus } from '@/lib/live'

/**
 * A list's refresh button. While the live connection is open, a small dot on it says the list
 * already updates on its own, so refreshing is rarely needed. Only pages that follow their
 * data live (`useLive`) should use it.
 */
defineProps<{ disabled?: boolean }>()
defineEmits<{ click: [] }>()

const { connected } = useLiveStatus()
</script>

<template>
  <RichTooltip
    action
    tonal
    narrow
    title="Refresh"
    :text="connected ? 'This list is updating live, so refreshing is rarely needed.' : undefined"
    :label="connected ? 'Refresh (updating live)' : 'Refresh'"
    icon="refresh"
    :disabled="disabled"
    @click="$emit('click')"
  >
    <!-- M3's small badge: a 6dp dot on the top end, in the success colour for "live". -->
    <span
      v-if="connected"
      class="absolute top-1 right-0.5 size-1.5 rounded-full bg-success"
      aria-hidden="true"
    />
  </RichTooltip>
</template>
