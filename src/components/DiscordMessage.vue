<script setup lang="ts">
import { computed } from 'vue'

import DiscordMention from '@/components/DiscordMention.vue'
import { emojiUrl, parseMessage } from '@/lib/discord'
import { useGuildStore } from '@/stores/guild'

/**
 * Message text with its Discord markup drawn as Discord will: channel and role mentions by
 * their current names, @everyone and @here, and custom emoji. The rest is shown as typed.
 */
const props = defineProps<{ content: string }>()

const guild = useGuildStore()
const tokens = computed(() => parseMessage(props.content))

const role = (id: string) => guild.roles.find((candidate) => candidate.id === id)
const channel = (id: string) => guild.channels.find((candidate) => candidate.id === id)
</script>

<template>
  <template v-for="(token, index) in tokens" :key="index">
    <template v-if="typeof token === 'string'">{{ token }}</template>
    <DiscordMention
      v-else-if="'channelId' in token"
      kind="channel"
      :name="channel(token.channelId)?.name ?? 'unknown'"
    />
    <DiscordMention
      v-else-if="'roleId' in token"
      kind="role"
      :name="role(token.roleId)?.name ?? 'deleted-role'"
      :color="role(token.roleId)?.color"
    />
    <DiscordMention v-else-if="'everyone' in token" kind="user" :name="token.everyone.slice(1)" />
    <img
      v-else
      class="inline-block size-[1.375em] object-contain align-text-bottom"
      :src="emojiUrl(token.emojiId, token.animated)"
      :alt="`:${token.emoji}:`"
      :title="`:${token.emoji}:`"
    />
  </template>
</template>
