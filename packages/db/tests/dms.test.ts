import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { migrate } from '../src/migrate.js'
import { accountsRepo, postsRepo, draftsRepo, sentRepo } from '../src/index.js'
import { dmsRepo } from '../src/repos/dms.js'

describe('dmsRepo', () => {
  let db: Database.Database
  let accountId: number
  beforeEach(() => {
    db = new Database(':memory:'); migrate(db)
    accountId = accountsRepo(db).insert({
      handle: 'a1', role: 'official', cookiesPath: '/tmp/c',
      dailyLimit: 30, minIntervalMin: 15,
      businessHours: { startHour: 9, endHour: 23, tz: 'Asia/Shanghai' },
      cooldownUntil: null,
    })
  })
  afterEach(() => { db.close() })

  it('insertIfNew round-trips and dedupes by messageId', () => {
    const id = dmsRepo(db).insertIfNew({
      accountId, conversationId: 'c1', senderHandle: 'alice',
      messageId: 'm1', text: 'hi', sentAt: 1000,
    })
    expect(id).toBeGreaterThan(0)
    const dup = dmsRepo(db).insertIfNew({
      accountId, conversationId: 'c1', senderHandle: 'alice',
      messageId: 'm1', text: 'hi', sentAt: 1000,
    })
    expect(dup).toBeNull()
    expect(dmsRepo(db).listForAccount(accountId)).toHaveLength(1)
  })

  it('listForAccount sorts newest first', () => {
    dmsRepo(db).insertIfNew({ accountId, conversationId: 'c1', senderHandle: 'a', messageId: 'm-old', text: 'x', sentAt: 1000 })
    dmsRepo(db).insertIfNew({ accountId, conversationId: 'c1', senderHandle: 'a', messageId: 'm-new', text: 'y', sentAt: 2000 })
    const rows = dmsRepo(db).listForAccount(accountId)
    expect(rows[0].messageId).toBe('m-new')
    expect(rows[1].messageId).toBe('m-old')
  })

  it('listForSent filters by attribution', () => {
    const postId = postsRepo(db).insert({
      tweetId: 'orig-1', authorHandle: 'a', text: 'x',
      postedAt: 1000, lang: 'en', source: 'browser',
      scenarioHint: null, status: 'matched_article', traceId: 'tr',
    })
    const draftId = draftsRepo(db).insert({
      postId, accountId, content: 'reply',
      format: 'single', citations: [], strategy: 'article-match',
      status: 'sent', idempotencyKey: 'k', promptVersion: 'v',
    })
    const sentId = sentRepo(db).insert({ draftId, tweetId: 'sent-1', accountId, sentAt: 1500 })
    dmsRepo(db).insertIfNew({ accountId, conversationId: 'c1', senderHandle: 'a', messageId: 'm1', text: 'x', sentAt: 1000, attributedSentId: sentId })
    dmsRepo(db).insertIfNew({ accountId, conversationId: 'c1', senderHandle: 'a', messageId: 'm2', text: 'y', sentAt: 2000 })
    expect(dmsRepo(db).listForSent(sentId)).toHaveLength(1)
    expect(dmsRepo(db).listForSent(99999)).toHaveLength(0)
  })
})
