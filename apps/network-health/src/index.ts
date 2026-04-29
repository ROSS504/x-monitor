import { probeAll } from './probe.js'
import { classify } from './classify.js'
import { publishNetStatus } from '@x-monitor/queue'
import { createLogger, heartbeat } from '@x-monitor/observability'
import { getDb, migrate } from '@x-monitor/db'

const log = createLogger('network-health')
const db = getDb()
migrate(db)

async function tick(): Promise<void> {
  try {
    const r = await probeAll()
    const status = classify(r)
    await publishNetStatus(status)
    log.info('probed', { results: r, status })
    heartbeat(db, 'network-health', 'ok')
  } catch (e) {
    log.error('probe failed', { error: String(e) })
    heartbeat(db, 'network-health', 'error', String(e))
  }
}

await tick()
setInterval(tick, 5 * 60_000)
