<script setup lang="ts">
import { RouterLink } from 'vue-router'

type NavItem = { to: string; label: string; icon: string }

// Single-path icons keep the sidebar dependency-free.
const items: NavItem[] = [
  {
    to: '/',
    label: 'Overview',
    icon: 'M3 12h7V3H3v9Zm0 9h7v-7H3v7Zm11 0h7V12h-7v9Zm0-18v7h7V3h-7Z',
  },
  {
    to: '/queue',
    label: 'Triage queue',
    icon: 'M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-8 2a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm0 2c-2.7 0-6 1.3-6 4v2h7v-2a5 5 0 0 1 1.6-3.5A10 10 0 0 0 8 15Zm8 0c-3 0-7 1.5-7 4.5V21h14v-1.5c0-3-4-4.5-7-4.5Z',
  },
  {
    to: '/broadcast',
    label: 'Broadcast',
    icon: 'M3 10v4h4l5 5V5L7 10H3Zm13.5 2a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4Zm-2.5-8v2a6 6 0 0 1 0 12v2a8 8 0 0 0 0-16Z',
  },
  {
    to: '/audit',
    label: 'Audit log',
    icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm2 16H8v-2h8v2Zm0-4H8v-2h8v2Zm-3-5V3.5L18.5 9H13Z',
  },
  {
    to: '/settings',
    label: 'Settings',
    icon: 'M12 15.5A3.5 3.5 0 1 1 15.5 12 3.5 3.5 0 0 1 12 15.5Zm7.4-2.6a7.6 7.6 0 0 0 0-1.8l2-1.6a.5.5 0 0 0 .1-.6l-1.9-3.2a.5.5 0 0 0-.6-.2l-2.3.9a7.3 7.3 0 0 0-1.6-.9l-.4-2.4a.5.5 0 0 0-.5-.4h-3.8a.5.5 0 0 0-.5.4l-.4 2.4a7.3 7.3 0 0 0-1.6.9l-2.3-.9a.5.5 0 0 0-.6.2L2.6 8.9a.5.5 0 0 0 .1.6l2 1.6a7.6 7.6 0 0 0 0 1.8l-2 1.6a.5.5 0 0 0-.1.6l1.9 3.2a.5.5 0 0 0 .6.2l2.3-.9a7.3 7.3 0 0 0 1.6.9l.4 2.4a.5.5 0 0 0 .5.4h3.8a.5.5 0 0 0 .5-.4l.4-2.4a7.3 7.3 0 0 0 1.6-.9l2.3.9a.5.5 0 0 0 .6-.2l1.9-3.2a.5.5 0 0 0-.1-.6l-2-1.6Z',
  },
]
</script>

<template>
  <aside
    class="flex flex-row items-center gap-3 overflow-x-auto border-b border-line bg-surface px-3.5 py-3 md:flex-col md:items-stretch md:gap-[22px] md:overflow-x-visible md:border-r md:border-b-0 md:py-5"
  >
    <div class="flex shrink-0 items-center gap-2.5 px-2">
      <span
        class="grid h-[30px] w-[30px] place-items-center rounded-lg bg-accent font-bold text-white"
        aria-hidden="true"
        >P</span
      >
      <span class="hidden text-base font-semibold tracking-tight md:inline">Plana</span>
    </div>

    <nav class="flex flex-row gap-0.5 md:flex-col">
      <RouterLink
        v-for="item in items"
        :key="item.to"
        :to="item.to"
        class="flex shrink-0 items-center gap-[11px] rounded-md px-2.5 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-elevated hover:text-ink [&.router-link-exact-active]:bg-accent/15 [&.router-link-exact-active]:text-accent-ink"
      >
        <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
          <path :d="item.icon" fill="currentColor" />
        </svg>
        {{ item.label }}
      </RouterLink>
    </nav>
  </aside>
</template>
