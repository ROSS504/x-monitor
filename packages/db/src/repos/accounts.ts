import type Database from 'better-sqlite3'
import type { Account } from '@x-monitor/core'

export interface InsertAccountInput {
  handle: string
  role: 'official' | 'personal' | 'founder'
  cookiesPath: string
  dailyLimit: number
  minIntervalMin: number
  businessHours: { startHour: number; endHour: number; tz: string }
  cooldownUntil: number | null
}

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
    insert(a: InsertAccountInput): number {
      const stmt = db.prepare(`
        INSERT INTO accounts (handle, role, cookies_path, daily_limit, min_interval_min, business_hours_json, cooldown_until)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      const info = stmt.run(
        a.handle, a.role, a.cookiesPath, a.dailyLimit, a.minIntervalMin,
        JSON.stringify(a.businessHours), a.cooldownUntil,
      )
      return Number(info.lastInsertRowid)
    },

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
