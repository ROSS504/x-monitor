import type Database from 'better-sqlite3'

interface InsertSentInput {
  draftId: number
  tweetId: string
  accountId: number
  sentAt: number
}

export interface SentRow {
  id: number
  draftId: number
  tweetId: string
  accountId: number
  sentAt: number
}

function rowToSent(r: any): SentRow {
  return {
    id: r.id,
    draftId: r.draft_id,
    tweetId: r.tweet_id,
    accountId: r.account_id,
    sentAt: r.sent_at,
  }
}

export function sentRepo(db: Database.Database) {
  return {
    insert(s: InsertSentInput): number {
      const info = db.prepare(`
        INSERT INTO sent (draft_id, tweet_id, account_id, sent_at)
        VALUES (?, ?, ?, ?)
      `).run(s.draftId, s.tweetId, s.accountId, s.sentAt)
      return Number(info.lastInsertRowid)
    },

    findByTweetId(tweetId: string): SentRow | null {
      const r = db.prepare(`SELECT * FROM sent WHERE tweet_id = ?`).get(tweetId) as any
      if (!r) return null
      return rowToSent(r)
    },

    findByDraftId(draftId: number): SentRow | null {
      const r = db.prepare(`SELECT * FROM sent WHERE draft_id = ?`).get(draftId) as any
      if (!r) return null
      return rowToSent(r)
    },
  }
}
