import type Database from 'better-sqlite3'
import type { Account } from '@x-monitor/core'

function rowToAccount(r: any): Account {
  return {
    id: r.id,
    handle: r.handle,
    role: r.role,
    cookiesPath: r.cookies_path,
    dailyLimit: r.daily_limit,
    minIntervalMin: r.min_interval_min,
    businessHours: JSON.parse(r.business_hours_json),
    cooldownUntil: r.cooldown_until ?? null,
  }
}

export function accountsRepo(db: Database.Database) {
  return {
    findByHandle(handle: string): Account | null {
      const r = db.prepare(`SELECT * FROM accounts WHERE handle = ?`).get(handle) as any
      if (!r) return null
      return rowToAccount(r)
    },

    findById(id: number): Account | null {
      const r = db.prepare(`SELECT * FROM accounts WHERE id = ?`).get(id) as any
      if (!r) return null
      return rowToAccount(r)
    },

    list(): Account[] {
      const rows = db.prepare(`SELECT * FROM accounts ORDER BY id`).all() as any[]
      return rows.map(rowToAccount)
    },
  }
}
