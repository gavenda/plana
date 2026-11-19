import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

/** `days` null is all time; in the URL and the API it is `all`. */
export const PERIODS: { days: number | null; label: string }[] = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: null, label: 'All time' },
]
export const DEFAULT_DAYS = 7

export const daysParam = (days: number | null) => (days == null ? 'all' : String(days))

/** The period a stats page shows, kept in its URL as `days` (left out for the default). */
export function usePeriod() {
  const route = useRoute()
  const router = useRouter()

  function daysFromQuery(): number | null {
    const raw = route.query.days
    if (raw === 'all') return null
    const days = Number(raw)
    return PERIODS.some((period) => period.days === days) ? days : DEFAULT_DAYS
  }

  const days = ref(daysFromQuery())

  watch(days, (value) => {
    void router.replace({
      query: { ...route.query, days: value === DEFAULT_DAYS ? undefined : daysParam(value) },
    })
  })

  const param = computed(() => daysParam(days.value))
  const label = computed(() => PERIODS.find((period) => period.days === days.value)?.label)

  return { days, param, label }
}

export const plural = (count: number, one: string, many: string) =>
  `${count.toLocaleString()} ${count === 1 ? one : many}`
