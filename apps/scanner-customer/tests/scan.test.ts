import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { migrate, customersRepo, postsRepo } from '@x-monitor/db'
import { createDryRunClient } from '@x-monitor/x-client'
import { runCustomerScan } from '../src/scan.js'

describe('runCustomerScan', () => {
  let db: Database.Database
  beforeEach(() => {
    db = new Database(':memory:'); migrate(db)
    customersRepo(db).insert({ handle: 'alice_corp', displayName: 'Alice Corp' })
    customersRepo(db).insert({ handle: 'bob_co', displayName: 'Bob Co', enabled: false })
  })
  afterEach(() => { db.close() })

  it('skips disabled customers and inserts posts for enabled ones', async () => {
    const xc = createDryRunClient([
      { tweetId: 'cust-1', authorHandle: 'alice_corp', text: 'considering crypto accounting', postedAt: Date.now(), lang: 'en' },
    ])
    const enqueued: number[] = []
    const r = await runCustomerScan({ db, xc, enqueue: id => enqueued.push(id) })
    expect(r.customers).toBe(1)
    expect(r.new).toBe(1)
    expect(enqueued).toHaveLength(1)
    expect(postsRepo(db).findById(1)?.scenarioHint).toBe('customer:alice_corp')
  })

  it('filters out posts older than 2 days', async () => {
    const tooOld = Date.now() - 3 * 24 * 3600_000
    const xc = createDryRunClient([
      { tweetId: 'old-1', authorHandle: 'alice_corp', text: 'old post', postedAt: tooOld, lang: 'en' },
    ])
    const enqueued: number[] = []
    const r = await runCustomerScan({ db, xc, enqueue: id => enqueued.push(id) })
    expect(r.new).toBe(0)
    expect(enqueued).toHaveLength(0)
  })

  it('does not duplicate already-known posts', async () => {
    const seed = [
      { tweetId: 'cust-2', authorHandle: 'alice_corp', text: 'first post', postedAt: Date.now(), lang: 'en' },
    ]
    const xc = createDryRunClient(seed)
    await runCustomerScan({ db, xc, enqueue: () => {} })
    const r2 = await runCustomerScan({ db, xc, enqueue: () => {} })
    expect(r2.new).toBe(0)
  })
})
