<script setup lang="ts">
/** Her halo: the loading indicator. It always means "Plana is working", never decoration. */
withDefaults(defineProps<{ size?: number }>(), { size: 32 })
</script>

<template>
  <svg
    class="shrink-0 text-tertiary"
    viewBox="0 0 32 32"
    :width="size"
    :height="size"
    role="progressbar"
    aria-label="Processing"
  >
    <g transform="rotate(-18 16 16)" fill="none" stroke-width="2.5" stroke-linecap="round">
      <ellipse cx="16" cy="16" rx="13" ry="6" stroke="currentColor" />
      <!-- A brighter band travels round the ring; with reduced motion it is left out. -->
      <ellipse
        cx="16"
        cy="16"
        rx="13"
        ry="6"
        pathLength="100"
        stroke-dasharray="22 78"
        class="animate-halo-sweep stroke-on-tertiary-container motion-reduce:hidden"
      />
    </g>
  </svg>
</template>
