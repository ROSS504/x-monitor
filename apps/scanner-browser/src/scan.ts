import type Database from 'better-sqlite3'
import type { XClient } from '@x-monitor/x-client'
import { postsRepo } from '@x-monitor/db'
import { newTraceId } from '@x-monitor/core'

export interface ScanInput {
  db: Database.Database
  xc: XClient
  query: string
  enqueue: (postId: number) => void
}

export async function runOneScan(i: ScanInput): Promise<{ found: number; new: number }> {
  const since = Date.now() - 6 * 30 * 24 * 3600_000
  const results = await i.xc.search(i.query, since)
  let added = 0
  for (const r of results) {
    const before = i.db.prepare(`SELECT id FROM posts WHERE tweet_id = ?`).get(r.tweetId) as { id: number } | undefined
    if (before) continue
    const id = postsRepo(i.db).insert({
      tweetId: r.tweetId, authorHandle: r.authorHandle, text: r.text,
      postedAt: r.postedAt, lang: r.lang, source: 'browser',
      scenarioHint: 'keyword:' + i.query, status: 'discovered', traceId: newTraceId(),
    })
    i.enqueue(id)
    added++
  }
  return { found: results.length, new: added }
}
