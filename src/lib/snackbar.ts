import { computed, ref } from 'vue'

/** A snackbar's one action: a link it opens in a new tab, or something it runs. */
export type SnackbarAction = { label: string } & ({ href: string } | { run: () => void })

export type Snack = {
  /** Changes with every message, so a replacement animates in rather than editing the old one. */
  id: number
  text: string
  /** An error stays longer, interrupts a screen reader, and can always be closed. */
  error: boolean
  action?: SnackbarAction
  /** A standing message: stays until cleared, rather than timing out. */
  standing?: boolean
  /** Shows her halo, for a state that is still being worked on ("Reconnecting…"). */
  busy?: boolean
}

/**
 * The one snackbar on screen (AppSnackbar draws it). M3 shows one at a time, so a new message
 * replaces the current one. Only the client ever sets it: a snackbar answers a click.
 */
const reply = ref<Snack | null>(null)

/**
 * A state the app is in, such as the live connection being down. A reply covers it for as
 * long as the reply shows, then it comes back.
 */
const standing = ref<Snack | null>(null)

const current = computed(() => reply.value ?? standing.value)
let nextId = 0

function show(text: string, options: { error?: boolean; action?: SnackbarAction } = {}) {
  reply.value = { id: ++nextId, text, error: options.error ?? false, action: options.action }
}

/** Shows `text` until `clearStanding`; showing it again with the same text keeps it as is. */
function showStanding(text: string, options: { error?: boolean; busy?: boolean } = {}) {
  if (standing.value?.text === text) return
  standing.value = {
    id: ++nextId,
    text,
    error: options.error ?? false,
    standing: true,
    busy: options.busy,
  }
}

function clearStanding() {
  standing.value = null
}

/** The reason an action failed, from what it threw, or `fallback` when it gave none. */
function showError(cause: unknown, fallback: string) {
  show(cause instanceof Error && cause.message ? cause.message : fallback, { error: true })
}

/** Closes the snackbar showing, or only the one with `id`. */
function dismiss(id?: number) {
  const snack = current.value
  if (!snack || (id !== undefined && snack.id !== id)) return
  if (snack === reply.value) reply.value = null
  else standing.value = null
}

export function useSnackbar() {
  return { current, show, showError, showStanding, clearStanding, dismiss }
}
