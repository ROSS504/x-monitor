import { getDb, migrate } from '@x-monitor/db'
import { createDifyManager } from '@x-monitor/dify-client'
import { createLogger, heartbeat } from '@x-monitor/observability'
import { syncOnce } from './sync.js'

const db = getDb(); migrate(db)
const log = createLogger('fresh-kb-indexer')

const apiKey = process.env.DIFY_API_KEY
const datasetId = process.env.DIFY_DATASET_ID
if (!apiKey || !datasetId) {
  log.warn('DIFY_API_KEY/DIFY_DATASET_ID not configured; idling')
  // exit cleanly so PM2 doesn't loop tightly; user can set env and pm2 restart
  process.exit(0)
}

const manager = createDifyManager({ apiKey, datasetId, baseUrl: process.env.DIFY_BASE_URL })
const intervalMs = parseInt(process.env.KB_INDEXER_INTERVAL_MS ?? '3600000', 10)  // 1 hour default

async function tick() {
  try {
    const r = await syncOnce({ db, manager })
    log.info('synced', r)
    heartbeat(db, 'fresh-kb-indexer', 'ok')
  } catch (e) {
    log.error('sync failed', { error: String(e) })
    heartbeat(db, 'fresh-kb-indexer', 'error', String(e))
  }
}

await tick()
setInterval(tick, intervalMs)
log.info('started', { intervalMs })
