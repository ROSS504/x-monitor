import { getDb, migrate } from '@x-monitor/db'
import { createLogger, heartbeat } from '@x-monitor/observability'
import { getNetStatus } from '@x-monitor/queue'
import { processBatch } from './batch.js'

const db = getDb(); migrate(db)
const log = createLogger('ai-worker')

while (true) {
  const status = await getNetStatus()
  if (status !== 'HEALTHY') {
    log.warn('paused', { status })
    await new Promise(r => setTimeout(r, 30_000))
    continue
  }
  try {
    const r = await processBatch(db, log)
    log.info('batch complete', r)
    heartbeat(db, 'ai-worker', 'ok')
  } catch (e) {
    log.error('batch failed', { error: String(e) })
    heartbeat(db, 'ai-worker', 'error', String(e))
  }
  await new Promise(r => setTimeout(r, 60_000))
}
