<script setup lang="ts">
import { computed, ref, useId } from 'vue'

import OutlinedField from '@/components/OutlinedField.vue'

/**
 * M3 outlined text field, single line, with an optional character counter. Takes an unset value
 * as empty, for optional fields of data it edits in place.
 */
const props = defineProps<{
  label: string
  maxlength?: number
  disabled?: boolean
  supportingText?: string
  inputType?: 'text' | 'url'
  placeholder?: string
}>()

const model = defineModel<string | null>()
const text = computed(() => model.value ?? '')

/** A URL field hints at the scheme it wants unless given its own placeholder. */
const hint = computed(
  () => props.placeholder ?? (props.inputType === 'url' ? 'https://' : undefined),
)

const id = useId()
const focused = ref(false)

const counter = computed(() =>
  props.maxlength != null ? `${text.value.length} / ${props.maxlength}` : undefined,
)
const invalid = computed(() => props.maxlength != null && text.value.length > props.maxlength)
</script>

<template>
  <OutlinedField
    :label="label"
    :label-id="`${id}-label`"
    :control-id="id"
    :populated="text.length > 0 || (focused && !!hint)"
    :focused="focused"
    :disabled="disabled"
    :invalid="invalid"
    :supporting-text="supportingText"
    :supporting-id="`${id}-supporting`"
    :counter="counter"
  >
    <input
      :id="id"
      :value="text"
      :type="inputType"
      :maxlength="maxlength"
      :disabled="disabled"
      :placeholder="focused ? hint : undefined"
      :aria-describedby="supportingText ? `${id}-supporting` : undefined"
      :aria-invalid="invalid || undefined"
      class="block h-14 w-full rounded-xs bg-transparent px-4 text-body-large text-on-surface placeholder:text-on-surface-variant focus-visible:outline-none disabled:text-on-surface/38"
      @input="model = ($event.target as HTMLInputElement).value"
      @focus="focused = true"
      @blur="focused = false"
    />
  </OutlinedField>
</template>
