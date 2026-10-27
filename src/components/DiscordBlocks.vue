<script setup lang="ts">
import DiscordInline from '@/components/DiscordInline.vue'
import type { Block } from '@/lib/discord-markdown'

/** Block-level Discord markdown: paragraphs, headings, subtext, quotes, lists and code blocks. */
defineProps<{ blocks: Block[] }>()

const HEADING_CLASS = {
  1: 'text-headline-small font-bold',
  2: 'text-title-large font-bold',
  3: 'text-title-medium font-bold',
} as const
</script>

<template>
  <template v-for="(block, index) in blocks" :key="index">
    <p v-if="block.kind === 'paragraph'" class="whitespace-pre-wrap">
      <DiscordInline :nodes="block.children" />
    </p>
    <p
      v-else-if="block.kind === 'heading'"
      class="mt-2 first:mt-0"
      :class="HEADING_CLASS[block.level]"
    >
      <DiscordInline :nodes="block.children" />
    </p>
    <p v-else-if="block.kind === 'subtext'" class="text-body-small text-on-surface-variant">
      <DiscordInline :nodes="block.children" />
    </p>
    <blockquote v-else-if="block.kind === 'quote'" class="border-l-4 border-outline-variant pl-3">
      <DiscordBlocks :blocks="block.children" />
    </blockquote>
    <pre
      v-else-if="block.kind === 'code'"
      class="overflow-x-auto rounded-sm border border-outline-variant bg-surface-container-highest p-2 text-[0.85em] whitespace-pre-wrap"
    ><code>{{ block.text }}</code></pre>
    <component
      :is="block.ordered ? 'ol' : 'ul'"
      v-else-if="block.kind === 'list'"
      class="pl-6"
      :class="block.ordered ? 'list-decimal' : 'list-disc'"
      :start="block.ordered ? block.start : undefined"
    >
      <li v-for="(item, itemIndex) in block.items" :key="itemIndex">
        <DiscordInline :nodes="item.children" />
        <DiscordBlocks v-if="item.sublist" :blocks="[item.sublist]" />
      </li>
    </component>
  </template>
</template>
