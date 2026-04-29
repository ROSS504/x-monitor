import type Database from 'better-sqlite3'
import type { ThirdPartySearchClient } from '@x-monitor/x-thirdparty'
import type { Logger } from '@x-monitor/observability'
import { postsRepo } from '@x-monitor/db'
import { aiTasksQ, getNetStatus } from '@x-monitor/queue'
import { heartbeat } from '@x-monitor/observability'
import { runOneThirdPartyScan } from './scan.js'

export interface LoopOptions {
  db: Database.Database
  client: ThirdPartySearchClient
  log: Logger
  queries: string[]
  intervalMs: number
  /** Only kick in if the latest post is older than this. Default 30 min. */
  triggerAgeMs?: number
}

export async function runLoop(o: LoopOptions): Promise<void> {
  const triggerAge = o.triggerAgeMs ?? 30 * 60_000
  while (true) {
    const status = await getNetStatus()
    if (status === 'DOWN') {
      o.log.warn('skipping 3rdparty scan, network DOWN', { status })
      await sleep(o.intervalMs)
      continue
    }
    const last = postsRepo(o.db).latestCreatedAt()
    const stale = last === null || (Date.now() - last) > triggerAge
    if (!stale) {
      o.log.info('skipping 3rdparty scan: primary scanner is fresh', { lastPostAgeMs: last !== null ? Date.now() - last : null })
      heartbeat(o.db, 'scanner-3rdparty', 'ok')
      await sleep(o.intervalMs)
      continue
    }
    for (const q of o.queries) {
      try {
        const r = await runOneThirdPartyScan({
          db: o.db,
          client: o.client,
          query: q,
          enqueue: (id) => { aiTasksQ.add('analyze', { postId: id, traceId: String(id) }) },
        })
        o.log.info('3rdparty-scanned', { query: q, ...r })
      } catch (e) {
        o.log.error('3rdparty scan failed', { query: q, error: String(e) })
      }
    }
    heartbeat(o.db, 'scanner-3rdparty', 'ok')
    await sleep(o.intervalMs)
  }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }
