<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  Button,
  Card,
  Dialog,
  IconButton,
  LinearProgressIndicator,
  List,
  Slider,
  ListItem,
} from 'tailwind-material3'

import AppSearchBar from '@/components/AppSearchBar.vue'
import ChannelChip from '@/components/ChannelChip.vue'
import ChoiceGroup from '@/components/ChoiceGroup.vue'
import DiscordMention from '@/components/DiscordMention.vue'
import MusicStats from '@/components/MusicStats.vue'
import PlanaPortrait from '@/components/PlanaPortrait.vue'
import SkeletonList from '@/components/SkeletonList.vue'
import StateBlock from '@/components/StateBlock.vue'
import VolumeButton from '@/components/VolumeButton.vue'
import { ApiError, apiFetch } from '@/lib/api'
import { useLive } from '@/lib/live'
import {
  formatDuration,
  isLink,
  QUEUE_PLACES,
  type MusicChannels,
  type MusicPlayed,
  type MusicProgress,
  type MusicQueueType,
  type MusicRepeat,
  type MusicSearch,
  type MusicSearchTrack,
  type MusicSource,
  type MusicTrack,
  type MusicView,
} from '@/lib/music'
import { groupOptions, type SelectOption } from '@/lib/select'
import { useSnackbar } from '@/lib/snackbar'
import { useAsync } from '@/lib/useAsync'
import { useBotStore } from '@/stores/bot'
import { useSessionStore } from '@/stores/session'

const bot = useBotStore()
const session = useSessionStore()
const snackbar = useSnackbar()
/** The player shows only with VIVY_CONTROL on; the stats below it show either way. */
const player = computed(() => bot.music)
/** Viewers (the stats role) see what's playing; staff control it. */
const canControl = computed(() => !session.isViewer)

// ---------------------------------------------------------------------------
// Now playing and the queue, kept live by the `music` topic
// ---------------------------------------------------------------------------

const music = useAsync(() => apiFetch<MusicView>('/api/music/state'))
const view = ref<MusicView | null>(null)
/** When the shown view arrived, by this browser's clock: the server sends the position as of then. */
const receivedAt = ref(0)

function showView(next: MusicView) {
  view.value = next
  receivedAt.value = Date.now()
}

watch(music.data, (value) => value && showView(value))

useLive('music', (message) => {
  if (!player.value) return
  if (!message) void music.run()
  else if ('progress' in message) showProgress(message.progress)
  else showView({ online: message.online, state: message.state })
})

/** Vivy's position report, correcting the one counted forward since the last view. */
function showProgress(progress: MusicProgress) {
  const shown = view.value
  if (!shown?.state?.current) return
  view.value = { ...shown, state: { ...shown.state, ...progress } }
  receivedAt.value = Date.now()
}

const REPEAT_LABELS = { off: null, track: 'Repeating the track', queue: 'Repeating the queue' }
/** What the repeat button moves to: off, the queue, the track, and off again. */
const NEXT_REPEAT: Record<MusicRepeat, MusicRepeat> = { off: 'queue', queue: 'track', track: 'off' }

const loading = computed(() => view.value == null && music.error.value == null)
const online = computed(() => view.value?.online ?? false)
const state = computed(() => view.value?.state ?? null)
const current = computed(() => state.value?.current ?? null)
const queue = computed(() => state.value?.queue ?? [])
const playing = computed(() => current.value != null && !state.value?.paused)

/** Ticks while a track plays, so the position moves between Vivy's updates. */
const now = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  if (!player.value) return
  void music.run()
  if (canControl.value) void channels.run()
  ticker = setInterval(() => (now.value = Date.now()), 1000)
})
onBeforeUnmount(() => clearInterval(ticker))

const positionMs = computed(() => {
  const value = state.value
  if (!value?.current) return 0
  const elapsed = playing.value ? Math.max(0, now.value - receivedAt.value) * value.rate : 0
  const position = value.positionMs + elapsed
  return value.current.isStream ? position : Math.min(position, value.current.lengthMs)
})
const progress = computed(() => {
  const track = current.value
  if (!track || track.isStream || track.lengthMs === 0) return undefined
  return positionMs.value / track.lengthMs
})

// ---------------------------------------------------------------------------
// Voice channels
// ---------------------------------------------------------------------------

const channels = useAsync(() => apiFetch<MusicChannels>('/api/music/channels'))
const channelId = ref<string | null>(null)

/** The channel Sensei is in, else Vivy's, until one is picked. */
watch([() => channels.data.value, () => state.value?.voiceChannelId], ([list, vivyChannel]) => {
  if (channelId.value || !list) return
  channelId.value = list.userChannelId ?? vivyChannel ?? null
})

const channelOptions = computed<SelectOption<string>[]>(() => {
  const list = channels.data.value
  if (!list) return []
  return groupOptions(
    list.channels.map((channel) => ({
      value: channel.id,
      label: channel.name,
      group: channel.category ?? undefined,
      trailing:
        channel.id === state.value?.voiceChannelId
          ? 'Vivy is here'
          : channel.id === list.userChannelId
            ? "You're here"
            : undefined,
    })),
  )
})

const channelName = (id: string | null) =>
  channels.data.value?.channels.find((channel) => channel.id === id)?.name ?? null

/** Vivy is busy in another channel than the one picked. */
const elsewhere = computed(
  () =>
    channelId.value != null &&
    state.value?.voiceChannelId != null &&
    state.value.voiceChannelId !== channelId.value &&
    (current.value != null || queue.value.length > 0),
)

// ---------------------------------------------------------------------------
// Search and play
// ---------------------------------------------------------------------------

const SOURCES: { value: MusicSource; label: string }[] = [
  { value: 'ytmsearch', label: 'YouTube Music' },
  { value: 'ytsearch', label: 'YouTube' },
]
const SEARCH_DELAY_MS = 350

const query = ref('')
const source = ref<MusicSource>('ytmsearch')
const results = ref<MusicSearch | null>(null)
const searching = ref(false)
const searchError = ref<string | null>(null)
let searchTimer: ReturnType<typeof setTimeout> | undefined
let searchAbort: AbortController | undefined

const link = computed(() => isLink(query.value))

watch([query, source], () => {
  clearTimeout(searchTimer)
  searchAbort?.abort()
  results.value = null
  searchError.value = null
  const text = query.value.trim()
  // A link is played as it is: searching it would only show what it is.
  if (!text || link.value) {
    searching.value = false
    return
  }
  searching.value = true
  searchTimer = setTimeout(() => void search(text), SEARCH_DELAY_MS)
})

async function search(text: string) {
  const abort = new AbortController()
  searchAbort = abort
  try {
    const params = new URLSearchParams({ q: text, source: source.value })
    results.value = await apiFetch<MusicSearch>(`/api/music/search?${params}`, {
      signal: abort.signal,
    })
  } catch (cause) {
    if (abort.signal.aborted) return
    searchError.value = cause instanceof Error ? cause.message : 'Could not search.'
  } finally {
    if (!abort.signal.aborted) searching.value = false
  }
}

type PlayTarget = { encoded: string; title: string } | { query: string; source: MusicSource }

/** The Queue dialog, opened from the page's top right. */
const addOpen = ref(false)

const busy = ref(false)

/** Posts a change, one at a time: the controls are disabled until it's answered. */
async function post<T>(path: string, body?: unknown): Promise<T> {
  busy.value = true
  try {
    return await apiFetch<T>(path, { method: 'POST', body })
  } finally {
    busy.value = false
  }
}

/** A play that found Vivy busy in another channel, kept while the move is confirmed. */
const conflict = ref<{ target: PlayTarget; queueType: MusicQueueType; channel: string } | null>(
  null,
)
const conflictOpen = ref(false)

async function play(target: PlayTarget, queueType: MusicQueueType) {
  if (!channelId.value) {
    snackbar.show('Choose a voice channel first.', { error: true })
    return
  }
  try {
    const played = await post<MusicPlayed>('/api/music/play', {
      voiceChannelId: channelId.value,
      queueType,
      target,
    })
    showView(played.view)
    snackbar.show(playedText(played, queueType))
  } catch (cause) {
    if (cause instanceof ApiError && cause.code === 'voice_conflict') {
      const channel = typeof cause.details?.channel === 'string' ? cause.details.channel : null
      conflict.value = { target, queueType, channel: channel ?? 'another channel' }
      conflictOpen.value = true
    } else {
      snackbar.showError(cause, 'Could not queue that.')
    }
  }
}

function playedText(played: MusicPlayed, queueType: MusicQueueType): string {
  if (played.playlistName) return `Queued ${played.added} tracks from “${played.playlistName}”.`
  const title = played.first?.title ?? 'the track'
  if (queueType === 'now') return `Playing “${title}”.`
  if (queueType === 'next') return `“${title}” plays next.`
  return `Added “${title}” to the queue.`
}

