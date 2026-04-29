import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { migrate, postsRepo } from '@x-monitor/db'
import type { ThirdPartySearchClient } from '@x-monitor/x-thirdparty'
import { runOneThirdPartyScan } from '../src/scan.js'

function fakeClient(name: string, items: Array<{ tweetId: string; authorHandle: string; text: string; postedAt: number; lang: string }>): ThirdPartySearchClient {
  return {
    name,
    async search() { return items },
  }
}

describe('runOneThirdPartyScan', () => {
  let db: Database.Database
  beforeEach(() => { db = new Database(':memory:'); migrate(db) })
  afterEach(() => { db.close() })

  it('inserts new posts with source=3rdparty and skips dupes', async () => {
    const c = fakeClient('apify', [
      { tweetId: 't1', authorHandle: 'a', text: 'staking', postedAt: Date.now(), lang: 'en' },
    ])
    const enq: number[] = []
    const r1 = await runOneThirdPartyScan({ db, client: c, query: 'staking', enqueue: id => enq.push(id) })
    expect(r1.new).toBe(1)
    expect(r1.source).toBe('apify')
    expect(postsRepo(db).findById(1)?.source).toBe('3rdparty')
    expect(enq).toHaveLength(1)
    const r2 = await runOneThirdPartyScan({ db, client: c, query: 'staking', enqueue: id => enq.push(id) })
    expect(r2.new).toBe(0)
    expect(enq).toHaveLength(1)
  })
})
