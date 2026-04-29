import type Database from 'better-sqlite3'
import type { XClient } from '@x-monitor/x-client'
import { analyticsRepo, type AnalyticsBucket } from '@x-monitor/db'

export interface SnapshotInput {
  db: Database.Database
  xc: XClient
  sentId: number
  tweetId: string
  bucket: AnalyticsBucket
}

export async function snapshot(i: SnapshotInput): Promise<{ skipped?: 'no-tweet'; saved?: boolean }> {
  const t = await i.xc.getTweet(i.tweetId)
  if (!t || !t.metrics) return { skipped: 'no-tweet' }
  analyticsRepo(i.db).upsert({
    sentId: i.sentId,
    bucket: i.bucket,
    likes: t.metrics.likes,
    retweets: t.metrics.retweets,
    replies: t.metrics.replies,
    bookmarks: t.metrics.bookmarks,
    views: t.metrics.views ?? null,
  })
  return { saved: true }
}
