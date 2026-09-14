import { ref, shallowRef } from 'vue'

/**
 * Minimal request state helper. Views that load one resource all need the same
 * loading/error/data triple, and this keeps that out of every component.
 */
export function useAsync<T>(loader: () => Promise<T>) {
  const data = shallowRef<T | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function run(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      data.value = await loader()
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Something went wrong.'
    } finally {
      loading.value = false
    }
  }

  return { data, loading, error, run }
}
