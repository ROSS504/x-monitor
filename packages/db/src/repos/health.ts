import type Database from 'better-sqlite3'

export type HealthStatus = 'healthy' | 'degraded' | 'down'

export interface HealthRow {
  processName: string
  lastHeartbeat: number
  status: HealthStatus
  lastError: string | null
}

function rowToHealth(r: any): HealthRow {
  return {
    processName: r.process_name,
    lastHeartbeat: r.last_heartbeat,
    status: r.status,
    lastError: r.last_error ?? null,
  }
}

export function healthRepo(db: Database.Database) {
  return {
    heartbeat(name: string, status: HealthStatus, lastError: string | null = null): void {
      db.prepare(`
        INSERT INTO system_health (process_name, last_heartbeat, status, last_error)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(process_name) DO UPDATE SET
          last_heartbeat = excluded.last_heartbeat,
          status = excluded.status,
          last_error = excluded.last_error
      `).run(name, Date.now(), status, lastError)
    },

    all(): HealthRow[] {
      const rows = db.prepare(`SELECT * FROM system_health ORDER BY process_name`).all() as any[]
      return rows.map(rowToHealth)
    },

    get(name: string): HealthRow | null {
      const r = db.prepare(`SELECT * FROM system_health WHERE process_name = ?`).get(name) as any
      if (!r) return null
      return rowToHealth(r)
    },
  }
}
