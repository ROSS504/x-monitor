import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { migrate } from '../src/migrate.js'
import { postsRepo } from '../src/repos/posts.js'
import { draftsRepo } from '../src/repos/drafts.js'

function seedAccount(db: Database.Database): number {
  const info = db.prepare(`
    INSERT INTO accounts (handle, role, cookies_path, daily_limit, min_interval_min, business_hours_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run('alice', 'official', '/tmp/cookies.json', 30, 15, JSON.stringify({ startHour: 9, endHour: 18, tz: 'UTC' }))
  return Number(info.lastInsertRowid)
}

function seedPost(db: Database.Database, tweetId: string): number {
  return postsRepo(db).insert({
    tweetId, authorHandle: 'bob', text: 'hello',
    postedAt: 1000, lang: 'en', source: 'browser',
    scenarioHint: null, status: 'discovered', traceId: 'abc',
  })
}

describe('draftsRepo', () => {
  let db: Database.Database
  beforeEach(() => { db = new Database(':memory:'); migrate(db) })
  afterEach(() => { db.close() })

  it('insert + findById round-trips', () => {
    const accountId = seedAccount(db)
    const postId = seedPost(db, '111')
    const id = draftsRepo(db).insert({
      postId, accountId, content: 'reply text',
      format: 'single', citations: [{ chunkId: 'c1', quote: 'q1' }],
      strategy: 'casual', status: 'pending', idempotencyKey: 'idem-1',
    })
    const d = draftsRepo(db).findById(id)
    expect(d?.postId).toBe(postId)
    expect(d?.accountId).toBe(accountId)
    expect(d?.content).toBe('reply text')
    expect(d?.format).toBe('single')
    expect(d?.citations).toEqual([{ chunkId: 'c1', quote: 'q1' }])
    expect(d?.strategy).toBe('casual')
    expect(d?.status).toBe('pending')
    expect(d?.idempotencyKey).toBe('idem-1')
  })

  it('listByStatus filters correctly', () => {
    const accountId = seedAccount(db)
    const postId = seedPost(db, '111')
    const a = draftsRepo(db).insert({
      postId, accountId, content: 'p1', format: 'single', citations: [],
      strategy: null, status: 'pending', idempotencyKey: 'k1',
    })
    const b = draftsRepo(db).insert({
      postId, accountId, content: 'p2', format: 'single', citations: [],
      strategy: null, status: 'approved', idempotencyKey: 'k2',
    })
    const pending = draftsRepo(db).listByStatus('pending')
    const approved = draftsRepo(db).listByStatus('approved')
    expect(pending.map(d => d.id)).toEqual([a])
    expect(approved.map(d => d.id)).toEqual([b])
  })

  it('updateStatus changes status', () => {
    const accountId = seedAccount(db)
    const postId = seedPost(db, '111')
    const id = draftsRepo(db).insert({
      postId, accountId, content: 'x', format: 'single', citations: [],
      strategy: null, status: 'pending', idempotencyKey: 'k1',
    })
    draftsRepo(db).updateStatus(id, 'approved')
    expect(draftsRepo(db).findById(id)?.status).toBe('approved')
  })
})
