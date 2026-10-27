<script setup lang="ts">
import DiscordMessage from '@/components/DiscordMessage.vue'
import { blockKey, colorToHex, isEditable, type AnyBlock } from '@/lib/components-builder'
import { ComponentKind, type LinkButton } from '@/lib/components-v2'

/**
 * A Components V2 layout drawn roughly as Discord draws it. Takes parts still being filled
 * in, so an empty text or a missing image shows as a placeholder rather than breaking.
 */
defineProps<{ components: AnyBlock[] }>()

const isButton = (value: { type: number }): value is LinkButton =>
  value.type === ComponentKind.Button
</script>

<template>
  <div class="flex flex-col gap-2">
    <template v-for="block in components" :key="blockKey(block)">
      <p v-if="!isEditable(block)" class="text-body-medium text-on-surface-variant">
        A part the preview can't draw.
      </p>

      <div
        v-else-if="block.type === ComponentKind.TextDisplay"
        :class="block.content ? 'text-on-surface' : 'text-on-surface-variant'"
      >
        <DiscordMessage v-if="block.content" :content="block.content" />
        <template v-else>Empty text</template>
      </div>

      <div v-else-if="block.type === ComponentKind.Section" class="flex items-start gap-3">
        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <DiscordMessage
            v-for="(item, index) in block.components"
            :key="index"
            class="text-on-surface"
            :content="item.content"
          />
        </div>
        <a
          v-if="isButton(block.accessory)"
          class="inline-flex h-8 shrink-0 items-center gap-1 rounded-xs bg-surface-container-highest px-3 text-label-large text-on-surface"
          :href="block.accessory.url || undefined"
          target="_blank"
          rel="noopener"
        >
          {{ block.accessory.label || 'Link' }}
          <span class="icon [--icon-size:16px]" aria-hidden="true">open_in_new</span>
        </a>
        <img
          v-else-if="block.accessory.media.url"
          class="size-20 shrink-0 rounded-sm object-cover"
          :class="{ 'blur-md': block.accessory.spoiler }"
          :src="block.accessory.media.url"
          :alt="block.accessory.description ?? ''"
        />
        <span
          v-else
          class="grid size-20 shrink-0 place-items-center rounded-sm bg-surface-container-highest text-on-surface-variant"
        >
          <span class="icon" aria-hidden="true">image</span>
        </span>
      </div>

      <div
        v-else-if="block.type === ComponentKind.MediaGallery"
        class="grid gap-1 overflow-hidden rounded-sm"
        :class="block.items.length === 1 ? 'grid-cols-1' : 'grid-cols-2'"
      >
        <template v-for="(item, index) in block.items" :key="index">
          <img
            v-if="item.media.url"
            class="aspect-video w-full bg-surface-container-highest object-cover"
            :class="{ 'blur-md': item.spoiler }"
            :src="item.media.url"
            :alt="item.description ?? ''"
          />
          <span
            v-else
            class="grid aspect-video place-items-center bg-surface-container-highest text-on-surface-variant"
          >
            <span class="icon" aria-hidden="true">image</span>
          </span>
        </template>
      </div>

      <div
        v-else-if="block.type === ComponentKind.Separator"
        :class="block.spacing === 2 ? 'py-3' : 'py-1'"
        aria-hidden="true"
      >
        <hr v-if="block.divider !== false" class="border-outline-variant" />
      </div>

      <div v-else-if="block.type === ComponentKind.ActionRow" class="flex flex-wrap gap-2">
        <a
          v-for="(button, index) in block.components"
          :key="index"
          class="inline-flex h-8 items-center gap-1 rounded-xs bg-surface-container-highest px-3 text-label-large text-on-surface"
          :href="button.url || undefined"
          target="_blank"
          rel="noopener"
        >
          {{ button.label || 'Link' }}
          <span class="icon [--icon-size:16px]" aria-hidden="true">open_in_new</span>
        </a>
      </div>

      <div
        v-else-if="block.type === ComponentKind.Container"
        class="rounded-sm border-l-4 bg-surface-container-high p-4"
        :style="{
          borderLeftColor:
            block.accent_color != null ? colorToHex(block.accent_color) : 'transparent',
        }"
      >
        <ComponentsPreview :components="block.components" />
      </div>
    </template>
  </div>
</template>
