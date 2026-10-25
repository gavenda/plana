<script setup lang="ts">
import { portraitUrl, type PlanaMood } from '@/lib/plana'

defineProps<{ mood: PlanaMood }>()

/** The badge's width, the same everywhere she appears; her ribbon and halo reach past it. */
const SIZE = 128

// The canvas cut by scripts/brand_assets.py is 720x760 source pixels, with a 560px
// badge at (80, 200) in it. Keep these in step with the script.
const CANVAS_WIDTH = 720
const CANVAS_HEIGHT = 760
const BADGE = 560
const BADGE_LEFT = 80

const scale = SIZE / BADGE
const width = Math.round(CANVAS_WIDTH * scale)
const height = Math.round(CANVAS_HEIGHT * scale)

/**
 * M3's 9-sided cookie in a 100x100 box: nine rounded lobes, inner radius 0.8, one lobe
 * pointing up. Must match cookie9() in scripts/brand_assets.py, which cuts her to it.
 */
function cookiePath(steps = 180): string {
  const points: string[] = []
  for (let i = 0; i < steps; i++) {
    const theta = (2 * Math.PI * i) / steps
    const r = 50 * (0.9 + 0.1 * Math.cos(9 * theta))
    points.push(`${(50 + r * Math.sin(theta)).toFixed(2)} ${(50 - r * Math.cos(theta)).toFixed(2)}`)
  }
  return `M${points.join('L')}Z`
}

const COOKIE = cookiePath()
</script>

<template>
  <!-- Decorative: the words beside her say what the screen has to. -->
  <div
    class="relative shrink-0"
    :style="{ width: `${width}px`, height: `${height}px` }"
    aria-hidden="true"
  >
    <svg
      class="absolute bottom-0 fill-primary-container"
      viewBox="0 0 100 100"
      :style="{ left: `${BADGE_LEFT * scale}px`, width: `${SIZE}px`, height: `${SIZE}px` }"
    >
      <path :d="COOKIE" />
    </svg>
    <img
      class="absolute inset-0 size-full select-none"
      :src="portraitUrl(mood)"
      alt=""
      :width="width"
      :height="height"
      draggable="false"
    />
  </div>
</template>
