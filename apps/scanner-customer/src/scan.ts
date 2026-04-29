import type Database from 'better-sqlite3'
import type { XClient } from '@x-monitor/x-client'
import { postsRepo, customersRepo } from '@x-monitor/db'
import { newTraceId } from '@x-monitor/core'

export interface ScanCustomersInput {
  db: Database.Database
  xc: XClient
  enqueue: (postId: number) => void
}

const TWO_DAYS_MS = 2 * 24 * 3600_000

export async function runCustomerScan(i: ScanCustomersInput): Promise<{ customers: number; found: number; new: number }> {
  const customers = customersRepo(i.db).listEnabled()
  let found = 0
  let added = 0
  const since = Date.now() - TWO_DAYS_MS
  for (const c of customers) {
    const results = await i.xc.search(`from:${c.handle}`, since)
    found += results.length
    for (const r of results) {
      if (r.postedAt < since) continue
      const before = i.db.prepare(`SELECT id FROM posts WHERE tweet_id = ?`).get(r.tweetId) as { id: number } | undefined
      if (before) continue
      const id = postsRepo(i.db).insert({
        tweetId: r.tweetId,
        authorHandle: r.authorHandle,
        text: r.text,
        postedAt: r.postedAt,
        lang: r.lang,
        source: 'browser',
        scenarioHint: `customer:${c.handle}`,
        status: 'discovered',
        traceId: newTraceId(),
      })
      i.enqueue(id)
      added++
    }
  }
  return { customers: customers.length, found, new: added }
}
