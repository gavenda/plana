import { ref, shallowRef } from 'vue'

/** Loading/error/data state for one resource; only the latest run's answer is kept. */
export function useAsync<T>(loader: () => Promise<T>) {
  const data = shallowRef<T | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  let generation = 0

  async function run(): Promise<void> {
    const current = ++generation
    loading.value = true
    error.value = null
    try {
      const value = await loader()
      if (current === generation) data.value = value
    } catch (cause) {
      if (current === generation) {
        error.value = cause instanceof Error ? cause.message : 'Something went wrong.'
      }
    } finally {
      if (current === generation) loading.value = false
    }
  }

  return { data, loading, error, run }
}
