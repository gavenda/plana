<script setup lang="ts">
/** M3 filter chip. */
defineProps<{ label: string }>()

const selected = defineModel<boolean>({ required: true })
</script>

<template>
  <button
    type="button"
    class="state-layer inline-flex h-8 shrink-0 cursor-pointer items-center gap-2 rounded-sm text-label-large whitespace-nowrap transition-[background-color,border-color,padding] duration-200 ease-effects-fast select-none"
    :class="
      selected
        ? 'border border-transparent bg-secondary-container pr-4 pl-2 text-on-secondary-container'
        : 'border border-outline-variant px-4 text-on-surface-variant'
    "
    :aria-pressed="selected"
    @click="selected = !selected"
  >
    <span v-if="selected" class="icon [--icon-size:18px]" aria-hidden="true">check</span>
    {{ label }}
  </button>
</template>
