<script setup lang="ts" generic="T extends string">
/** M3 single-select segmented buttons: a row of outlined segments, the chosen one filled and checked. */
defineProps<{
  label: string
  options: { value: T; label: string; icon?: string; disabled?: boolean }[]
}>()

const model = defineModel<T>({ required: true })
</script>

<template>
  <div role="radiogroup" :aria-label="label" class="inline-flex h-10 self-start">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      role="radio"
      :aria-checked="model === option.value"
      :disabled="option.disabled"
      class="state-layer -ml-px inline-flex min-w-24 cursor-pointer items-center justify-center gap-2 border border-outline px-4 text-label-large whitespace-nowrap transition-colors duration-200 ease-effects-fast select-none first:ml-0 first:rounded-l-full last:rounded-r-full disabled:cursor-not-allowed disabled:border-on-surface/12 disabled:text-on-surface/38"
      :class="
        model === option.value
          ? 'bg-secondary-container text-on-secondary-container'
          : 'text-on-surface'
      "
      @click="model = option.value"
    >
      <span
        v-if="model === option.value || option.icon"
        class="icon [--icon-size:18px]"
        aria-hidden="true"
        >{{ model === option.value ? 'check' : option.icon }}</span
      >
      {{ option.label }}
    </button>
  </div>
</template>
