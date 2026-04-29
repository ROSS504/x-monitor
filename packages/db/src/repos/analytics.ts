import type Database from 'better-sqlite3'

export type AnalyticsBucket = '1h' | '6h' | '24h' | '72h' | '7d'

export interface PostAnalyticsRow {
  id: number
  sentId: number
  bucket: AnalyticsBucket
  likes: number
  retweets: number
  replies: number
  bookmarks: number
  views: number | null
  collectedAt: number
}

export interface InsertAnalyticsInput {
  sentId: number
  bucket: AnalyticsBucket
  likes: number
  retweets: number
  replies: number
  bookmarks: number
  views?: number | null
}

function rowToAnalytics(r: any): PostAnalyticsRow {
  return {
    id: r.id,
    sentId: r.sent_id,
    bucket: r.bucket,
    likes: r.likes,
    retweets: r.retweets,
    replies: r.replies,
    bookmarks: r.bookmarks,
    views: r.views ?? null,
    collectedAt: r.collected_at,
  }
}

export function analyticsRepo(db: Database.Database) {
  return {
    upsert(a: InsertAnalyticsInput): number {
      const info = db.prepare(`
        INSERT INTO post_analytics (sent_id, bucket, likes, retweets, replies, bookmarks, views, collected_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(sent_id, bucket) DO UPDATE SET
          likes = excluded.likes,
          retweets = excluded.retweets,
          replies = excluded.replies,
          bookmarks = excluded.bookmarks,
          views = excluded.views,
          collected_at = excluded.collected_at
      `).run(a.sentId, a.bucket, a.likes, a.retweets, a.replies, a.bookmarks, a.views ?? null, Date.now())
      return Number(info.lastInsertRowid)
    },

    listForSent(sentId: number): PostAnalyticsRow[] {
      const rows = db.prepare(`SELECT * FROM post_analytics WHERE sent_id = ? ORDER BY collected_at`).all(sentId) as any[]
      return rows.map(rowToAnalytics)
    },

    get(sentId: number, bucket: AnalyticsBucket): PostAnalyticsRow | null {
      const r = db.prepare(`SELECT * FROM post_analytics WHERE sent_id = ? AND bucket = ?`).get(sentId, bucket) as any
      if (!r) return null
      return rowToAnalytics(r)
    },
  }
}
