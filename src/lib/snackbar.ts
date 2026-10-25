import { readonly, ref } from 'vue'

/** A snackbar's one action: a link it opens in a new tab, or something it runs. */
export type SnackbarAction = { label: string } & ({ href: string } | { run: () => void })

export type Snack = {
  /** Changes with every message, so a replacement animates in rather than editing the old one. */
  id: number
  text: string
  /** An error stays longer, interrupts a screen reader, and can always be closed. */
  error: boolean
  action?: SnackbarAction
}

/**
 * The one snackbar on screen (AppSnackbar draws it). M3 shows one at a time, so a new message
 * replaces the current one. Only the client ever sets it: a snackbar answers a click.
 */
const current = ref<Snack | null>(null)
let nextId = 0

function show(text: string, options: { error?: boolean; action?: SnackbarAction } = {}) {
  current.value = { id: ++nextId, text, error: options.error ?? false, action: options.action }
}

/** The reason an action failed, from what it threw, or `fallback` when it gave none. */
function showError(cause: unknown, fallback: string) {
  show(cause instanceof Error && cause.message ? cause.message : fallback, { error: true })
}

function dismiss(id?: number) {
  if (id === undefined || current.value?.id === id) current.value = null
}

export function useSnackbar() {
  return { current: readonly(current), show, showError, dismiss }
}
