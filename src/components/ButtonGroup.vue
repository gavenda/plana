<script setup lang="ts" generic="T extends string">
import { ref } from 'vue'

/**
 * M3 Expressive connected button group, single-select: tonal buttons 2dp apart, the outer
 * corners round and the inner ones small. The chosen button turns fully round and takes the
 * stronger colour; pressing one squeezes its corners. Arrow keys move the choice, as in a radio group.
 */
const props = defineProps<{
  label: string
  options: { value: T; label: string; icon?: string; disabled?: boolean }[]
}>()

const model = defineModel<T>({ required: true })
const buttons = ref<HTMLButtonElement[]>([])

function step(from: number, by: number) {
  const count = props.options.length
  for (let offset = 1; offset <= count; offset++) {
    const index = (from + by * offset + count * offset) % count
    const option = props.options[index]!
    if (option.disabled) continue
    model.value = option.value
    buttons.value[index]?.focus()
    return
  }
}

function onKeydown(event: KeyboardEvent, index: number) {
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') step(index, 1)
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') step(index, -1)
  else return
  event.preventDefault()
}
</script>

<template>
  <div role="radiogroup" :aria-label="label" class="inline-flex h-10 gap-0.5 self-start">
    <button
      v-for="(option, index) in options"
      :key="option.value"
      ref="buttons"
      type="button"
      role="radio"
      :aria-checked="model === option.value"
      :tabindex="model === option.value ? 0 : -1"
      :disabled="option.disabled"
      class="state-layer inline-flex min-w-24 cursor-pointer items-center justify-center gap-2 px-4 text-label-large whitespace-nowrap transition-[border-radius,background-color,color] duration-350 ease-spatial-fast select-none active:not-disabled:rounded-xs disabled:cursor-not-allowed disabled:bg-on-surface/12 disabled:text-on-surface/38"
      :class="
        model === option.value
          ? 'rounded-full-40 bg-secondary text-on-secondary'
          : 'rounded-sm bg-secondary-container text-on-secondary-container first:rounded-l-full-40 last:rounded-r-full-40'
      "
      @click="model = option.value"
      @keydown="onKeydown($event, index)"
    >
      <span v-if="option.icon" class="icon [--icon-size:18px]" aria-hidden="true">{{
        option.icon
      }}</span>
      {{ option.label }}
    </button>
  </div>
</template>
