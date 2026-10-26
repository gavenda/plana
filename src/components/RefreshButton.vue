<script setup lang="ts">
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
  <button
    class="icon-btn icon-btn-tonal icon-btn-narrow relative"
    type="button"
    :aria-label="connected ? 'Refresh (updating live)' : 'Refresh'"
    :title="connected ? 'Refresh · Updating live' : 'Refresh'"
    :disabled="disabled"
    @click="$emit('click')"
  >
    <span class="icon [--icon-size:20px]" aria-hidden="true">refresh</span>
    <!-- M3's small badge: a 6dp dot on the top end, in the success colour for "live". -->
    <span
      v-if="connected"
      class="absolute top-1 right-0.5 size-1.5 rounded-full bg-success"
      aria-hidden="true"
    />
  </button>
</template>
