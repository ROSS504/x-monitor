import { describe, it, expect, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { migrate } from '../src/migrate.js'

describe('migrate', () => {
  let db: Database.Database
  afterEach(() => { db?.close() })

  it('creates all expected tables', () => {
    db = new Database(':memory:')
    migrate(db)
    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as { name: string }[]
    const names = tables.map(t => t.name).sort()
    expect(names).toContain('posts')
    expect(names).toContain('drafts')
    expect(names).toContain('scheduled')
    expect(names).toContain('sent')
    expect(names).toContain('accounts')
    expect(names).toContain('audit_log')
    expect(names).toContain('dead_letter')
    expect(names).toContain('system_health')
    expect(names).toContain('post_analysis')
    expect(names).toContain('customer_accounts')
    expect(names).toContain('post_analytics')
  })

  it('is idempotent', () => {
    db = new Database(':memory:')
    migrate(db)
    migrate(db)
  })
})
