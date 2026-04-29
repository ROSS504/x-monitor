import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { migrate, accountsRepo, postsRepo, draftsRepo, scheduledRepo } from '@x-monitor/db'
import { tick } from '../src/tick.js'

describe('scheduler.tick', () => {
  let db: Database.Database
  beforeEach(() => {
    db = new Database(':memory:'); migrate(db)
    accountsRepo(db).insert({
      handle: 'FinTax_Official', role: 'official',
      cookiesPath: '/tmp/cookies.json',
      dailyLimit: 30, minIntervalMin: 15,
      businessHours: { startHour: 9, endHour: 23, tz: 'Asia/Shanghai' },
      cooldownUntil: null,
    })
    const postId = postsRepo(db).insert({
      tweetId: 't1', authorHandle: 'a', text: 'x',
      postedAt: 1000, lang: 'en', source: 'browser',
      scenarioHint: null, status: 'matched_article', traceId: 'tr1',
    })
    draftsRepo(db).insert({
      postId, accountId: 1, content: 'reply',
      format: 'single', citations: [], strategy: null,
      status: 'approved', idempotencyKey: 'k1', promptVersion: 'v1',
    })
  })
  afterEach(() => { db.close() })

  it('schedules an approved draft with no existing scheduled row', async () => {
    const enqueued: { draftId: number; delayMs: number }[] = []
    await tick({
      db,
      now: new Date('2026-04-28T10:00:00+08:00').getTime(),
      enqueue: (draftId, delayMs) => enqueued.push({ draftId, delayMs }),
    })
    const r = scheduledRepo(db).findByDraftId(1)
    expect(r).not.toBeNull()
  })

  it('does not re-schedule already scheduled drafts', async () => {
    const calls1: any[] = []
    await tick({ db, now: Date.now(), enqueue: () => calls1.push('e') })
    const before = scheduledRepo(db).findByDraftId(1)
    expect(before).not.toBeNull()
    const beforeTarget = before!.targetSendAt

    await tick({ db, now: Date.now(), enqueue: () => calls1.push('e') })
    const after = scheduledRepo(db).findByDraftId(1)
    expect(after?.targetSendAt).toBe(beforeTarget)
  })
})
