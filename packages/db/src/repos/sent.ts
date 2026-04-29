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

    findLastForAccount(accountId: number): SentRow | null {
      const r = db.prepare(`
        SELECT * FROM sent WHERE account_id = ? ORDER BY sent_at DESC LIMIT 1
      `).get(accountId) as any
      if (!r) return null
      return rowToSent(r)
    },

    countTodayForAccount(accountId: number, now: number): number {
      const dayStart = new Date(now)
      dayStart.setUTCHours(0, 0, 0, 0)
      const startMs = dayStart.getTime()
      const r = db.prepare(`
        SELECT COUNT(*) AS c FROM sent WHERE account_id = ? AND sent_at >= ?
      `).get(accountId, startMs) as { c: number }
      return r.c
    },
  }
}
