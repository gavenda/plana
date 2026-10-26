<script setup lang="ts">
import { ref, useId } from 'vue'

/**
 * M3 search bar: a fully rounded 56dp pill on surface-container-high, with a leading search
 * icon and a trailing clear button once there is something to clear. A `#trailing` slot puts
 * supporting text (such as a match count) just before that button.
 */
defineProps<{ placeholder: string; label?: string }>()

const model = defineModel<string>({ required: true })

const id = useId()
const input = ref<HTMLInputElement | null>(null)

function clear() {
  model.value = ''
  input.value?.focus()
}
</script>

<template>
  <div
    class="state-layer flex h-14 cursor-text items-center gap-1 rounded-full-56 bg-surface-container-high pr-1 pl-4 text-on-surface-variant focus-within:before:opacity-0"
    @click="input?.focus()"
  >
    <span class="shrink-0 icon [--icon-size:24px]" aria-hidden="true">search</span>

    <input
      :id="id"
      ref="input"
      v-model="model"
      type="search"
      :placeholder="placeholder"
      :aria-label="label ?? placeholder"
      autocomplete="off"
      spellcheck="false"
      class="h-full min-w-0 flex-1 bg-transparent pl-3 text-body-large text-on-surface placeholder:text-on-surface-variant focus-visible:outline-none [&::-webkit-search-cancel-button]:hidden"
      @keydown.esc="model ? clear() : input?.blur()"
    />

    <span
      v-if="$slots.trailing"
      class="shrink-0 px-2 text-label-large whitespace-nowrap text-on-surface-variant"
    >
      <slot name="trailing" />
    </span>

    <button
      v-if="model"
      class="icon-btn"
      type="button"
      aria-label="Clear search"
      title="Clear search"
      @click.stop="clear"
    >
      <span class="icon [--icon-size:24px]" aria-hidden="true">close</span>
    </button>
  </div>
</template>
