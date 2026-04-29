import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Queue, Worker } from 'bullmq'
import { connection } from '../src/connection.js'

describe('ai-tasks queue', () => {
  let q: Queue
  let w: Worker | null = null
  const QNAME = `test-ai-tasks-${Date.now()}`
  beforeEach(() => { q = new Queue(QNAME, { connection }) })
  afterEach(async () => { await w?.close(); await q.obliterate({ force: true }); await q.close() })

  it('produces and consumes a job', async () => {
    await q.add('analyze', { postId: 42 })
    const got = await new Promise<{ postId: number }>((resolve) => {
      w = new Worker<{ postId: number }>(QNAME, async (job) => { resolve(job.data); return null }, { connection })
    })
    expect(got).toEqual({ postId: 42 })
  }, 10_000)
})
