<script setup lang="ts" generic="T extends string">
import { Button, ButtonGroup } from 'tailwind-material3'

/**
 * A single choice as a connected button group (tailwind-material3's ButtonGroup): tonal buttons
 * 2dp apart, the chosen one fully round in the stronger colour. One is always chosen.
 */
defineProps<{
  label: string
  options: { value: T; label: string; icon?: string; disabled?: boolean }[]
}>()

const model = defineModel<T>({ required: true })
</script>

<template>
  <ButtonGroup
    :model-value="model"
    variant="connected"
    selection="single"
    required
    :aria-label="label"
    class="self-start"
    @update:model-value="(value) => value != null && (model = value as T)"
  >
    <Button
      v-for="option in options"
      :key="option.value"
      :value="option.value"
      variant="tonal"
      :disabled="option.disabled"
      class="min-w-24"
    >
      <template v-if="option.icon" #icon>
        <span class="icon [--icon-size:20px]" aria-hidden="true">{{ option.icon }}</span>
      </template>
      {{ option.label }}
    </Button>
  </ButtonGroup>
</template>
