import type Database from 'better-sqlite3'

interface InsertDeadLetterInput {
  taskType: string
  payload: unknown
  lastError: string
  retryCount: number
}

export interface DeadLetterRow {
  id: number
  taskType: string
  payload: unknown
  lastError: string
  retryCount: number
  movedAt: number
}

function rowToDeadLetter(r: any): DeadLetterRow {
  return {
    id: r.id,
    taskType: r.task_type,
    payload: JSON.parse(r.payload_json),
    lastError: r.last_error,
    retryCount: r.retry_count,
    movedAt: r.moved_at,
  }
}

export function deadLetterRepo(db: Database.Database) {
  return {
    insert(d: InsertDeadLetterInput): number {
      const info = db.prepare(`
        INSERT INTO dead_letter (task_type, payload_json, last_error, retry_count, moved_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(d.taskType, JSON.stringify(d.payload), d.lastError, d.retryCount, Date.now())
      return Number(info.lastInsertRowid)
    },

    list(): DeadLetterRow[] {
      const rows = db.prepare(`SELECT * FROM dead_letter ORDER BY moved_at DESC, id DESC`).all() as any[]
      return rows.map(rowToDeadLetter)
    },

    deleteById(id: number): void {
      db.prepare(`DELETE FROM dead_letter WHERE id = ?`).run(id)
    },
  }
}
