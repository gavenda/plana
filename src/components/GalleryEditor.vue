<script setup lang="ts">
import AppTextField from '@/components/AppTextField.vue'
import FilterChip from '@/components/FilterChip.vue'
import type { MediaGallery } from '@/lib/components-v2'

/** A media gallery: up to ten images by URL. */
const model = defineModel<MediaGallery>({ required: true })
</script>

<template>
  <div class="flex flex-col gap-4">
    <div
      v-for="(item, index) in model.items"
      :key="index"
      class="flex flex-col gap-3 border-l-2 border-outline-variant pl-4"
    >
      <div class="flex items-start gap-2">
        <div class="min-w-0 flex-1">
          <AppTextField
            v-model="item.media.url"
            input-type="url"
            :label="`Image ${index + 1} URL`"
          />
        </div>
        <button
          v-if="model.items.length > 1"
          type="button"
          class="icon-btn mt-2"
          aria-label="Remove image"
          @click="model.items.splice(index, 1)"
        >
          <span class="icon [--icon-size:20px]" aria-hidden="true">close</span>
        </button>
      </div>
      <AppTextField v-model="item.description" label="Alt text" :maxlength="1024" />
      <FilterChip
        class="self-start"
        label="Spoiler"
        :model-value="!!item.spoiler"
        @update:model-value="item.spoiler = $event"
      />
    </div>
    <button
      v-if="model.items.length < 10"
      type="button"
      class="btn btn-text btn-sm self-start"
      @click="model.items.push({ media: { url: '' }, description: '' })"
    >
      <span class="icon [--icon-size:18px]" aria-hidden="true">add</span>
      Add image
    </button>
  </div>
</template>
