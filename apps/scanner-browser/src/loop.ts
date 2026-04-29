import type Database from 'better-sqlite3'
import type { XClient } from '@x-monitor/x-client'
import type { Logger } from '@x-monitor/observability'
import { runOneScan } from './scan.js'
import { aiTasksQ, getNetStatus } from '@x-monitor/queue'
import { heartbeat } from '@x-monitor/observability'

export async function runLoop({
  db, xc, log, queries, intervalMs, traceIdGen,
}: {
  db: Database.Database
  xc: XClient
  log: Logger
  queries: string[]
  intervalMs: number
  traceIdGen?: () => string
}): Promise<void> {
  while (true) {
    const status = await getNetStatus()
    if (status === 'DOWN' || status === 'DEGRADED_X') {
      log.warn('skipping scan, network not healthy', { status })
      await sleep(intervalMs)
      continue
    }
    for (const q of queries) {
      try {
        const r = await runOneScan({
          db, xc, query: q,
          enqueue: (id) => { aiTasksQ.add('analyze', { postId: id, traceId: traceIdGen?.() ?? String(id) }) },
        })
        log.info('scanned', { query: q, ...r })
      } catch (e) {
        log.error('scan failed', { query: q, error: String(e) })
      }
    }
    heartbeat(db, 'scanner-browser', 'ok')
    await sleep(intervalMs)
  }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }
