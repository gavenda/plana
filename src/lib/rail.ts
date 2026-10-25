import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'

const STORAGE_KEY = 'plana:rail-expanded'

/** Wide enough (M3's expanded class) for the open rail to sit beside the page rather than over it. */
const DOCK_QUERY = '(min-width: 840px)'

/** Whether the window has room for the open rail to push the page aside instead of floating over it. */
export function railDocks(): boolean {
  return typeof window !== 'undefined' && (window.matchMedia?.(DOCK_QUERY).matches ?? false)
}

/**
 * Whether the navigation rail is open. Starts shut so the server render and the first client
 * render agree; `restore` applies the remembered choice after hydration.
 */
const expanded = ref(false)

/** True until the remembered state is applied, so restoring it doesn't animate the rail open. */
const still = ref(true)

function set(value: boolean) {
  expanded.value = value
  try {
    localStorage.setItem(STORAGE_KEY, value ? '1' : '0')
  } catch {
    // Storage can be unavailable (private windows, blocked site data); the rail just forgets.
  }
}

/** Only a window wide enough to dock it brings the rail back open: a floating one would greet the page with a scrim. */
function restore() {
  if (railDocks()) {
    try {
      expanded.value = localStorage.getItem(STORAGE_KEY) === '1'
    } catch {
      // As above.
    }
  }
  requestAnimationFrame(() => requestAnimationFrame(() => (still.value = false)))
}

/** What the rail's FAB does on the current page; its label and icon come from the route. */
const fabAction = shallowRef<(() => void) | null>(null)

/** Runs the current page's FAB action, if it has registered one. */
export function runRailFab() {
  fabAction.value?.()
}

/** Gives the rail's FAB (named by the route's `fab` meta) its action while this page is up. */
export function useRailFab(action: () => void) {
  onMounted(() => (fabAction.value = action))
  onBeforeUnmount(() => {
    if (fabAction.value === action) fabAction.value = null
  })
}

export function useRail() {
  return {
    expanded,
    still,
    restore,
    toggle: () => set(!expanded.value),
    collapse: () => set(false),
  }
}
