<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import RichTooltip from '@/components/RichTooltip.vue'
import StateBlock from '@/components/StateBlock.vue'
import { apiFetch } from '@/lib/api'
import { absoluteTime, clockTime, dayLabel, relativeTime } from '@/lib/format'
import { useLive } from '@/lib/live'
import { useSnackbar } from '@/lib/snackbar'
import { useAsync } from '@/lib/useAsync'

/** Matches BackupOverview in src/server/backup.ts. */
type BackupOverview = {
  status: 'disabled' | 'pending' | 'ok' | 'failing'
  running: boolean
  bucket: string | null
  jurisdiction: string | null
  intervalHours: number
  /** 0 when old backups are left to an R2 lifecycle rule. */
  retentionDays: number
  lastSuccessAt: number | null
  lastFailureAt: number | null
  lastError: string | null
  nextDueAt: number | null
  backups: { key: string; time: number; size: number }[]
  total: number
  listError: string | null
}

const snackbar = useSnackbar()
const { data, loading, error, run } = useAsync(() => apiFetch<BackupOverview>('/api/backup'))
const starting = ref(false)

onMounted(run)
// A backup starting or finishing anywhere (the schedule, another admin) reloads this.
useLive('backup', () => void run())

const running = computed(() => starting.value || data.value?.running === true)

/** The chip beside the heading. */
const badge = computed(() => {
  const overview = data.value
  if (!overview) return null
  if (running.value) return { icon: 'cloud_sync', label: 'Backing up…', tone: 'text-primary' }
  switch (overview.status) {
    case 'ok':
      return { icon: 'cloud_done', label: 'Up to date', tone: 'text-success' }
    case 'failing':
      return { icon: 'error', label: 'Failing', tone: 'text-error' }
    case 'pending':
      return { icon: 'cloud_sync', label: 'No backup yet', tone: 'text-warning' }
    default:
      return { icon: 'cloud_off', label: 'Off', tone: 'text-on-surface-variant' }
  }
})

function hours(count: number): string {
  return count === 1 ? 'hour' : `${count.toLocaleString('en')} hours`
}

function days(count: number): string {
  return count === 1 ? '1 day' : `${count.toLocaleString('en')} days`
}

