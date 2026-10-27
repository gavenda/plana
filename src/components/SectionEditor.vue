<script setup lang="ts">
import { computed } from 'vue'

import AppTextArea from '@/components/AppTextArea.vue'
import AppTextField from '@/components/AppTextField.vue'
import FilterChip from '@/components/FilterChip.vue'
import SegmentedButtons from '@/components/SegmentedButtons.vue'
import { newLinkButton, newThumbnail } from '@/lib/components-builder'
import { ComponentKind, type LinkButton, type Section, type Thumbnail } from '@/lib/components-v2'

/** A section: up to three texts, with a thumbnail or a link button beside them. */
const model = defineModel<Section>({ required: true })

const thumbnail = computed(() =>
  model.value.accessory.type === ComponentKind.Thumbnail
    ? (model.value.accessory as Thumbnail)
    : null,
)
const button = computed(() =>
  model.value.accessory.type === ComponentKind.Button
    ? (model.value.accessory as LinkButton)
    : null,
)

const accessory = computed({
  get: () => (button.value ? 'button' : 'thumbnail'),
  set: (value: 'button' | 'thumbnail') => {
    model.value.accessory = value === 'button' ? newLinkButton() : newThumbnail()
  },
})

function setSpoiler(value: boolean) {
  if (thumbnail.value) thumbnail.value.spoiler = value
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div v-for="(item, index) in model.components" :key="index" class="flex items-start gap-2">
      <div class="min-w-0 flex-1">
        <AppTextArea v-model="item.content" :label="`Text ${index + 1}`" />
      </div>
      <button
        v-if="model.components.length > 1"
        type="button"
        class="icon-btn mt-2"
        aria-label="Remove text"
        @click="model.components.splice(index, 1)"
      >
        <span class="icon [--icon-size:20px]" aria-hidden="true">close</span>
      </button>
    </div>
    <button
      v-if="model.components.length < 3"
      type="button"
      class="btn btn-text btn-sm self-start"
      @click="model.components.push({ type: ComponentKind.TextDisplay, content: '' })"
    >
      <span class="icon [--icon-size:18px]" aria-hidden="true">add</span>
      Add text
    </button>

    <SegmentedButtons
      v-model="accessory"
      label="Beside the text"
      :options="[
        { value: 'thumbnail', label: 'Thumbnail', icon: 'image' },
        { value: 'button', label: 'Link button', icon: 'link' },
      ]"
    />

    <template v-if="thumbnail">
      <AppTextField v-model="thumbnail.media.url" input-type="url" label="Image URL" />
      <AppTextField v-model="thumbnail.description" label="Alt text" :maxlength="1024" />
      <FilterChip
        class="self-start"
        label="Spoiler"
        :model-value="!!thumbnail.spoiler"
        @update:model-value="setSpoiler"
      />
    </template>
    <div v-if="button" class="grid grid-cols-1 gap-4 medium:grid-cols-2">
      <AppTextField v-model="button.label" label="Button label" :maxlength="80" />
      <AppTextField v-model="button.url" input-type="url" label="Link" />
    </div>
  </div>
</template>
