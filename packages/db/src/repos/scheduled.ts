import type Database from 'better-sqlite3'

interface UpsertScheduledInput {
  draftId: number
  accountId: number
  targetSendAt: number
  priority?: number
}

export interface ScheduledRow {
  draftId: number
  accountId: number
  targetSendAt: number
  priority: number
}

function rowToScheduled(r: any): ScheduledRow {
  return {
    draftId: r.draft_id,
    accountId: r.account_id,
    targetSendAt: r.target_send_at,
    priority: r.priority,
  }
}

export function scheduledRepo(db: Database.Database) {
  return {
    upsert(s: UpsertScheduledInput): void {
      db.prepare(`
        INSERT INTO scheduled (draft_id, account_id, target_send_at, priority)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(draft_id) DO UPDATE SET
          account_id = excluded.account_id,
          target_send_at = excluded.target_send_at,
          priority = excluded.priority
      `).run(s.draftId, s.accountId, s.targetSendAt, s.priority ?? 0)
    },

    findReadyToSend(now: number): ScheduledRow[] {
      const rows = db.prepare(`
        SELECT * FROM scheduled
        WHERE target_send_at <= ?
        ORDER BY priority DESC, target_send_at ASC
      `).all(now) as any[]
      return rows.map(rowToScheduled)
    },

    findByDraftId(draftId: number): ScheduledRow | null {
      const r = db.prepare(`SELECT * FROM scheduled WHERE draft_id = ?`).get(draftId) as any
      if (!r) return null
      return rowToScheduled(r)
    },

    nextForAccount(accountId: number, now: number): ScheduledRow | null {
      const r = db.prepare(`
        SELECT * FROM scheduled
        WHERE account_id = ? AND target_send_at >= ?
        ORDER BY target_send_at ASC
        LIMIT 1
      `).get(accountId, now) as any
      if (!r) return null
      return rowToScheduled(r)
    },
  }
}
