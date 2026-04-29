import type Database from 'better-sqlite3'
import type { XClient } from '@x-monitor/x-client'
import type { Logger } from '@x-monitor/observability'
import { runCustomerScan } from './scan.js'
import { aiTasksQ, getNetStatus } from '@x-monitor/queue'
import { heartbeat } from '@x-monitor/observability'

export async function runLoop({
  db, xc, log, intervalMs,
}: {
  db: Database.Database
  xc: XClient
  log: Logger
  intervalMs: number
}): Promise<void> {
  while (true) {
    const status = await getNetStatus()
    if (status === 'DOWN' || status === 'DEGRADED_X') {
      log.warn('skipping customer scan, network not healthy', { status })
      await sleep(intervalMs)
      continue
    }
    try {
      const r = await runCustomerScan({
        db, xc,
        enqueue: (id) => { aiTasksQ.add('analyze', { postId: id, traceId: String(id) }) },
      })
      log.info('customer-scanned', r)
    } catch (e) {
      log.error('customer scan failed', { error: String(e) })
    }
    heartbeat(db, 'scanner-customer', 'ok')
    await sleep(intervalMs)
  }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }
