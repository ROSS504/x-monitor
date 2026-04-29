import { createDifyClient } from '@x-monitor/dify-client'
import { searchKB as fixtureSearchKB } from '@x-monitor/kb-fixture'
import type { SearchKBFn } from '@x-monitor/dify-client'

let cached: SearchKBFn | null = null

/**
 * Returns the configured KB searcher.
 * - If DIFY_API_KEY and DIFY_DATASET_ID are set: real Dify HTTP client
 * - Otherwise: in-memory kb-fixture (for dev / tests when env not set)
 */
export function getKB(): SearchKBFn {
  if (cached) return cached
  const apiKey = process.env.DIFY_API_KEY
  const datasetId = process.env.DIFY_DATASET_ID
  if (apiKey && datasetId) {
    cached = createDifyClient({
      apiKey,
      datasetId,
      baseUrl: process.env.DIFY_BASE_URL,
    })
  } else {
    cached = (q: string) => fixtureSearchKB(q)
  }
  return cached
}

/** For tests — reset the singleton so env changes take effect. */
export function resetKB(): void {
  cached = null
}
