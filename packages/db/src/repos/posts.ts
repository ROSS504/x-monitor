import type Database from 'better-sqlite3'
import type { Post, PostStatus } from '@x-monitor/core'

interface InsertPostInput {
  tweetId: string; authorHandle: string; text: string
  postedAt: number; lang: string; source: 'browser' | '3rdparty'
  scenarioHint: string | null; status: PostStatus; traceId: string
}

export function postsRepo(db: Database.Database) {
  return {
    insert(p: InsertPostInput): number {
      const existing = db.prepare(`SELECT id FROM posts WHERE tweet_id = ?`).get(p.tweetId) as { id: number } | undefined
      if (existing) return existing.id
      const stmt = db.prepare(`
        INSERT INTO posts (tweet_id, author_handle, text, posted_at, lang, source, scenario_hint, status, trace_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      const info = stmt.run(p.tweetId, p.authorHandle, p.text, p.postedAt, p.lang, p.source, p.scenarioHint, p.status, p.traceId, Date.now())
      return Number(info.lastInsertRowid)
    },

    findById(id: number): Post | null {
      const r = db.prepare(`SELECT * FROM posts WHERE id = ?`).get(id) as any
      if (!r) return null
      return {
        id: r.id, tweetId: r.tweet_id, authorHandle: r.author_handle,
        text: r.text, postedAt: r.posted_at, lang: r.lang, source: r.source,
        scenarioHint: r.scenario_hint, status: r.status, traceId: r.trace_id,
      }
    },

    updateStatus(id: number, status: PostStatus): void {
      db.prepare(`UPDATE posts SET status = ? WHERE id = ?`).run(status, id)
    },
  }
}
