import { describe, it, expect, beforeEach, afterEach, vi, afterAll } from 'vitest'
import Database from 'better-sqlite3'
import { migrate, accountsRepo, postsRepo, draftsRepo } from '@x-monitor/db'
import { aiTasksQ, connection } from '@x-monitor/queue'
import { processBatch } from '../src/batch.js'
import { searchKB } from '@x-monitor/kb-fixture'

afterAll(async () => { await connection.quit() })

describe('processBatch routes drafts by strategy', () => {
  let db: Database.Database
  const businessHours = { startHour: 9, endHour: 23, tz: 'Asia/Shanghai' }
  beforeEach(() => {
    db = new Database(':memory:')
    migrate(db)
    accountsRepo(db).insert({
      handle: 'FinTax_Official', role: 'official', cookiesPath: '/tmp/o',
      dailyLimit: 30, minIntervalMin: 15, businessHours, cooldownUntil: null,
    })
    accountsRepo(db).insert({
      handle: 'RossYu_Personal', role: 'personal', cookiesPath: '/tmp/p',
      dailyLimit: 20, minIntervalMin: 30, businessHours, cooldownUntil: null,
    })
  })
  afterEach(async () => {
    await aiTasksQ.obliterate({ force: true }).catch(() => {})
    db.close()
  })

  it('scenario-1 draft routed to official account', async () => {
    const postId = postsRepo(db).insert({
      tweetId: 'tx100', authorHandle: 'alice',
      text: 'How are crypto staking rewards taxed under IRS guidance?',
      postedAt: Date.now(), lang: 'en', source: 'browser',
      scenarioHint: 'keyword:staking', status: 'discovered', traceId: 't100',
    })
    await aiTasksQ.add('analyze', { postId, traceId: 't100' })
    const fakeRun = vi.fn(async ({ prompt }: { prompt: string }) => {
      if (prompt.includes('Classify')) {
        return { text: '{"type":"question","scenario":"1","viewpoint":"asks about staking"}', durationMs: 50 }
      }
      return {
        text: '{"content":"FMV at receipt. https://fintax.tech/staking-tax","citations":[{"chunkId":"staking-1","quote":"FMV"}]}',
        durationMs: 100,
      }
    })
    const log = { info: () => {}, warn: () => {}, error: () => {} }
    await processBatch(db, log, { runPrompt: fakeRun as any, searchKB })
    const drafts = draftsRepo(db).listByStatus('pending')
    expect(drafts).toHaveLength(1)
    const officialId = accountsRepo(db).findByHandle('FinTax_Official')!.id
    expect(drafts[0].accountId).toBe(officialId)
    expect(drafts[0].strategy).toBe('article-match')
  }, 20_000)
})
