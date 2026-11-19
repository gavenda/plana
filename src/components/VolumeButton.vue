<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { IconButton, Slider } from 'tailwind-material3'

/**
 * A volume icon button that opens a vertical slider above it. The popup is a native `popover`,
 * in the top layer so the card can't clip it; the browser closes it on Escape or a click
 * outside. The library's `Menu` would take the slider's arrow keys for its own items.
 */
const props = defineProps<{
  /** 0 to 1. */
  volume: number
  disabled?: boolean
}>()

const emit = defineEmits<{ change: [volume: number] }>()

const id = useId()
const popup = ref<HTMLElement | null>(null)
const anchor = ref<HTMLElement | null>(null)
const open = ref(false)
/** Hidden until it's been measured and moved beside the button, so it never shows elsewhere first. */
const placed = ref(false)

/** Where the slider is while it's dragged; the volume Vivy reports shows otherwise. */
const dragging = ref<number | null>(null)
const percent = computed(() => dragging.value ?? Math.round(props.volume * 100))

const icon = computed(() =>
  percent.value === 0 ? 'volume_off' : percent.value < 50 ? 'volume_down' : 'volume_up',
)

const GAP = 4
const EDGE = 8

function toggling(event: Event) {
  open.value = (event as ToggleEvent).newState === 'open'
  placed.value = false
  if (!open.value) dragging.value = null
}

/** Above the button, centred on it; below when there's no room above. Measured once it shows. */
function place(event: Event) {
  if ((event as ToggleEvent).newState !== 'open') return
  const el = popup.value
  const rect = anchor.value?.getBoundingClientRect()
  if (!el || !rect) return
  const width = el.offsetWidth
  const height = el.offsetHeight
  const left = Math.min(
    Math.max(rect.left + rect.width / 2 - width / 2, EDGE),
    window.innerWidth - width - EDGE,
  )
  const above = rect.top - GAP - height >= EDGE
  el.style.left = `${left}px`
  el.style.top = `${above ? rect.top - GAP - height : rect.bottom + GAP}px`
  placed.value = true
}

function changed(value: number | [number, number]) {
  const next = Array.isArray(value) ? value[0] : value
  dragging.value = null
  if (next !== Math.round(props.volume * 100)) emit('change', next / 100)
}
</script>

<template>
  <span ref="anchor" class="inline-flex">
    <IconButton
      variant="standard"
      label="Volume"
      :disabled="disabled"
      :popovertarget="id"
      :aria-expanded="open"
    >
      <span class="icon" aria-hidden="true">{{ icon }}</span>
    </IconButton>
  </span>
  <div
    :id="id"
    ref="popup"
    popover="auto"
    class="fixed inset-auto m-0 flex-col items-center gap-2 rounded-large border-0 bg-surface-container px-2 pt-3 pb-1 text-on-surface shadow-elevation-2 open:flex"
    :class="!placed && 'invisible'"
    @beforetoggle="toggling"
    @toggle="place"
  >
    <span class="text-label-medium text-on-surface-variant tabular-nums">{{ percent }}%</span>
    <!-- A vertical slider is as tall as its parent (its own h-full outranks a height given to it). -->
    <div class="h-40">
      <Slider
        orientation="vertical"
        :min="0"
        :max="100"
        :step="1"
        :model-value="percent"
        label="Volume"
        :format="(value: number) => `${value}%`"
        :disabled="disabled"
        @update:model-value="(value) => (dragging = Array.isArray(value) ? value[0] : (value ?? 0))"
        @change="changed"
      />
    </div>
  </div>
</template>
