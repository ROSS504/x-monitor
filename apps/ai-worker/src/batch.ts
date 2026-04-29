import type Database from 'better-sqlite3'
import { Worker, type Job } from 'bullmq'
import { connection, type AiTaskPayload } from '@x-monitor/queue'
import { postsRepo, draftsRepo, accountsRepo, deadLetterRepo } from '@x-monitor/db'
import { runPrompt } from '@x-monitor/claude-client'
import { analyzeOne, type AnalyzeDeps } from './analyze.js'
import { draftOne, type DraftDeps } from './draft.js'
import { createHash } from 'node:crypto'
import type { Logger } from '@x-monitor/observability'

const MAX_BATCH = 20
const QUEUE_NAME = 'ai-tasks'

export interface ProcessBatchDeps {
  runPrompt: AnalyzeDeps['runPrompt'] & DraftDeps['runPrompt']
}

export async function processBatch(
  db: Database.Database,
  log: Logger,
  deps: ProcessBatchDeps = { runPrompt },
): Promise<{ processed: number }> {
  const account = accountsRepo(db).findByHandle('FinTax_Official')
  if (!account) throw new Error('FinTax_Official account not seeded')

  let processed = 0

  const handler = async (job: Job<AiTaskPayload>): Promise<void> => {
    const post = postsRepo(db).findById(job.data.postId)
    if (!post) {
      log.info('skipped missing post', { postId: job.data.postId })
      return
    }
    postsRepo(db).updateStatus(post.id, 'analyzing')
    const analysis = await analyzeOne(
      { text: post.text, authorHandle: post.authorHandle },
      { runPrompt: deps.runPrompt },
    )
    if (analysis.scenario !== '1') {
      postsRepo(db).updateStatus(post.id, 'no_match')
      log.info('skipped scenario', { postId: post.id, scenario: analysis.scenario, traceId: post.traceId })
      return
    }
    const dr = await draftOne(
      { text: post.text, authorHandle: post.authorHandle },
      { runPrompt: deps.runPrompt },
    )
    if (!dr.draft) {
      postsRepo(db).updateStatus(post.id, 'no_match')
      log.info('no kb match', { postId: post.id, matchScore: dr.matchScore, traceId: post.traceId })
      return
    }
    const idempKey = createHash('sha1')
      .update(`${post.id}:${account.id}:${dr.draft.content}`)
      .digest('hex')
    draftsRepo(db).insert({
      postId: post.id,
      accountId: account.id,
      content: dr.draft.content,
      format: 'single',
      citations: dr.draft.citations,
      strategy: null,
      status: 'pending',
      idempotencyKey: idempKey,
      promptVersion: dr.promptVersion,
    })
    postsRepo(db).updateStatus(post.id, 'matched_article')
    log.info('drafted', { postId: post.id, articleId: dr.articleId, traceId: post.traceId })
  }

  const worker = new Worker<AiTaskPayload>(QUEUE_NAME, async (job) => {
    try {
      await handler(job)
      processed++
    } catch (e) {
      const attempts = (job.attemptsMade ?? 0) + 1
      log.error('ai-task failed', { jobId: job.id, error: String(e), attempts })
      if (attempts >= 3) {
        deadLetterRepo(db).insert({
          taskType: 'ai-task',
          payload: job.data,
          lastError: String(e),
          retryCount: attempts,
        })
        return
      }
      throw e
    }
  }, {
    connection,
    concurrency: 1,
    autorun: false,
  })

  worker.run()

  await new Promise<void>((resolve) => {
    let drained = false
    const stop = async () => {
      if (drained) return
      drained = true
      await worker.close()
      resolve()
    }
    worker.on('completed', () => { if (processed >= MAX_BATCH) stop() })
    worker.on('failed', () => { if (processed >= MAX_BATCH) stop() })
    worker.on('drained', () => stop())
    setTimeout(stop, 30_000)
  })

  return { processed }
}
