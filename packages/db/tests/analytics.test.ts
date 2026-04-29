import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { migrate } from '../src/migrate.js'
import { accountsRepo, postsRepo, draftsRepo, sentRepo } from '../src/index.js'
import { analyticsRepo } from '../src/repos/analytics.js'

describe('analyticsRepo', () => {
  let db: Database.Database
  let sentId: number
  beforeEach(() => {
    db = new Database(':memory:'); migrate(db)
    accountsRepo(db).insert({
      handle: 'a1', role: 'official', cookiesPath: '/tmp/c',
      dailyLimit: 30, minIntervalMin: 15,
      businessHours: { startHour: 9, endHour: 23, tz: 'Asia/Shanghai' },
      cooldownUntil: null,
    })
    const postId = postsRepo(db).insert({
      tweetId: 'orig-1', authorHandle: 'x', text: 'x',
      postedAt: 1000, lang: 'en', source: 'browser',
      scenarioHint: null, status: 'matched_article', traceId: 'tr',
    })
    const draftId = draftsRepo(db).insert({
      postId, accountId: 1, content: 'reply',
      format: 'single', citations: [], strategy: 'article-match',
      status: 'sent', idempotencyKey: 'k', promptVersion: 'v',
    })
    sentId = sentRepo(db).insert({ draftId, tweetId: 'sent-1', accountId: 1, sentAt: Date.now() })
  })
  afterEach(() => { db.close() })

  it('upserts and lists analytics by bucket', () => {
    analyticsRepo(db).upsert({ sentId, bucket: '1h', likes: 10, retweets: 2, replies: 1, bookmarks: 3 })
    analyticsRepo(db).upsert({ sentId, bucket: '24h', likes: 50, retweets: 8, replies: 4, bookmarks: 12 })
    const rows = analyticsRepo(db).listForSent(sentId)
    expect(rows).toHaveLength(2)
    expect(rows.map(r => r.bucket).sort()).toEqual(['1h', '24h'])
    expect(analyticsRepo(db).get(sentId, '1h')?.likes).toBe(10)
  })

  it('upsert overwrites same (sentId, bucket)', () => {
    analyticsRepo(db).upsert({ sentId, bucket: '1h', likes: 5, retweets: 0, replies: 0, bookmarks: 0 })
    analyticsRepo(db).upsert({ sentId, bucket: '1h', likes: 12, retweets: 1, replies: 1, bookmarks: 2 })
    expect(analyticsRepo(db).listForSent(sentId)).toHaveLength(1)
    expect(analyticsRepo(db).get(sentId, '1h')?.likes).toBe(12)
  })
})
