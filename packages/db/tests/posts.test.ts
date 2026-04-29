import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { migrate } from '../src/migrate.js'
import { postsRepo } from '../src/repos/posts.js'

describe('postsRepo', () => {
  let db: Database.Database
  beforeEach(() => { db = new Database(':memory:'); migrate(db) })
  afterEach(() => { db.close() })

  it('insert + findById round-trips', () => {
    const id = postsRepo(db).insert({
      tweetId: '123', authorHandle: 'alice', text: 'hello',
      postedAt: 1000, lang: 'en', source: 'browser',
      scenarioHint: null, status: 'discovered', traceId: 'abc',
    })
    const p = postsRepo(db).findById(id)
    expect(p?.tweetId).toBe('123')
    expect(p?.text).toBe('hello')
    expect(p?.status).toBe('discovered')
  })

  it('insert is idempotent on tweetId', () => {
    const a = postsRepo(db).insert({
      tweetId: '123', authorHandle: 'alice', text: 'hello',
      postedAt: 1000, lang: 'en', source: 'browser',
      scenarioHint: null, status: 'discovered', traceId: 'abc',
    })
    const b = postsRepo(db).insert({
      tweetId: '123', authorHandle: 'alice', text: 'hello',
      postedAt: 1000, lang: 'en', source: 'browser',
      scenarioHint: null, status: 'discovered', traceId: 'def',
    })
    expect(a).toBe(b)
  })

  it('updateStatus changes status', () => {
    const id = postsRepo(db).insert({
      tweetId: '123', authorHandle: 'alice', text: 'hello',
      postedAt: 1000, lang: 'en', source: 'browser',
      scenarioHint: null, status: 'discovered', traceId: 'abc',
    })
    postsRepo(db).updateStatus(id, 'analyzing')
    expect(postsRepo(db).findById(id)?.status).toBe('analyzing')
  })
})
