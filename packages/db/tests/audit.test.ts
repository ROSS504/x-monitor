import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { migrate } from '../src/migrate.js'
import { auditRepo } from '../src/repos/audit.js'

describe('auditRepo', () => {
  let db: Database.Database
  beforeEach(() => { db = new Database(':memory:'); migrate(db) })
  afterEach(() => { db.close() })

  it('log + recent round-trips with payload parsing', () => {
    auditRepo(db).log({ actor: 'user', action: 'approve', targetType: 'draft', targetId: 1, payload: { reason: 'looks good' }, traceId: 't1' })
    auditRepo(db).log({ actor: 'system', action: 'send', targetType: 'sent', targetId: 5 })
    const rows = auditRepo(db).recent(10)
    expect(rows).toHaveLength(2)
    expect(rows[0].action).toBe('send')
    expect(rows[1].payload).toEqual({ reason: 'looks good' })
    expect(rows[1].traceId).toBe('t1')
  })

  it('recent respects limit', () => {
    for (let i = 0; i < 5; i++) auditRepo(db).log({ actor: 'u', action: `a${i}` })
    expect(auditRepo(db).recent(3)).toHaveLength(3)
  })
})
