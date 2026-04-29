import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { migrate, accountsRepo, postsRepo, draftsRepo, sentRepo, analyticsRepo } from '@x-monitor/db'
import { createDryRunClient } from '@x-monitor/x-client'
import { snapshot } from '../src/snapshot.js'

describe('snapshot', () => {
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

  it('writes a row when getTweet returns metrics', async () => {
    const xc = createDryRunClient([
      { tweetId: 'sent-1', authorHandle: 'a1', text: 'reply', postedAt: Date.now(), lang: 'en',
        metrics: { likes: 7, retweets: 2, replies: 1, bookmarks: 3 } },
    ])
    const r = await snapshot({ db, xc, sentId, tweetId: 'sent-1', bucket: '1h' })
    expect(r.saved).toBe(true)
    const row = analyticsRepo(db).get(sentId, '1h')
    expect(row?.likes).toBe(7)
    expect(row?.replies).toBe(1)
  })

  it('skips when tweet not found', async () => {
    const xc = createDryRunClient([])
    const r = await snapshot({ db, xc, sentId, tweetId: 'unknown', bucket: '1h' })
    expect(r.skipped).toBe('no-tweet')
    expect(analyticsRepo(db).listForSent(sentId)).toHaveLength(0)
  })
})
