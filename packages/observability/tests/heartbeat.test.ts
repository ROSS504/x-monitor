import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { migrate, healthRepo } from '@x-monitor/db'
import { heartbeat } from '../src/heartbeat.js'

describe('heartbeat', () => {
  let db: Database.Database
  beforeEach(() => { db = new Database(':memory:'); migrate(db) })
  afterEach(() => { db.close() })

  it('upserts a row in system_health', () => {
    heartbeat(db, 'scanner-browser', 'ok')
    const r = healthRepo(db).get('scanner-browser')
    expect(r?.status).toBe('ok')
    expect(r?.lastHeartbeat).toBeGreaterThan(Date.now() - 1000)
  })
})
