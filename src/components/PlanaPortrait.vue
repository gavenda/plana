<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'

import type { PlanaMood } from '@/lib/plana'
import { LivePortrait, livePortraitsSupported } from '@/lib/plana-live'

const props = defineProps<{ mood: PlanaMood }>()

/** The badge's width, the same everywhere she appears; her ribbon and halo reach past it. */
const SIZE = 192

// Her canvas is 720x760 units, with a 560 unit badge at (80, 200) in it. Keep these in step
// with src/lib/plana-framing.json, which places her rig in it.
const CANVAS_WIDTH = 720
const CANVAS_HEIGHT = 760
const BADGE = 560
const BADGE_LEFT = 80
const BADGE_TOP = 200

const scale = SIZE / BADGE
const width = Math.round(CANVAS_WIDTH * scale)
const height = Math.round(CANVAS_HEIGHT * scale)

/**
 * M3's 9-sided cookie: nine rounded lobes, inner radius 0.8, one lobe pointing up, centred on
 * (cx, cy).
 */
function cookiePath(cx: number, cy: number, radius: number, steps = 180): string {
  const points: string[] = []
  for (let i = 0; i < steps; i++) {
    const theta = (2 * Math.PI * i) / steps
    const r = radius * (0.9 + 0.1 * Math.cos(9 * theta))
    points.push(`${(cx + r * Math.sin(theta)).toFixed(2)} ${(cy - r * Math.cos(theta)).toFixed(2)}`)
  }
  return `M${points.join('L')}Z`
}

const COOKIE = cookiePath(50, 50, 50)

/**
 * She is cut to the badge: inside the cookie, plus everything above its middle, so her head,
 * ribbon and halo stand clear of it.
 */
const centreY = BADGE_TOP + BADGE / 2
const MASK = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}" preserveAspectRatio="none">` +
    `<path d="${cookiePath(BADGE_LEFT + BADGE / 2, centreY, BADGE / 2)}"/>` +
    `<rect width="${CANVAS_WIDTH}" height="${centreY}"/></svg>`,
)}")`

const canvas = useTemplateRef<HTMLCanvasElement>('canvas')
const live = ref(false)
let portrait: LivePortrait | null = null

/** She comes alive the first time she's on screen; a hidden portrait (the phone notice) never does. */
let observer: IntersectionObserver | null = null
onMounted(() => {
  const el = canvas.value
  if (!el || !livePortraitsSupported()) return
  observer = new IntersectionObserver(([entry]) => {
    if (!entry?.isIntersecting) return
    observer?.disconnect()
    try {
      portrait = new LivePortrait(el, props.mood)
      portrait.ready.then(() => (live.value = true)).catch(() => {})
    } catch {
      portrait = null
    }
  })
  observer.observe(el)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  portrait?.dispose()
})

watch(
  () => props.mood,
  (mood) => portrait?.setMood(mood),
)

/** Pressing and holding on her pats her. */
function startPat(event: PointerEvent) {
  if (!live.value || event.button !== 0) return
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  portrait?.startPat()
}
function endPat() {
  portrait?.endPat()
}
</script>

<template>
  <!-- Decorative: the words beside her say what the screen has to. -->
  <div
    class="relative shrink-0 touch-none select-none"
    :class="{ 'cursor-grab active:cursor-grabbing': live }"
    :style="{ width: `${width}px`, height: `${height}px` }"
    aria-hidden="true"
    @pointerdown="startPat"
    @pointerup="endPat"
    @pointercancel="endPat"
    @lostpointercapture="endPat"
    @contextmenu="live && $event.preventDefault()"
  >
    <svg
      class="absolute bottom-0 fill-primary-container"
      viewBox="0 0 100 100"
      :style="{ left: `${BADGE_LEFT * scale}px`, width: `${SIZE}px`, height: `${SIZE}px` }"
    >
      <path :d="COOKIE" />
    </svg>
    <!-- She fades in once her rig is drawn; until then the badge stands alone. -->
    <canvas
      ref="canvas"
      class="absolute inset-0 size-full transition-opacity duration-300 ease-effects-slow"
      :class="live ? 'opacity-100' : 'opacity-0'"
      :style="{
        maskImage: MASK,
        maskSize: '100% 100%',
        WebkitMaskImage: MASK,
        WebkitMaskSize: '100% 100%',
      }"
    />
  </div>
</template>
