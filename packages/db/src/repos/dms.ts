import type Database from 'better-sqlite3'

export interface DmRow {
  id: number
  accountId: number
  conversationId: string
  senderHandle: string
  messageId: string
  text: string
  sentAt: number
  attributedSentId: number | null
  collectedAt: number
}

export interface InsertDmInput {
  accountId: number
  conversationId: string
  senderHandle: string
  messageId: string
  text: string
  sentAt: number
  attributedSentId?: number | null
}

function rowToDm(r: any): DmRow {
  return {
    id: r.id,
    accountId: r.account_id,
    conversationId: r.conversation_id,
    senderHandle: r.sender_handle,
    messageId: r.message_id,
    text: r.text,
    sentAt: r.sent_at,
    attributedSentId: r.attributed_sent_id ?? null,
    collectedAt: r.collected_at,
  }
}

export function dmsRepo(db: Database.Database) {
  return {
    insertIfNew(d: InsertDmInput): number | null {
      const existing = db.prepare(`SELECT id FROM dms WHERE message_id = ?`).get(d.messageId) as { id: number } | undefined
      if (existing) return null
      const info = db.prepare(`
        INSERT INTO dms (account_id, conversation_id, sender_handle, message_id, text, sent_at, attributed_sent_id, collected_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(d.accountId, d.conversationId, d.senderHandle, d.messageId, d.text, d.sentAt, d.attributedSentId ?? null, Date.now())
      return Number(info.lastInsertRowid)
    },

    listForAccount(accountId: number, limit = 100): DmRow[] {
      const rows = db.prepare(`SELECT * FROM dms WHERE account_id = ? ORDER BY sent_at DESC LIMIT ?`).all(accountId, limit) as any[]
      return rows.map(rowToDm)
    },

    listForSent(sentId: number): DmRow[] {
      const rows = db.prepare(`SELECT * FROM dms WHERE attributed_sent_id = ? ORDER BY sent_at`).all(sentId) as any[]
      return rows.map(rowToDm)
    },

    list(limit = 100): DmRow[] {
      const rows = db.prepare(`SELECT * FROM dms ORDER BY sent_at DESC LIMIT ?`).all(limit) as any[]
      return rows.map(rowToDm)
    },
  }
}
