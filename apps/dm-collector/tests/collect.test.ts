import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { migrate, accountsRepo, postsRepo, draftsRepo, sentRepo, dmsRepo } from '@x-monitor/db'
import { createDryRunClient } from '@x-monitor/x-client'
import { collectForAccount } from '../src/collect.js'

describe('collectForAccount', () => {
  let db: Database.Database
  let accountId: number
  beforeEach(() => {
    db = new Database(':memory:'); migrate(db)
    accountId = accountsRepo(db).insert({
      handle: 'FinTax_Official', role: 'official', cookiesPath: '/tmp/c',
      dailyLimit: 30, minIntervalMin: 15,
      businessHours: { startHour: 9, endHour: 23, tz: 'Asia/Shanghai' },
      cooldownUntil: null,
    })
  })
  afterEach(() => { db.close() })

  it('inserts new DMs and dedupes on rerun', async () => {
    const xc = createDryRunClient()
    xc.seedDMs([
      { conversationId: 'c1', messageId: 'm1', senderHandle: 'alice', text: 'hi', sentAt: Date.now() - 1000 },
    ])
    const r1 = await collectForAccount({ db, accountId, xc })
    expect(r1.inserted).toBe(1)
    const r2 = await collectForAccount({ db, accountId, xc })
    expect(r2.fetched).toBe(1)
    expect(r2.inserted).toBe(0)
  })

  it('attributes a DM to the matching sent reply', async () => {
    const postId = postsRepo(db).insert({
      tweetId: 'orig-1', authorHandle: 'alice', text: 'a question',
      postedAt: 1000, lang: 'en', source: 'browser',
      scenarioHint: null, status: 'matched_article', traceId: 'tr',
    })
    const draftId = draftsRepo(db).insert({
      postId, accountId, content: 'reply',
      format: 'single', citations: [], strategy: 'article-match',
      status: 'sent', idempotencyKey: 'k', promptVersion: 'v',
    })
    const sentId = sentRepo(db).insert({ draftId, tweetId: 'sent-1', accountId, sentAt: Date.now() - 3600_000 })

    const xc = createDryRunClient()
    xc.seedDMs([
      { conversationId: 'c-alice', messageId: 'm-alice', senderHandle: 'alice', text: 'thanks!', sentAt: Date.now() - 1000 },
      { conversationId: 'c-bob', messageId: 'm-bob', senderHandle: 'bob', text: 'random', sentAt: Date.now() - 1000 },
    ])
    const r = await collectForAccount({ db, accountId, xc })
    expect(r.inserted).toBe(2)
    expect(r.attributed).toBe(1)
    const aliceDm = dmsRepo(db).list().find(d => d.senderHandle === 'alice')
    const bobDm = dmsRepo(db).list().find(d => d.senderHandle === 'bob')
    expect(aliceDm?.attributedSentId).toBe(sentId)
    expect(bobDm?.attributedSentId).toBeNull()
  })
})
