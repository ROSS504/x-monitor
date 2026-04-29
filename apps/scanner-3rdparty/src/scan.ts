import type Database from 'better-sqlite3'
import type { ThirdPartySearchClient } from '@x-monitor/x-thirdparty'
import { postsRepo } from '@x-monitor/db'
import { newTraceId } from '@x-monitor/core'

export interface ScanInput {
  db: Database.Database
  client: ThirdPartySearchClient
  query: string
  enqueue: (postId: number) => void
  sinceMs?: number
}

const DEFAULT_LOOKBACK_MS = 6 * 30 * 24 * 3600_000  // 6 months for scenario 1

export async function runOneThirdPartyScan(i: ScanInput): Promise<{ source: string; found: number; new: number }> {
  const since = i.sinceMs ?? Date.now() - DEFAULT_LOOKBACK_MS
  const tweets = await i.client.search(i.query, { sinceMs: since, limit: 50 })
  let added = 0
  for (const t of tweets) {
    const before = i.db.prepare(`SELECT id FROM posts WHERE tweet_id = ?`).get(t.tweetId) as { id: number } | undefined
    if (before) continue
    const id = postsRepo(i.db).insert({
      tweetId: t.tweetId,
      authorHandle: t.authorHandle,
      text: t.text,
      postedAt: t.postedAt,
      lang: t.lang,
      source: '3rdparty',
      scenarioHint: `keyword:${i.query}`,
      status: 'discovered',
      traceId: newTraceId(),
    })
    i.enqueue(id)
    added++
  }
  return { source: i.client.name, found: tweets.length, new: added }
}
