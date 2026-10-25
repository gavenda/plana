<script setup lang="ts">
import { onMounted, ref, useId, watch } from 'vue'

/**
 * M3 basic dialog on a native <dialog>, which gives focus trapping and Escape for free.
 * Put her portrait in the `hero` slot for a confirmation; see "Dialogs" in BRANDING.md.
 */
defineProps<{ headline: string }>()
const open = defineModel<boolean>('open', { required: true })

const dialog = ref<HTMLDialogElement | null>(null)
const headlineId = useId()

function sync(value: boolean) {
  const el = dialog.value
  if (!el) return
  if (value && !el.open) el.showModal()
  else if (!value && el.open) el.close()
}

onMounted(() => sync(open.value))
watch(open, sync)

/** A click on the dialog element itself, not its content, is a click on the scrim. */
function onClick(event: MouseEvent) {
  if (event.target === dialog.value) open.value = false
}
</script>

<template>
  <dialog
    ref="dialog"
    :aria-labelledby="headlineId"
    class="m-auto w-[min(560px,calc(100vw-48px))] min-w-[280px] scale-90 rounded-xl bg-surface-container-high p-0 text-on-surface opacity-0 shadow-level3 transition-[scale,opacity,display,overlay] transition-discrete duration-200 ease-effects backdrop:bg-scrim/32 open:scale-100 open:opacity-100 open:duration-500 open:ease-spatial starting:open:scale-90 starting:open:opacity-0"
    @click="onClick"
    @close="open = false"
  >
    <div class="flex flex-col gap-4 p-6">
      <div v-if="$slots.hero" class="flex justify-center">
        <slot name="hero" />
      </div>
      <h2 :id="headlineId" class="text-headline-small" :class="$slots.hero && 'text-center'">
        {{ headline }}
      </h2>
      <div class="text-body-medium text-on-surface-variant" :class="$slots.hero && 'text-center'">
        <slot />
      </div>
      <div class="flex justify-end gap-2 pt-2">
        <slot name="actions" />
      </div>
    </div>
  </dialog>
</template>
