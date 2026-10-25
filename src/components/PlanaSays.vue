<script setup lang="ts">
import PlanaPortrait from '@/components/PlanaPortrait.vue'
import SpeechBubble from '@/components/SpeechBubble.vue'
import type { PlanaMood } from '@/lib/plana'

/** Her portrait with one line in a speech bubble: beside her (`row`) or under her (`column`). */
withDefaults(defineProps<{ mood: PlanaMood; size?: number; layout?: 'row' | 'column' }>(), {
  size: 96,
  layout: 'row',
})
</script>

<template>
  <div
    class="flex items-center"
    :class="layout === 'row' ? 'gap-4 text-left' : 'flex-col gap-3 text-center'"
  >
    <PlanaPortrait :mood="mood" :size="size" />
    <SpeechBubble :tail="layout === 'row' ? 'start' : 'top'" class="max-w-[360px]">
      <slot />
    </SpeechBubble>
  </div>
</template>
