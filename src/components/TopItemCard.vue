<script setup lang="ts">
import { Card } from 'tailwind-material3'

/**
 * The summary row's lead: the period's top game or track, with its art, ahead of the plain
 * number tiles.
 */
defineProps<{
  /** What it is the top of, such as "Top game". */
  label: string
  title: string | null
  supporting: string | null
  image: string | null
  /** Shown when there's no image. */
  icon: string
  loading: boolean
}>()
</script>

<template>
  <Card :padded="false" class="flex items-center gap-4 bg-surface-container! px-5 py-4">
    <span v-if="loading" class="skeleton size-16 shrink-0 rounded-medium" />
    <img
      v-else-if="image"
      class="size-16 shrink-0 rounded-medium bg-surface-container-highest object-cover"
      :src="image"
      alt=""
      width="64"
      height="64"
    />
    <span
      v-else
      class="grid size-16 shrink-0 place-items-center rounded-medium bg-surface-container-highest text-on-surface-variant"
      aria-hidden="true"
      ><span class="icon [--icon-size:28px]">{{ icon }}</span></span
    >
    <span class="flex min-w-0 flex-col">
      <span class="text-label-large opacity-80">{{ label }}</span>
      <span v-if="loading" class="skeleton mt-1 h-6 w-32" />
      <span v-else class="truncate text-title-large" :title="title ?? undefined">{{
        title ?? '—'
      }}</span>
      <span
        v-if="!loading && supporting"
        class="truncate text-body-medium text-on-surface-variant"
        >{{ supporting }}</span
      >
    </span>
  </Card>
</template>
