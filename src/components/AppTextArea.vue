<script setup lang="ts">
import { computed, ref, useId } from 'vue'

import OutlinedField from '@/components/OutlinedField.vue'

/** M3 outlined text field, multi-line, with an optional character counter. */
const props = defineProps<{
  label: string
  maxlength?: number
  disabled?: boolean
  supportingText?: string
}>()

const model = defineModel<string>({ required: true })

const id = useId()
const focused = ref(false)

const counter = computed(() =>
  props.maxlength != null ? `${model.value.length} / ${props.maxlength}` : undefined,
)
const invalid = computed(() => props.maxlength != null && model.value.length > props.maxlength)
</script>

<template>
  <OutlinedField
    :label="label"
    :label-id="`${id}-label`"
    :control-id="id"
    :populated="model.length > 0"
    :focused="focused"
    :disabled="disabled"
    :invalid="invalid"
    multiline
    :supporting-text="supportingText"
    :supporting-id="`${id}-supporting`"
    :counter="counter"
  >
    <textarea
      :id="id"
      v-model="model"
      :maxlength="maxlength"
      :disabled="disabled"
      :aria-describedby="supportingText ? `${id}-supporting` : undefined"
      :aria-invalid="invalid || undefined"
      class="block min-h-40 w-full resize-y rounded-xs bg-transparent px-4 py-4 text-body-large text-on-surface focus-visible:outline-none disabled:text-on-surface/38"
      @focus="focused = true"
      @blur="focused = false"
    ></textarea>
  </OutlinedField>
</template>
