<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import AppDialog from '@/components/AppDialog.vue'
import PlanaPortrait from '@/components/PlanaPortrait.vue'
import { useGuildStore } from '@/stores/guild'
import { useSessionStore } from '@/stores/session'

const route = useRoute()
const session = useSessionStore()
const guild = useGuildStore()
const signingOut = ref(false)
const confirmingSignOut = ref(false)

/** Overview greets the administrator with her own line; every other page shows its title. */
const headline = computed(() =>
  route.name === 'overview' && session.user
    ? `Welcome, ${session.user.displayName} Sensei.`
    : route.meta.title,
)

onMounted(() => {
  void guild.load()
})

async function signOut() {
  signingOut.value = true
  try {
    await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' })
  } finally {
    window.location.href = '/login'
  }
}
</script>

<template>
  <!-- M3 top app bar (small): title-large headline, trailing actions. -->
  <header class="flex min-h-20 items-center justify-between gap-6 px-6 py-4">
    <div class="min-w-0">
      <h1 class="truncate text-headline-small">{{ headline }}</h1>
      <p v-if="guild.directory" class="truncate text-body-medium text-on-surface-variant">
        {{ guild.directory.guild.name }} · {{ guild.directory.guild.memberCount }} members
      </p>
    </div>

    <div v-if="session.user" class="flex shrink-0 items-center gap-3">
      <img
        v-if="session.user.avatar"
        class="size-8 shrink-0 rounded-full bg-surface-container-highest object-cover"
        :src="session.user.avatar"
        :alt="session.user.displayName"
        width="32"
        height="32"
      />
      <span class="hidden text-label-large expanded:inline">{{ session.user.displayName }}</span>
      <button class="btn btn-outlined" :disabled="signingOut" @click="confirmingSignOut = true">
        <span class="icon [--icon-size:20px]" aria-hidden="true">logout</span>
        Sign out
      </button>
    </div>

    <AppDialog v-model:open="confirmingSignOut" headline="You mean that?">
      <template #hero><PlanaPortrait mood="hesitant" /></template>
      I'll be standing by until you return, Sensei.
      <template #actions>
        <button class="btn btn-text" type="button" @click="confirmingSignOut = false">Stay</button>
        <button class="btn btn-text" type="button" :disabled="signingOut" @click="signOut">
          Sign out
        </button>
      </template>
    </AppDialog>
  </header>
</template>
