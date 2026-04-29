import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest'
import Database from 'better-sqlite3'
import { Queue } from 'bullmq'
import { migrate, accountsRepo, postsRepo, draftsRepo } from '@x-monitor/db'
import { connection, type AiTaskPayload } from '@x-monitor/queue'
import { processBatch } from '../src/batch.js'
import { searchKB } from '@x-monitor/kb-fixture'

describe('processBatch (integration with redis + sqlite)', () => {
  let db: Database.Database
  let queueName: string
  let q: Queue<AiTaskPayload>

  beforeEach(() => {
    db = new Database(':memory:')
    migrate(db)
    accountsRepo(db).insert({
      handle: 'FinTax_Official',
      role: 'official',
      cookiesPath: '/tmp/cookies.json',
      dailyLimit: 30,
      minIntervalMin: 15,
      businessHours: { startHour: 9, endHour: 23, tz: 'Asia/Shanghai' },
      cooldownUntil: null,
    })
    queueName = `test-ai-tasks-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    q = new Queue<AiTaskPayload>(queueName, { connection })
  })
  afterEach(async () => {
    await q.obliterate({ force: true }).catch(() => {})
    await q.close().catch(() => {})
    db.close()
  })
  afterAll(async () => {
    await connection.quit()
  })

  it('drafts a pending row when KB matches and scenario=1', async () => {
    const postId = postsRepo(db).insert({
      tweetId: 'tx1', authorHandle: 'alice',
      text: 'How are staking rewards taxed?',
      postedAt: Date.now(), lang: 'en', source: 'browser',
      scenarioHint: 'keyword:staking', status: 'discovered', traceId: 'trace-1',
    })
    await q.add('analyze', { postId, traceId: 'trace-1' })

    const fakeRun = vi.fn(async ({ prompt }: { prompt: string }) => {
      if (prompt.includes('Classify')) {
        return { text: '{"type":"question","scenario":"1","viewpoint":"staking tax"}', durationMs: 50 }
      }
      return {
        text: '{"content":"Great question. https://fintax.tech/staking-tax","citations":[{"chunkId":"staking-1","quote":"FMV"}]}',
        durationMs: 100,
      }
    })

    const log = { info: () => {}, warn: () => {}, error: () => {} }
    const r = await processBatch(db, log, { runPrompt: fakeRun as any, searchKB, queueName })
    expect(r.processed).toBeGreaterThanOrEqual(1)
    const drafts = draftsRepo(db).listByStatus('pending')
    expect(drafts).toHaveLength(1)
    expect(drafts[0].content).toContain('Great question')
  }, 20_000)

  it('drafts via synthesis when scenario=2 and KB matches', async () => {
    const postId = postsRepo(db).insert({
      tweetId: 'tx2', authorHandle: 'bob',
      text: 'DeFi tax across jurisdictions seems confusing',
      postedAt: Date.now(), lang: 'en', source: 'browser',
      scenarioHint: 'keyword:crypto', status: 'discovered', traceId: 'trace-2',
    })
    await q.add('analyze', { postId, traceId: 'trace-2' })

    const fakeRun = vi.fn(async ({ prompt }: { prompt: string }) => {
      if (prompt.includes('Classify')) {
        return { text: '{"type":"opinion","scenario":"2","viewpoint":"confused about jurisdictions"}', durationMs: 50 }
      }
      return {
        text: '{"content":"Jurisdiction varies — some require FMV reporting at receipt. https://fintax.tech/defi-tax","citations":[{"chunkId":"defi-1","quote":"varies by jurisdiction"}]}',
        durationMs: 100,
      }
    })

    const log = { info: () => {}, warn: () => {}, error: () => {} }
    const r = await processBatch(db, log, { runPrompt: fakeRun as any, searchKB, queueName })
    expect(r.processed).toBeGreaterThanOrEqual(1)
    const drafts = draftsRepo(db).listByStatus('pending')
    const synthDrafts = drafts.filter(d => d.strategy === 'kb-synthesis')
    expect(synthDrafts).toHaveLength(1)
    expect(synthDrafts[0].content).toContain('Jurisdiction')
  }, 20_000)
})
