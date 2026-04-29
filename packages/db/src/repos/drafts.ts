import type Database from 'better-sqlite3'
import type { Draft, DraftStatus } from '@x-monitor/core'

export interface InsertDraftInput {
  postId: number
  accountId: number
  content: string
  format: 'single' | 'thread' | 'quote'
  citations: { chunkId: string; quote: string }[]
  strategy: string | null
  status: DraftStatus
  idempotencyKey: string
  promptVersion?: string | null
}

function rowToDraft(r: any): Draft {
  return {
    id: r.id,
    postId: r.post_id,
    accountId: r.account_id,
    content: r.content,
    format: r.format,
    citations: JSON.parse(r.citations_json),
    strategy: r.strategy,
    status: r.status,
    idempotencyKey: r.idempotency_key,
  }
}

export function draftsRepo(db: Database.Database) {
  return {
    insert(d: InsertDraftInput): number {
      const stmt = db.prepare(`
        INSERT INTO drafts (post_id, account_id, content, format, citations_json, strategy, status, idempotency_key, created_at, prompt_version)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      const info = stmt.run(
        d.postId, d.accountId, d.content, d.format,
        JSON.stringify(d.citations), d.strategy, d.status, d.idempotencyKey, Date.now(),
        d.promptVersion ?? null,
      )
      return Number(info.lastInsertRowid)
    },

    findById(id: number): Draft | null {
      const r = db.prepare(`SELECT * FROM drafts WHERE id = ?`).get(id) as any
      if (!r) return null
      return rowToDraft(r)
    },

    listByStatus(status: DraftStatus): Draft[] {
      const rows = db.prepare(`SELECT * FROM drafts WHERE status = ? ORDER BY id`).all(status) as any[]
      return rows.map(rowToDraft)
    },

    updateStatus(id: number, status: DraftStatus): void {
      db.prepare(`UPDATE drafts SET status = ? WHERE id = ?`).run(status, id)
    },

    listPendingForUI(): Draft[] {
      const rows = db.prepare(`SELECT * FROM drafts WHERE status = 'pending' ORDER BY created_at DESC, id DESC`).all() as any[]
      return rows.map(rowToDraft)
    },
  }
}
