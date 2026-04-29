import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest'
import Database from 'better-sqlite3'
import { migrate, accountsRepo, postsRepo, draftsRepo, sentRepo } from '@x-monitor/db'
import { createDryRunClient } from '@x-monitor/x-client'
import { analyticsTasksQ, connection } from '@x-monitor/queue'
import { sendOne } from '../src/post.js'

afterAll(async () => { await connection.quit() })

describe('sendOne', () => {
  let db: Database.Database
  let xc: ReturnType<typeof createDryRunClient>
  beforeEach(() => {
    db = new Database(':memory:'); migrate(db)
    accountsRepo(db).insert({
      handle: 'FinTax_Official', role: 'official', cookiesPath: '/tmp/c.json',
      dailyLimit: 30, minIntervalMin: 15,
      businessHours: { startHour: 9, endHour: 23, tz: 'Asia/Shanghai' },
      cooldownUntil: null,
    })
    const postId = postsRepo(db).insert({
      tweetId: 't1', authorHandle: 'a', text: 'x', postedAt: 1000, lang: 'en',
      source: 'browser', scenarioHint: null, status: 'matched_article', traceId: 'tr',
    })
    draftsRepo(db).insert({
      postId, accountId: 1, content: 'reply',
      format: 'single', citations: [], strategy: null,
      status: 'approved', idempotencyKey: 'k', promptVersion: 'v1',
    })
    xc = createDryRunClient()
  })
  afterEach(async () => {
    await analyticsTasksQ.obliterate({ force: true }).catch(() => {})
    db.close()
  })

  it('posts and writes sent row', async () => {
    const r = await sendOne(db, xc, 1)
    expect(r.tweetId).toMatch(/^dry-/)
    expect(sentRepo(db).findByDraftId(1)).not.toBeNull()
    expect(draftsRepo(db).findById(1)?.status).toBe('sent')
  })

  it('is idempotent: running twice does not double-post', async () => {
    await sendOne(db, xc, 1)
    await sendOne(db, xc, 1)
    expect(xc.posted).toHaveLength(1)
    expect(sentRepo(db).findByDraftId(1)).not.toBeNull()
  })
})
