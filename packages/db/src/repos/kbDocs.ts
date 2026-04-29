import type Database from 'better-sqlite3'

export interface KbDocumentRow {
  id: number
  difyDocId: string
  name: string
  wordCount: number
  hitCount: number
  enabled: boolean
  indexingStatus: string | null
  dataSourceType: string | null
  difyCreatedAt: number
  lastSyncedAt: number
}

export interface UpsertKbDocInput {
  difyDocId: string
  name: string
  wordCount: number
  hitCount: number
  enabled: boolean
  indexingStatus?: string | null
  dataSourceType?: string | null
  difyCreatedAt: number
}

function rowToKbDoc(r: any): KbDocumentRow {
  return {
    id: r.id,
    difyDocId: r.dify_doc_id,
    name: r.name,
    wordCount: r.word_count,
    hitCount: r.hit_count,
    enabled: !!r.enabled,
    indexingStatus: r.indexing_status ?? null,
    dataSourceType: r.data_source_type ?? null,
    difyCreatedAt: r.dify_created_at,
    lastSyncedAt: r.last_synced_at,
  }
}

export function kbDocsRepo(db: Database.Database) {
  return {
    upsert(d: UpsertKbDocInput): number {
      const info = db.prepare(`
        INSERT INTO kb_documents (dify_doc_id, name, word_count, hit_count, enabled, indexing_status, data_source_type, dify_created_at, last_synced_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(dify_doc_id) DO UPDATE SET
          name = excluded.name,
          word_count = excluded.word_count,
          hit_count = excluded.hit_count,
          enabled = excluded.enabled,
          indexing_status = excluded.indexing_status,
          data_source_type = excluded.data_source_type,
          dify_created_at = excluded.dify_created_at,
          last_synced_at = excluded.last_synced_at
      `).run(
        d.difyDocId, d.name, d.wordCount, d.hitCount,
        d.enabled ? 1 : 0,
        d.indexingStatus ?? null, d.dataSourceType ?? null,
        d.difyCreatedAt, Date.now(),
      )
      return Number(info.lastInsertRowid)
    },

    list(): KbDocumentRow[] {
      const rows = db.prepare(`SELECT * FROM kb_documents ORDER BY dify_created_at DESC`).all() as any[]
      return rows.map(rowToKbDoc)
    },

    findByDifyId(id: string): KbDocumentRow | null {
      const r = db.prepare(`SELECT * FROM kb_documents WHERE dify_doc_id = ?`).get(id) as any
      if (!r) return null
      return rowToKbDoc(r)
    },

    count(): number {
      const r = db.prepare(`SELECT COUNT(*) AS c FROM kb_documents`).get() as { c: number }
      return r.c
    },
  }
}
