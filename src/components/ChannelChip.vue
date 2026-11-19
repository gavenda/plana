<script setup lang="ts">
import { computed } from 'vue'
import { Chip, Menu, MenuGroup, MenuItem } from 'tailwind-material3'

import type { SelectOption } from '@/lib/select'

/**
 * A voice channel picked from an assist chip that opens a menu, for where a full select field
 * is too heavy (the Queue dialog's title). Options sharing a `group` (a category) form a
 * labelled section, as in AppSelect; run them through `groupOptions` first.
 */
const props = defineProps<{
  options: SelectOption<string>[]
  /** The menu's accessible name, and the chip's when nothing is chosen. */
  label: string
  disabled?: boolean
}>()

const model = defineModel<string | null>({ required: true })

const chosen = computed(() => props.options.find((option) => option.value === model.value))

/** Consecutive options of one group, in the order they come. */
const sections = computed(() => {
  const list: { group: string | undefined; options: SelectOption<string>[] }[] = []
  for (const option of props.options) {
    const last = list.at(-1)
    if (last && last.group === option.group) last.options.push(option)
    else list.push({ group: option.group, options: [option] })
  }
  return list
})
</script>

<template>
  <Menu :label="label">
    <template #anchor="{ toggle, props: anchorProps }">
      <Chip
        type="assist"
        v-bind="anchorProps"
        :disabled="disabled"
        :aria-label="chosen ? `${label}: ${chosen.label}` : label"
        @click="toggle"
      >
        {{ chosen?.label ?? 'Choose a channel' }}
        <template #trailing-icon>
          <span class="icon" aria-hidden="true">arrow_drop_down</span>
        </template>
      </Chip>
    </template>

    <!-- The library's menu has no max height, so a server with many channels would run off the
         window. The groups scroll inside this instead; its padding (taken back by the negative
         margin) keeps their shadows from being clipped. -->
    <div
      class="-m-1 flex max-h-[min(400px,60vh)] flex-col gap-0.5 overflow-y-auto overscroll-contain p-1"
    >
      <MenuGroup v-for="section in sections" :key="section.group ?? ''" :label="section.group">
        <MenuItem
          v-for="option in section.options"
          :key="option.value"
          :selected="option.value === model"
          :trailing-text="option.trailing"
          :disabled="option.disabled"
          @click="model = option.value"
          >{{ option.label }}</MenuItem
        >
      </MenuGroup>
    </div>
  </Menu>
</template>
