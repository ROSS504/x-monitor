import { describe, it, expect, beforeEach, afterEach, afterAll, beforeAll } from 'vitest'

beforeAll(() => { process.env.POSTER_PART_DELAY_MS = '0' })
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

  it('external-queue thread quotes source as first part, then chains replies', async () => {
    const postId = postsRepo(db).insert({
      tweetId: 'src-thread', authorHandle: 'someone', text: 'topic', postedAt: 2000, lang: 'en',
      source: 'browser', scenarioHint: null, status: 'matched_article', traceId: 'tr2',
    })
    const draftId = draftsRepo(db).insert({
      postId, accountId: 1,
      content: 'Part one of the thread.\n\nPart two with more detail.\n\nPart three closes it.',
      format: 'thread', citations: [], strategy: 'external-queue',
      status: 'approved', idempotencyKey: 'k-thread', promptVersion: 'v1',
    })
    const r = await sendOne(db, xc, draftId)
    expect(r.partsSent).toBe(3)
    expect(xc.posted).toHaveLength(3)
    // First part is a quote-tweet of the source URL (NOT a reply)
    expect(xc.posted[0].kind).toBe('quote')
    expect(xc.posted[0].quotedSourceUrl).toBe('https://x.com/someone/status/src-thread')
    expect(xc.posted[0].replyToTweetId).toBe('')
    // Follow-up parts reply to the previous part to form a nested thread
    expect(xc.posted[1].kind).toBe('reply')
    expect(xc.posted[1].replyToTweetId).toBe(xc.posted[0].tweetId)
    expect(xc.posted[2].kind).toBe('reply')
    expect(xc.posted[2].replyToTweetId).toBe(xc.posted[1].tweetId)
    const sent = sentRepo(db).findByDraftId(draftId)
    expect(sent?.tweetId).toBe(xc.posted[0].tweetId)
    expect(draftsRepo(db).findById(draftId)?.status).toBe('sent')
  })

  it('thread auto-splits a part that exceeds 280 chars', async () => {
    const postId = postsRepo(db).insert({
      tweetId: 'src-long', authorHandle: 'c', text: 'topic', postedAt: 3000, lang: 'en',
      source: 'browser', scenarioHint: null, status: 'matched_article', traceId: 'tr3',
    })
    // 350-char paragraph (exceeds 280) — should split into 2
    const long = ('word '.repeat(70)).trim()
    const draftId = draftsRepo(db).insert({
      postId, accountId: 1, content: long,
      format: 'thread', citations: [], strategy: 'external-queue',
      status: 'approved', idempotencyKey: 'k-long', promptVersion: 'v1',
    })
    const r = await sendOne(db, xc, draftId)
    expect(r.partsSent).toBeGreaterThanOrEqual(2)
    for (const p of xc.posted.slice(-r.partsSent!)) {
      expect(p.content.length).toBeLessThanOrEqual(280)
    }
  })
})
