import type Database from 'better-sqlite3'

interface LogAuditInput {
  actor: string
  action: string
  targetType?: string | null
  targetId?: number | null
  payload?: unknown
  traceId?: string | null
}

export interface AuditRow {
  id: number
  actor: string
  action: string
  targetType: string | null
  targetId: number | null
  payload: unknown
  traceId: string | null
  at: number
}

function rowToAudit(r: any): AuditRow {
  return {
    id: r.id,
    actor: r.actor,
    action: r.action,
    targetType: r.target_type ?? null,
    targetId: r.target_id ?? null,
    payload: r.payload_json ? JSON.parse(r.payload_json) : null,
    traceId: r.trace_id ?? null,
    at: r.at,
  }
}

export function auditRepo(db: Database.Database) {
  return {
    log(entry: LogAuditInput): number {
      const info = db.prepare(`
        INSERT INTO audit_log (actor, action, target_type, target_id, payload_json, trace_id, at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        entry.actor,
        entry.action,
        entry.targetType ?? null,
        entry.targetId ?? null,
        JSON.stringify(entry.payload ?? null),
        entry.traceId ?? null,
        Date.now(),
      )
      return Number(info.lastInsertRowid)
    },

    recent(limit = 100): AuditRow[] {
      const rows = db.prepare(`SELECT * FROM audit_log ORDER BY at DESC, id DESC LIMIT ?`).all(limit) as any[]
      return rows.map(rowToAudit)
    },
  }
}
