import type Database from 'better-sqlite3'

interface LogAuditInput {
  actor: string
  action: string
  targetType?: string | null
  targetId?: number | null
  payload?: unknown
  traceId?: string | null
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
  }
}