function playResult(track: MusicSearchTrack, queueType: MusicQueueType) {
  addOpen.value = false
  void play({ encoded: track.encoded, title: track.title }, queueType)
}

function playLink(queueType: MusicQueueType) {
  addOpen.value = false
  void play({ query: query.value.trim(), source: source.value }, queueType)
}

/** Moves Vivy to the picked channel, then plays what found her elsewhere. */
async function moveAndPlay() {
  const pendingPlay = conflict.value
  conflictOpen.value = false
  if (!pendingPlay || !channelId.value) return
  try {
    showView(await post<MusicView>('/api/music/move', { voiceChannelId: channelId.value }))
  } catch (cause) {
    snackbar.showError(cause, 'Could not move Vivy.')
    return
  }
  await play(pendingPlay.target, pendingPlay.queueType)
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

type Control = 'pause' | 'resume' | 'skip' | 'stop' | 'clear' | 'shuffle'

const CONTROL_DONE: Record<Control, string> = {
  pause: 'Paused.',
  resume: 'Resumed.',
  skip: 'Skipped.',
  stop: 'Stopped. Vivy left the channel.',
  clear: 'Queue cleared.',
  shuffle: 'Queue shuffled.',
}

async function control(op: Control) {
  try {
    showView(await post<MusicView>(`/api/music/${op}`))
    snackbar.show(CONTROL_DONE[op])
  } catch (cause) {
    snackbar.showError(cause, `Could not ${op === 'clear' ? 'clear the queue' : op}.`)
  }
}

/** The stop or clear being confirmed. `confirmShown` keeps the dialog's text while it animates closed. */
const confirmOpen = ref<'stop' | 'clear' | null>(null)
const confirmShown = ref<'stop' | 'clear'>('stop')
watch(confirmOpen, (value) => value && (confirmShown.value = value))

function confirmed() {
  const op = confirmOpen.value
  confirmOpen.value = null
  if (op) void control(op)
}

/** Where the slider is while it's dragged; the live position shows otherwise. */
const seeking = ref<number | null>(null)
/** Staff drag through a track Vivy can seek; anything else shows the plain progress. */
const canSeek = computed(
  () => canControl.value && online.value && current.value?.isSeekable === true,
)

async function seek(value: number | [number, number]) {
  const positionMs = Math.round(Array.isArray(value) ? value[0] : value)
  try {
    showView(await post<MusicView>('/api/music/seek', { positionMs }))
  } catch (cause) {
    snackbar.showError(cause, 'Could not move through the track.')
  } finally {
    seeking.value = null
  }
}

async function setVolume(volume: number) {
  try {
    showView(await post<MusicView>('/api/music/volume', { volume }))
  } catch (cause) {
    snackbar.showError(cause, 'Could not change the volume.')
  }
}

async function setRepeat(mode: MusicRepeat) {
  try {
    showView(await post<MusicView>('/api/music/repeat', { mode }))
  } catch (cause) {
    snackbar.showError(cause, 'Could not change what repeats.')
  }
}

async function setAutoplay(enabled: boolean) {
  try {
    showView(await post<MusicView>('/api/music/autoplay', { enabled }))
    snackbar.show(enabled ? 'Autoplay is on.' : 'Autoplay is off.')
  } catch (cause) {
    snackbar.showError(cause, 'Could not change autoplay.')
  }
}

async function remove(track: MusicTrack, index: number) {
  try {
    showView(await post<MusicView>('/api/music/remove', { index, identifier: track.identifier }))
    snackbar.show(`Removed “${track.title}”.`)
  } catch (cause) {
    snackbar.showError(cause, 'Could not remove the track.')
  }
}
</script>

<template>
  <div class="@container flex flex-col gap-4">
    <template v-if="player">
      <div
        v-if="view && !online"
        class="flex items-center gap-4 overflow-hidden rounded-medium bg-warning-container py-3 pr-3 pl-6 text-on-warning-container"
      >
        <p class="min-w-0 flex-1 text-body-medium">
          Vivy is offline. I'll update this page when she's back.
        </p>
        <Button variant="text" class="text-inherit!" @click="music.run()">Try again</Button>
      </div>

      <!-- Up next sits beside the player only while there's something in it. -->
      <div
        class="grid gap-4"
        :class="queue.length > 0 && '@5xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] @5xl:items-start'"
      >
        <section aria-labelledby="music-now">
          <div class="section-header">
            <h2 id="music-now" class="text-title-medium">Now playing</h2>
            <span class="flex items-center gap-3 pr-1">
              <span
                v-if="state?.voiceChannelName"
                class="flex items-center gap-1 text-label-large text-on-surface-variant"
              >
                <span class="icon [--icon-size:18px]" aria-hidden="true">headset_mic</span>
                {{ state.voiceChannelName }}
              </span>
              <Button
                v-if="canControl"
                variant="tonal"
                size="s"
                :disabled="!online"
                @click="addOpen = true"
              >
                <span class="icon [--icon-size:18px]" aria-hidden="true">playlist_add</span>
                Queue
              </Button>
            </span>
          </div>

          <div aria-live="polite">
            <StateBlock :loading="loading" :error="music.error.value" :retry="music.run" compact>
              <template #skeleton><div class="skeleton h-16 rounded-medium" /></template>

              <!-- Playing: art and the track on top; under them one row of the controls, the
                   progress centred on them, and the volume. On a narrow page the controls take
                   their own row and the progress and volume wrap beneath. -->
              <Card
                v-if="current"
                :padded="false"
                class="flex flex-col gap-4 bg-surface-container! p-4"
              >
                <div class="flex min-w-0 items-center gap-4">
                  <img
                    v-if="current.artworkUrl"
                    class="size-18 shrink-0 rounded-medium bg-surface-container-highest object-cover"
                    :src="current.artworkUrl"
                    alt=""
                    width="72"
                    height="72"
                  />
                  <span
                    v-else
                    class="flex size-18 shrink-0 items-center justify-center rounded-medium bg-surface-container-highest text-on-surface-variant"
                  >
                    <span class="icon [--icon-size:32px]" aria-hidden="true">music_note</span>
                  </span>
                  <div class="flex min-w-0 flex-1 flex-col gap-1">
                    <a
                      v-if="current.uri"
                      class="truncate text-title-medium hover:underline"
                      :href="current.uri"
                      :title="current.title"
                      target="_blank"
                      rel="noopener"
                      >{{ current.title }}</a
                    >
                    <span v-else class="truncate text-title-medium" :title="current.title">{{
                      current.title
                    }}</span>
                    <span class="truncate text-body-medium text-on-surface-variant"
                      >{{ current.author
                      }}<template v-if="current.requester">
                        · requested by
                        <DiscordMention
                          kind="user"
                          :name="current.requester.name"
                          :id="current.requester.id" /></template
                    ></span>
                  </div>
                  <!-- Staff toggle autoplay and step through repeat; viewers see them when on. -->
                  <span v-if="state && canControl" class="flex shrink-0 items-center gap-1">
                    <IconButton
                      v-if="state.autoplay != null"
                      variant="standard"
                      toggle
                      :selected="state.autoplay"
                      :label="state.autoplay ? 'Autoplay is on' : 'Autoplay is off'"
                      :disabled="busy || !online"
                      @click="setAutoplay(!state.autoplay)"
                    >
                      <span class="icon" aria-hidden="true">all_inclusive</span>
                    </IconButton>
                    <IconButton
                      variant="standard"
                      toggle
                      :selected="state.repeat !== 'off'"
                      :label="REPEAT_LABELS[state.repeat] ?? 'Repeat is off'"
                      :disabled="busy || !online"
                      @click="setRepeat(NEXT_REPEAT[state.repeat])"
                    >
                      <span class="icon" aria-hidden="true">{{
                        state.repeat === 'track' ? 'repeat_one' : 'repeat'
                      }}</span>
                    </IconButton>
                  </span>
                  <span
                    v-else-if="state"
                    class="flex shrink-0 items-center gap-2 text-on-surface-variant"
                  >
                    <span v-if="state.autoplay" class="flex" title="Autoplay is on">
                      <span class="icon [--icon-size:20px]" aria-hidden="true">all_inclusive</span>
                      <span class="sr-only">Autoplay is on</span>
                    </span>
                    <span
                      v-if="REPEAT_LABELS[state.repeat]"
                      class="flex"
                      :title="REPEAT_LABELS[state.repeat] ?? undefined"
                    >
                      <span class="icon [--icon-size:20px]" aria-hidden="true">{{
                        state.repeat === 'track' ? 'repeat_one' : 'repeat'
                      }}</span>
                      <span class="sr-only">{{ REPEAT_LABELS[state.repeat] }}</span>
                    </span>
                  </span>
                </div>

                <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <!-- M3 Expressive sizes: the main action large and filled, skip a wide tonal
                       pill, and stop (which empties the queue) the quietest. -->
                  <div
                    v-if="canControl"
                    class="flex w-full items-center justify-center gap-2 @2xl:w-auto"
                  >
                    <IconButton
                      variant="tonal"
                      size="m"
                      width="wide"
                      label="Skip"
                      :disabled="busy || !online"
                      @click="control('skip')"
                    >
                      <span class="icon" aria-hidden="true">skip_next</span>
                    </IconButton>
                    <IconButton
                      variant="filled"
                      size="l"
                      :label="playing ? 'Pause' : 'Resume'"
                      :disabled="busy || !online"
                      @click="control(playing ? 'pause' : 'resume')"
                    >
                      <span class="icon [--icon-size:32px]" aria-hidden="true">{{
                        playing ? 'pause' : 'play_arrow'
                      }}</span>
                    </IconButton>
                    <IconButton
                      variant="outlined"
                      size="m"
                      label="Stop and leave the channel"
                      :disabled="busy || !online"
                      @click="confirmOpen = 'stop'"
                    >
                      <span class="icon" aria-hidden="true">stop</span>
                    </IconButton>
                  </div>

                  <div class="flex min-w-0 flex-1 items-center gap-3">
                    <span
                      class="w-10 shrink-0 text-right text-label-small text-on-surface-variant tabular-nums"
                      >{{ formatDuration(seeking ?? positionMs) }}</span
                    >
                    <Slider
                      v-if="canSeek"
                      class="min-w-0 flex-1"
                      :min="0"
                      :max="current.lengthMs"
                      :step="1000"
                      :model-value="seeking ?? positionMs"
                      label="Position in the track"
                      :format="formatDuration"
                      value-indicator
                      :disabled="busy"
                      @update:model-value="
                        (value) => (seeking = Array.isArray(value) ? value[0] : (value ?? 0))
                      "
                      @change="seek"
                    />
                    <LinearProgressIndicator
                      v-else
                      class="min-w-0 flex-1"
                      :progress="progress ?? 0"
                      :wavy="playing"
                      :aria-label="`${formatDuration(positionMs)} of ${formatDuration(current.lengthMs)}`"
                    />
                    <span
                      class="w-10 shrink-0 text-label-small text-on-surface-variant tabular-nums"
                      >{{ current.isStream ? 'Live' : formatDuration(current.lengthMs) }}</span
                    >
                    <VolumeButton
                      v-if="canControl"
                      :volume="state?.volume ?? 1"
                      :disabled="busy || !online"
                      @change="setVolume"
                    />
                    <span
                      v-else-if="state"
                      class="flex shrink-0 items-center gap-1 text-label-small text-on-surface-variant"
                    >
                      <span class="icon [--icon-size:16px]" aria-hidden="true">volume_up</span>
                      {{ Math.round(state.volume * 100) }}%
                    </span>
                  </div>
                </div>
              </Card>

              <!-- Idle: one line, so the stats below aren't pushed off the screen. -->
              <Card
                v-else
                :padded="false"
                class="flex items-center gap-3 bg-surface-container! px-5 py-4 text-body-medium text-on-surface-variant"
              >
                <span class="icon [--icon-size:20px]" aria-hidden="true">music_off</span>
                <span>
                  {{ online ? 'Nothing playing. Standing by.' : 'Nothing to report.' }}
                  <template v-if="online && canControl">Queue something to start it.</template>
                </span>
              </Card>
            </StateBlock>
          </div>
        </section>

        <section v-if="queue.length > 0" aria-labelledby="music-queue">
          <div class="section-header">
            <h2 id="music-queue" class="text-title-medium">Up next</h2>
            <span class="flex items-center gap-2 pr-2">
              <span
                v-if="state && state.queueSize > 0"
                class="pr-2 text-label-large text-on-surface-variant"
                >{{ state.queueSize }} · {{ formatDuration(state.durationMs) }}</span
              >
              <template v-if="canControl">
                <IconButton
                  variant="standard"
                  label="Shuffle the queue"
                  :disabled="busy || !online"
                  @click="control('shuffle')"
                >
                  <span class="icon" aria-hidden="true">shuffle</span>
                </IconButton>
                <IconButton
                  variant="standard"
                  label="Clear the queue"
                  :disabled="busy || !online"
                  @click="confirmOpen = 'clear'"
                >
                  <span class="icon" aria-hidden="true">delete_sweep</span>
                </IconButton>
              </template>
            </span>
          </div>

          <List segmented>
            <ListItem
              v-for="(track, index) in queue"
              :key="`${index}:${track.identifier}`"
              class="bg-surface-container!"
            >
              <template #leading>
                <span class="w-6 shrink-0 text-center text-label-large text-on-surface-variant">{{
                  index + 1
                }}</span>
              </template>
              <span class="block truncate">{{ track.title }}</span>
              <template #supporting-text>
                <span class="block truncate text-body-small"
                  >{{ track.author
                  }}<template v-if="track.requester">
                    ·
                    <DiscordMention
                      kind="user"
                      :name="track.requester.name"
                      :id="track.requester.id" /></template
                ></span>
              </template>
              <template #trailing>
                <span class="flex items-center gap-4">
                  <span class="text-label-medium text-on-surface-variant">{{
                    track.isStream ? 'Live' : formatDuration(track.lengthMs)
                  }}</span>
                  <IconButton
                    v-if="canControl"
                    variant="tonal"
                    width="narrow"
                    class="bg-error-container! text-on-error-container!"
                    :label="`Remove ${track.title}`"
                    :disabled="busy || !online"
                    @click="remove(track, index)"
                  >
                    <span class="icon [--icon-size:20px]" aria-hidden="true">delete</span>
                  </IconButton>
                </span>
              </template>
            </ListItem>
          </List>
          <p
            v-if="state && state.queueSize > queue.length"
            class="px-4 pt-3 text-body-small text-on-surface-variant"
          >
            And {{ state.queueSize - queue.length }} more.
          </p>
        </section>
      </div>
    </template>

    <MusicStats :class="player && 'mt-2'" />

    <!-- A form in a dialog has no hero and no face (see "Dialogs" in BRANDING.md). Playing
         closes it, so the snackbar or the move confirmation can be reached; reopening keeps the
         search. Wider and taller than the library's 560dp basic dialog, which has no size
         prop, so its panel (the root's last child's child) is sized here; a fixed height keeps
         it still as results load. -->
    <Dialog
      v-if="player && canControl"
      v-model:open="addOpen"
      aria-labelledby="music-queue-title"
      class="[&>div:last-child>div]:h-[min(720px,100%)] [&>div:last-child>div]:max-h-[min(720px,100%)] [&>div:last-child>div]:max-w-[min(840px,100%)]"
    >
      <!-- The title row is the channel and, on the right, where to search; the dialog is named
           "Queue" by a title only screen readers get. -->
      <template #headline>
        <span class="flex flex-wrap items-center justify-between gap-4">
          <span class="flex items-center">
            <span id="music-queue-title" class="sr-only">Queue</span>
            <ChannelChip
              v-model="channelId"
              label="Voice channel"
              :options="channelOptions"
              :disabled="!channels.data.value"
            />
          </span>
          <span class="flex"
            ><ChoiceGroup v-model="source" label="Search on" :options="SOURCES"
          /></span>
        </span>
      </template>
      <div class="flex w-[792px] max-w-full flex-col gap-4 pt-2">
        <p v-if="channels.error.value" class="text-body-small text-error">
          {{ channels.error.value }}
        </p>
        <p v-else-if="elsewhere" class="text-body-small text-on-surface-variant">
          Vivy is playing in {{ state?.voiceChannelName ?? 'another channel' }}. Queueing here moves
          her.
        </p>
        <!-- The bar's own surface-container-high is the dialog's, so it and the results drop to
             surface-container. -->
        <AppSearchBar
          v-model="query"
          placeholder="Search, or paste a link or playlist"
          label="Search for music"
          class="bg-surface-container!"
        >
          <template v-if="results" #trailing>{{ results.tracks.length }}</template>
        </AppSearchBar>

        <div
          v-if="query.trim()"
          :class="
            (searching || searchError || (results && results.tracks.length === 0)) &&
            'overflow-hidden rounded-medium bg-surface-container'
          "
        >
          <List v-if="link" segmented>
            <ListItem class="bg-surface-container!">
              <template #leading>
                <span
                  class="flex size-10 shrink-0 items-center justify-center rounded-small bg-surface-container-highest"
                >
                  <span class="icon [--icon-size:20px]" aria-hidden="true">link</span>
                </span>
              </template>
              <span class="block truncate">Play this link</span>
              <template #supporting-text>
                <span class="block truncate text-body-small">{{ query.trim() }}</span>
              </template>
              <template #trailing>
                <span class="flex gap-2">
                  <IconButton
                    v-for="place in QUEUE_PLACES"
                    :key="place.type"
                    variant="tonal"
                    width="narrow"
                    :label="place.label"
                    :disabled="busy || !online"
                    @click="playLink(place.type)"
                  >
                    <span class="icon [--icon-size:20px]" aria-hidden="true">{{ place.icon }}</span>
                  </IconButton>
                </span>
              </template>
            </ListItem>
          </List>

          <StateBlock
            v-else
            :loading="searching"
            :error="searchError"
            :empty="results != null && results.tracks.length === 0"
            empty-text="No results for that."
            compact
          >
            <template #skeleton><SkeletonList :rows="4" two-line trailing="stack" /></template>
            <List v-if="results" segmented>
              <ListItem
                v-for="track in results.tracks"
                :key="track.encoded"
                class="bg-surface-container!"
              >
                <template #leading>
                  <img
                    v-if="track.artworkUrl"
                    class="size-10 shrink-0 rounded-small bg-surface-container-highest object-cover"
                    :src="track.artworkUrl"
                    alt=""
                    width="40"
                    height="40"
                    loading="lazy"
                  />
                  <span
                    v-else
                    class="flex size-10 shrink-0 items-center justify-center rounded-small bg-surface-container-highest"
                  >
                    <span class="icon [--icon-size:20px]" aria-hidden="true">music_note</span>
                  </span>
                </template>
                <span class="block truncate">{{ track.title }}</span>
                <template #supporting-text>
                  <span class="block truncate text-body-small"
                    >{{ track.author }} ·
                    {{ track.isStream ? 'Live' : formatDuration(track.lengthMs) }}</span
                  >
                </template>
                <template #trailing>
                  <span class="flex gap-2">
                    <IconButton
                      v-for="place in QUEUE_PLACES"
                      :key="place.type"
                      variant="tonal"
                      width="narrow"
                      :label="`${place.label}: ${track.title}`"
                      :disabled="busy || !online"
                      @click="playResult(track, place.type)"
                    >
                      <span class="icon [--icon-size:20px]" aria-hidden="true">{{
                        place.icon
                      }}</span>
                    </IconButton>
                  </span>
                </template>
              </ListItem>
            </List>
          </StateBlock>
        </div>
      </div>
      <template #actions>
        <Button variant="text" @click="addOpen = false">Close</Button>
      </template>
    </Dialog>

    <Dialog v-model:open="conflictOpen">
      <template #headline>Move Vivy?</template>
      <div class="flex flex-col items-center gap-4 text-center">
        <PlanaPortrait mood="attentive" />
        <p>
          Vivy is playing in {{ conflict?.channel }}. Moving her to
          {{ channelName(channelId) ?? 'this channel' }} takes the music away from the listeners
          there.
        </p>
      </div>
      <template #actions>
        <Button variant="text" @click="conflictOpen = false">Cancel</Button>
        <Button variant="text" @click="moveAndPlay">Move and play</Button>
      </template>
    </Dialog>

    <Dialog :open="confirmOpen != null" @update:open="(open) => !open && (confirmOpen = null)">
      <template #headline>{{
        confirmShown === 'stop' ? 'Stop the music?' : 'Clear the queue?'
      }}</template>
      <div class="flex flex-col items-center gap-4 text-center">
        <PlanaPortrait mood="attentive" />
        <p v-if="confirmShown === 'stop'">
          The queue will be cleared and Vivy will leave
          {{ state?.voiceChannelName ?? 'the channel' }}.
        </p>
        <p v-else>
          {{ state?.queueSize ?? 0 }} upcoming tracks will be removed. The current track keeps
          playing.
        </p>
      </div>
      <template #actions>
        <Button variant="text" @click="confirmOpen = null">Cancel</Button>
        <Button variant="text" @click="confirmed">{{
          confirmShown === 'stop' ? 'Stop' : 'Clear'
        }}</Button>
      </template>
    </Dialog>
  </div>
</template>
