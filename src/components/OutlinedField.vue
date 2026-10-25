<script setup lang="ts">
import { computed } from 'vue'

/**
 * The M3 outlined text field container: a notched outline with a label that rests
 * inside the field and floats into the notch once the field is focused or filled.
 * The control itself goes in the default slot and must have a transparent background.
 */
const props = defineProps<{
  label: string
  labelId: string
  /** The control's id, so clicking the label focuses it. */
  controlId?: string
  populated: boolean
  focused: boolean
  disabled?: boolean
  invalid?: boolean
  multiline?: boolean
  supportingText?: string
  supportingId?: string
  /** Shown at the end of the supporting text row, e.g. a character counter. */
  counter?: string
}>()

const floated = computed(() => props.populated || props.focused)

const outlineClass = computed(() => {
  if (props.disabled) return 'border-on-surface/12'
  if (props.focused) return props.invalid ? 'border-2 border-error' : 'border-2 border-primary'
  if (props.invalid) return 'border-error group-hover/field:border-on-error-container'
  return 'border-outline group-hover/field:border-on-surface'
})

const labelColor = computed(() => {
  if (props.disabled) return 'text-on-surface/38'
  if (props.invalid) return 'text-error'
  if (props.focused) return 'text-primary'
  return 'text-on-surface-variant'
})

const labelPosition = computed(() => {
  if (floated.value) return 'top-0 -translate-y-1/2 text-body-small'
  return props.multiline ? 'top-4 text-body-large' : 'top-1/2 -translate-y-1/2 text-body-large'
})
</script>

<template>
  <div class="flex flex-col gap-1">
    <div class="group/field relative">
      <slot />

      <!-- The outline. Its legend is an invisible copy of the label that opens the notch. -->
      <fieldset
        aria-hidden="true"
        class="pointer-events-none absolute inset-x-0 -top-[5px] bottom-0 m-0 rounded-xs border px-3 text-left transition-colors duration-150 ease-effects-fast"
        :class="outlineClass"
      >
        <legend
          class="invisible float-none block h-[11px] w-auto overflow-hidden p-0 text-body-small whitespace-nowrap transition-[max-width] duration-150 ease-effects-fast"
          :class="floated ? 'max-w-full' : 'max-w-[0.01px]'"
        >
          <span class="inline-block px-1">{{ label }}</span>
        </legend>
      </fieldset>

      <label
        :id="labelId"
        :for="controlId"
        class="pointer-events-none absolute left-4 max-w-[calc(100%-4rem)] truncate transition-all duration-150 ease-effects-fast"
        :class="[labelPosition, labelColor]"
        >{{ label }}</label
      >
    </div>

    <div
      v-if="supportingText || counter"
      class="flex justify-between gap-4 px-4 text-body-small"
      :class="invalid ? 'text-error' : disabled ? 'text-on-surface/38' : 'text-on-surface-variant'"
    >
      <span :id="supportingId">{{ supportingText }}</span>
      <span v-if="counter" class="shrink-0 tabular-nums">{{ counter }}</span>
    </div>
  </div>
</template>
