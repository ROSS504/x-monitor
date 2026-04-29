import type Database from 'better-sqlite3'

export interface PostEngagementRow {
  id: number
  postId: number
  likes: number
  retweets: number
  replies: number
  bookmarks: number
  views: number | null
  scrapedAt: number
}

export interface InsertEngagementInput {
  postId: number
  likes: number
  retweets: number
  replies: number
  bookmarks: number
  views?: number | null
}

function rowToEngagement(r: any): PostEngagementRow {
  return {
    id: r.id,
    postId: r.post_id,
    likes: r.likes,
    retweets: r.retweets,
    replies: r.replies,
    bookmarks: r.bookmarks,
    views: r.views ?? null,
    scrapedAt: r.scraped_at,
  }
}

export function engagementRepo(db: Database.Database) {
  return {
    insert(e: InsertEngagementInput): number {
      const info = db.prepare(`
        INSERT INTO post_engagement (post_id, likes, retweets, replies, bookmarks, views, scraped_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(e.postId, e.likes, e.retweets, e.replies, e.bookmarks, e.views ?? null, Date.now())
      return Number(info.lastInsertRowid)
    },

    listForPost(postId: number): PostEngagementRow[] {
      const rows = db.prepare(`SELECT * FROM post_engagement WHERE post_id = ? ORDER BY scraped_at DESC`).all(postId) as any[]
      return rows.map(rowToEngagement)
    },

    /** Get the most recent engagement snapshot for each post in a list. */
    latestForPosts(postIds: number[]): Map<number, PostEngagementRow> {
      if (postIds.length === 0) return new Map()
      const placeholders = postIds.map(() => '?').join(',')
      const rows = db.prepare(`
        SELECT e.* FROM post_engagement e
        INNER JOIN (
          SELECT post_id, MAX(scraped_at) AS max_at
          FROM post_engagement
          WHERE post_id IN (${placeholders})
          GROUP BY post_id
        ) latest ON e.post_id = latest.post_id AND e.scraped_at = latest.max_at
      `).all(...postIds) as any[]
      const result = new Map<number, PostEngagementRow>()
      for (const r of rows) result.set(r.post_id, rowToEngagement(r))
      return result
    },
  }
}
