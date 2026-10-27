<script setup lang="ts">
import { computed } from 'vue'

import AppTextArea from '@/components/AppTextArea.vue'
import ButtonRowEditor from '@/components/ButtonRowEditor.vue'
import ComponentList from '@/components/ComponentList.vue'
import FilterChip from '@/components/FilterChip.vue'
import GalleryEditor from '@/components/GalleryEditor.vue'
import SectionEditor from '@/components/SectionEditor.vue'
import SegmentedButtons from '@/components/SegmentedButtons.vue'
import { colorToHex, hexToColor, isEditable, type AnyBlock } from '@/lib/components-builder'
import { ComponentKind, MAX_TEXT_LENGTH, type ContainerChild } from '@/lib/components-v2'

/** The fields of one part of a Components V2 layout, edited in place. */
const model = defineModel<AnyBlock>({ required: true })

// One view per kind, so each branch of the template sees its own fields.
const of = <T extends AnyBlock['type']>(type: T) =>
  computed(() =>
    model.value.type === type && isEditable(model.value)
      ? (model.value as Extract<AnyBlock, { type: T }>)
      : null,
  )

const text = of(ComponentKind.TextDisplay)
const section = of(ComponentKind.Section)
const gallery = of(ComponentKind.MediaGallery)
const separator = of(ComponentKind.Separator)
const row = of(ComponentKind.ActionRow)
const container = of(ComponentKind.Container)

const spacing = computed({
  get: () => (separator.value?.spacing === 2 ? 'large' : 'small'),
  set: (value: 'small' | 'large') => {
    if (separator.value) separator.value.spacing = value === 'large' ? 2 : 1
  },
})

const accent = computed({
  get: () => container.value?.accent_color != null,
  set: (on: boolean) => {
    if (container.value) container.value.accent_color = on ? 0x5865f2 : null
  },
})

const children = computed({
  get: () => container.value?.components ?? [],
  set: (value: ContainerChild[]) => {
    if (container.value) container.value.components = value
  },
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <AppTextArea
      v-if="text"
      v-model="text.content"
      label="Text"
      :maxlength="MAX_TEXT_LENGTH"
      supporting-text="Discord markdown is supported."
    />

    <SectionEditor v-else-if="section" v-model="section" />

    <GalleryEditor v-else-if="gallery" v-model="gallery" />

    <div v-else-if="separator" class="flex flex-wrap items-center gap-3">
      <FilterChip
        label="Divider line"
        :model-value="separator.divider !== false"
        @update:model-value="separator.divider = $event"
      />
      <SegmentedButtons
        v-model="spacing"
        label="Spacing"
        :options="[
          { value: 'small', label: 'Small' },
          { value: 'large', label: 'Large' },
        ]"
      />
    </div>

    <ButtonRowEditor v-else-if="row" v-model="row" />

    <template v-else-if="container">
      <div class="flex flex-wrap items-center gap-3">
        <FilterChip v-model="accent" label="Accent colour" />
        <label v-if="accent" class="flex items-center gap-2 text-body-medium">
          <input
            type="color"
            class="size-8 cursor-pointer rounded-xs border-0 bg-transparent p-0"
            :value="colorToHex(container.accent_color)"
            @input="container.accent_color = hexToColor(($event.target as HTMLInputElement).value)"
          />
          <span class="font-mono">{{ colorToHex(container.accent_color) }}</span>
        </label>
        <FilterChip
          label="Spoiler"
          :model-value="!!container.spoiler"
          @update:model-value="container.spoiler = $event"
        />
      </div>
      <ComponentList v-model="children" nested />
    </template>

    <p v-else class="supporting-text">This part can only be edited as JSON.</p>
  </div>
</template>
