import type Database from 'better-sqlite3'

export interface CustomerAccount {
  id: number
  handle: string
  displayName: string | null
  addedAt: number
  source: string
  notes: string | null
  enabled: boolean
}

export interface InsertCustomerInput {
  handle: string
  displayName?: string | null
  source?: string
  notes?: string | null
  enabled?: boolean
}

function rowToCustomer(r: any): CustomerAccount {
  return {
    id: r.id,
    handle: r.handle,
    displayName: r.display_name ?? null,
    addedAt: r.added_at,
    source: r.source,
    notes: r.notes ?? null,
    enabled: !!r.enabled,
  }
}

export function customersRepo(db: Database.Database) {
  return {
    insert(c: InsertCustomerInput): number {
      const existing = db.prepare(`SELECT id FROM customer_accounts WHERE handle = ?`).get(c.handle) as { id: number } | undefined
      if (existing) return existing.id
      const info = db.prepare(`
        INSERT INTO customer_accounts (handle, display_name, added_at, source, notes, enabled)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        c.handle,
        c.displayName ?? null,
        Date.now(),
        c.source ?? 'manual',
        c.notes ?? null,
        c.enabled !== false ? 1 : 0,
      )
      return Number(info.lastInsertRowid)
    },

    listEnabled(): CustomerAccount[] {
      const rows = db.prepare(`SELECT * FROM customer_accounts WHERE enabled = 1 ORDER BY id`).all() as any[]
      return rows.map(rowToCustomer)
    },

    list(): CustomerAccount[] {
      const rows = db.prepare(`SELECT * FROM customer_accounts ORDER BY id`).all() as any[]
      return rows.map(rowToCustomer)
    },

    findByHandle(handle: string): CustomerAccount | null {
      const r = db.prepare(`SELECT * FROM customer_accounts WHERE handle = ?`).get(handle) as any
      if (!r) return null
      return rowToCustomer(r)
    },

    setEnabled(id: number, enabled: boolean): void {
      db.prepare(`UPDATE customer_accounts SET enabled = ? WHERE id = ?`).run(enabled ? 1 : 0, id)
    },
  }
}