function size(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`
}

const facts = computed(() => {
  const overview = data.value
  if (!overview || overview.status === 'disabled') return []

  const due = overview.nextDueAt
  const next = running.value
    ? 'Running now'
    : due === null
      ? '—'
      : due <= Date.now()
        ? 'Within 15 minutes'
        : relativeTime(due)

  return [
    {
      label: 'Last backup',
      value: overview.lastSuccessAt ? relativeTime(overview.lastSuccessAt) : 'None yet',
      title: overview.lastSuccessAt ? absoluteTime(overview.lastSuccessAt) : undefined,
    },
    { label: 'Next backup', value: next, title: due ? absoluteTime(due) : undefined },
    { label: 'Schedule', value: `Every ${hours(overview.intervalHours)}` },
    {
      label: 'Old backups',
      value:
        overview.retentionDays > 0
          ? `Deleted after ${days(overview.retentionDays)}`
          : 'R2 lifecycle rule',
      title:
        overview.retentionDays > 0
          ? 'The bot deletes older backups after each upload, always keeping the newest.'
          : 'The bot never deletes backups; a lifecycle rule on the bucket expires them.',
    },
    {
      label: 'Bucket',
      value: overview.jurisdiction
        ? `${overview.bucket} (${overview.jurisdiction.toUpperCase()})`
        : (overview.bucket ?? '—'),
    },
    {
      label: 'Stored',
      value: overview.listError
        ? 'Unknown'
        : `${overview.total} ${overview.total === 1 ? 'backup' : 'backups'}`,
    },
  ]
})

/**
 * The setup walkthrough shown while backups are off, in step with .env.example. The text is
 * fixed here, never from the server, so rendering it as HTML is safe.
 */
const SETUP_STEPS: { title: string; html: string; env?: boolean }[] = [
  {
    title: 'Create a bucket',
    html:
      'In Cloudflare, go to <b>R2 → Create bucket</b> and name it, for example ' +
      '<code>plana-backups</code>. Leave it private. If you choose a jurisdiction under ' +
      '<b>Location</b> (EU or FedRAMP), note it for step 4.',
  },
  {
    title: 'Create an API token',
    html:
      'Go to <b>R2 → Manage API tokens → Create API token</b>. Give it ' +
      '<b>Object Read &amp; Write</b> permission, limited to that bucket. Copy the ' +
      '<b>Access Key ID</b> and <b>Secret Access Key</b>. Your ' +
      '<b>Account ID</b> is on the R2 overview page.',
  },
  {
    title: 'Expire old backups',
    html:
      'Open the bucket, then <b>Settings → Object lifecycle rules</b>, and add a rule that ' +
      'deletes objects with the prefix <code>plana/</code> after, say, 3 days. Without it, ' +
      'backups are kept forever. Alternatively, set <code>BACKUP_RETENTION_DAYS</code> and Plana ' +
      'deletes them herself.',
  },
  {
    title: 'Add settings',
    html:
      'Put these in her env file (<code>.env</code> with Compose, or ' +
      '<code>~/.config/plana/plana.env</code> with Quadlet). Set all four R2 values or none. ' +
      'Leave <code>R2_JURISDICTION</code> blank unless the bucket has one.',
    env: true,
  },
  {
    title: 'Restart Plana',
    html:
      'She takes the first backup within a few minutes of starting, and this section then shows ' +
      'it. To test the settings first, run <code>bun run backup</code>.',
  },
]

const ENV_TEMPLATE = [
  'R2_ACCOUNT_ID=',
  'R2_ACCESS_KEY_ID=',
  'R2_SECRET_ACCESS_KEY=',
  'R2_BUCKET=plana-backups',
  'R2_JURISDICTION=',
  'BACKUP_RETENTION_DAYS=off',
  'BACKUP_INTERVAL_HOURS=24',
].join('\n')

async function copyEnv() {
  try {
    await navigator.clipboard.writeText(ENV_TEMPLATE)
    snackbar.show('Copied.')
  } catch (cause) {
    snackbar.showError(cause, 'Could not copy. Select the text instead.')
  }
}

async function backUpNow() {
  starting.value = true
  try {
    data.value = await apiFetch<BackupOverview>('/api/backup', { method: 'POST' })
    snackbar.show('Backup saved to R2.')
  } catch (cause) {
    snackbar.showError(cause, 'The backup failed.')
    void run()
  } finally {
    starting.value = false
  }
}
</script>

<template>
  <section aria-labelledby="settings-backups">
    <div class="section-header">
      <div class="flex items-center gap-1">
        <h2 id="settings-backups" class="text-title-medium">Backups</h2>
        <RichTooltip
          title="Backups"
          text="Copies of Plana's database in a Cloudflare R2 bucket: settings, birthdays, the audit log and activity history. Restoring one is done by hand, with Plana stopped."
        />
      </div>
      <span v-if="!data && !error" class="skeleton mr-4 h-3.5 w-24" aria-hidden="true" />
      <span
        v-else-if="badge"
        class="inline-flex items-center gap-1.5 pr-4 text-label-large"
        :class="badge.tone"
      >
        <span class="icon [--icon-size:18px] icon-filled" aria-hidden="true">{{ badge.icon }}</span>
        {{ badge.label }}
      </span>
    </div>

    <div class="card card-body">
      <StateBlock :loading="!data && loading" :error="data ? null : error" :retry="run">
        <template #skeleton>
          <div class="grid grid-cols-2 gap-6 expanded:grid-cols-3">
            <span v-for="fact in 6" :key="fact" class="skeleton h-10 rounded-xs" />
          </div>
        </template>

        <template v-if="data">
          <div v-if="data.status === 'disabled'" class="flex flex-col gap-6 text-body-medium">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="text-on-surface-variant">
                Off-site backups are off. Turning them on takes about five minutes in Cloudflare.
              </p>
              <a
                class="btn btn-text"
                href="https://dash.cloudflare.com/?to=/:account/r2"
                target="_blank"
                rel="noopener noreferrer"
                ><span class="icon [--icon-size:20px]" aria-hidden="true">open_in_new</span>Open R2
                in Cloudflare</a
              >
            </div>

            <ol class="flex flex-col gap-5">
              <li v-for="(step, index) in SETUP_STEPS" :key="step.title" class="flex gap-4">
                <span
                  class="grid size-7 shrink-0 place-items-center rounded-full bg-secondary-container text-label-large text-on-secondary-container"
                  aria-hidden="true"
                  >{{ index + 1 }}</span
                >
                <div class="flex min-w-0 flex-1 flex-col gap-1 pt-0.5">
                  <p class="text-title-small">{{ step.title }}</p>
                  <p class="text-on-surface-variant" v-html="step.html" />

                  <!-- The env block, with the step that needs it. -->
                  <div v-if="step.env" class="mt-2 flex flex-col gap-1">
                    <div class="flex items-start gap-2">
                      <pre
                        class="min-w-0 flex-1 overflow-x-auto rounded-sm bg-surface-container-highest px-4 py-3 font-mono text-body-small"
                        >{{ ENV_TEMPLATE }}</pre>
                      <button
                        class="icon-btn icon-btn-tonal icon-btn-narrow"
                        type="button"
                        aria-label="Copy settings"
                        title="Copy settings"
                        @click="copyEnv"
                      >
                        <span class="icon [--icon-size:20px]" aria-hidden="true">content_copy</span>
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            </ol>
          </div>

          <div v-else class="flex flex-col gap-6">
            <p
              v-if="data.status === 'failing' && !running"
              class="card card-error px-4 py-3 text-body-medium"
            >
              The last attempt failed {{ relativeTime(data.lastFailureAt) }}:
              {{ data.lastError ?? 'unknown error' }}.
              <template v-if="data.nextDueAt"
                >Plana tries again {{ relativeTime(data.nextDueAt) }}.</template
              >
            </p>
            <p v-if="data.listError" class="card card-warn px-4 py-3 text-body-medium">
              Could not list the bucket: {{ data.listError }}
            </p>

            <dl class="grid grid-cols-2 gap-x-6 gap-y-5 expanded:grid-cols-3">
              <div v-for="fact in facts" :key="fact.label" class="flex min-w-0 flex-col gap-1">
                <dt class="text-label-medium text-on-surface-variant">{{ fact.label }}</dt>
                <dd class="truncate text-body-large" :title="fact.title">{{ fact.value }}</dd>
              </div>
            </dl>

            <div v-if="data.backups.length > 0" class="flex flex-col">
              <h3 class="segmented-header px-0">Newest backups</h3>
              <ul class="segmented-list">
                <li
                  v-for="backup in data.backups"
                  :key="backup.key"
                  class="segmented-item bg-surface-container-high"
                >
                  <span class="icon text-on-surface-variant" aria-hidden="true">backup</span>
                  <div class="flex min-w-0 flex-1 flex-col">
                    <span class="truncate text-body-large" :title="absoluteTime(backup.time)">
                      {{ dayLabel(backup.time) }}, {{ clockTime(backup.time) }}
                    </span>
                    <code class="truncate text-body-small text-on-surface-variant">{{
                      backup.key
                    }}</code>
                  </div>
                  <span class="text-label-large text-on-surface-variant">{{
                    size(backup.size)
                  }}</span>
                </li>
              </ul>
              <p v-if="data.total > data.backups.length" class="supporting-text px-0 pt-2">
                And {{ data.total - data.backups.length }} older in the bucket.
              </p>
            </div>

            <div class="flex justify-end">
              <button
                class="btn btn-tonal btn-wide"
                type="button"
                :disabled="running"
                @click="backUpNow"
              >
                <span class="icon [--icon-size:20px]" aria-hidden="true">backup</span>
                {{ running ? 'Backing up…' : 'Back up now' }}
              </button>
            </div>
          </div>
        </template>
      </StateBlock>
    </div>
  </section>
</template>
