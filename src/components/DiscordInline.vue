<script setup lang="ts">
import { reactive } from 'vue'

import DiscordMention from '@/components/DiscordMention.vue'
import { emojiUrl } from '@/lib/discord'
import type { Inline } from '@/lib/discord-markdown'
import { useGuildStore } from '@/stores/guild'

/** Inline Discord markdown, drawn as Discord does. Spoilers open on click, as there. */
defineProps<{ nodes: Inline[] }>()

const guild = useGuildStore()
const revealed = reactive(new Set<Inline>())

const role = (id: string) => guild.roles.find((candidate) => candidate.id === id)
const channel = (id: string) => guild.channels.find((candidate) => candidate.id === id)
</script>

<template>
  <template v-for="(node, index) in nodes" :key="index">
    <template v-if="typeof node === 'string'">{{ node }}</template>
    <strong v-else-if="node.kind === 'bold'" class="font-bold"
      ><DiscordInline :nodes="node.children"
    /></strong>
    <em v-else-if="node.kind === 'italic'" class="italic"
      ><DiscordInline :nodes="node.children"
    /></em>
    <span v-else-if="node.kind === 'underline'" class="underline"
      ><DiscordInline :nodes="node.children"
    /></span>
    <s v-else-if="node.kind === 'strike'"><DiscordInline :nodes="node.children" /></s>
    <span
      v-else-if="node.kind === 'spoiler'"
      class="cursor-pointer rounded-xs px-0.5 transition-colors"
      :class="
        revealed.has(node)
          ? 'bg-on-surface/12'
          : 'bg-on-surface-variant text-transparent [&_*]:invisible'
      "
      :title="revealed.has(node) ? undefined : 'Spoiler — click to show'"
      @click="revealed.add(node)"
      ><DiscordInline :nodes="node.children"
    /></span>
    <code
      v-else-if="node.kind === 'code'"
      class="rounded-xs bg-surface-container-highest px-1 py-0.5 text-[0.85em]"
      >{{ node.text }}</code
    >
    <a
      v-else-if="node.kind === 'link'"
      class="text-primary hover:underline"
      :href="node.url"
      target="_blank"
      rel="noopener noreferrer"
      ><DiscordInline :nodes="node.children"
    /></a>
    <DiscordMention
      v-else-if="node.kind === 'channel'"
      kind="channel"
      :name="channel(node.id)?.name ?? 'unknown'"
    />
    <DiscordMention
      v-else-if="node.kind === 'role'"
      kind="role"
      :name="role(node.id)?.name ?? 'deleted-role'"
      :color="role(node.id)?.color"
    />
    <DiscordMention v-else-if="node.kind === 'everyone'" kind="user" :name="node.text.slice(1)" />
    <img
      v-else-if="node.kind === 'emoji'"
      class="inline-block size-[1.375em] object-contain align-text-bottom"
      :src="emojiUrl(node.id, node.animated)"
      :alt="`:${node.name}:`"
      :title="`:${node.name}:`"
    />
  </template>
</template>
