import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { migrate } from '@x-monitor/db'
import { createDryRunClient } from '@x-monitor/x-client'
import { runOneScan } from '../src/scan.js'

describe('runOneScan', () => {
  let db: Database.Database
  beforeEach(() => { db = new Database(':memory:'); migrate(db) })
  afterEach(() => { db.close() })

  it('writes new posts and skips duplicates', async () => {
    const xc = createDryRunClient([
      { tweetId: 't1', authorHandle: 'a', text: 'staking', postedAt: 1000, lang: 'en' },
    ])
    await runOneScan({ db, xc, query: 'staking', enqueue: () => {} })
    const ids = db.prepare(`SELECT id FROM posts`).all()
    expect(ids).toHaveLength(1)
    await runOneScan({ db, xc, query: 'staking', enqueue: () => {} })
    expect(db.prepare(`SELECT id FROM posts`).all()).toHaveLength(1)
  })

  it('enqueues post id for new posts', async () => {
    const xc = createDryRunClient([
      { tweetId: 't2', authorHandle: 'b', text: 'staking 2', postedAt: 1000, lang: 'en' },
    ])
    const enqueued: number[] = []
    await runOneScan({ db, xc, query: 'staking', enqueue: (id) => enqueued.push(id) })
    expect(enqueued).toHaveLength(1)
  })
})
