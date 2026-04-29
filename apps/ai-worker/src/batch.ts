import type Database from 'better-sqlite3'
import { Worker, type Job } from 'bullmq'
import { connection, type AiTaskPayload } from '@x-monitor/queue'
import { postsRepo, draftsRepo, accountsRepo, deadLetterRepo } from '@x-monitor/db'
import { runPrompt } from '@x-monitor/claude-client'
import { analyzeOne, type AnalyzeDeps } from './analyze.js'
import { draftOne, type DraftDeps } from './draft.js'
import { synthesizeOne } from './synthesize.js'
import { getKB } from './kb.js'
import { createHash } from 'node:crypto'
import type { Logger } from '@x-monitor/observability'
import { pickAccountForStrategy, type DraftStrategy } from '@x-monitor/rules'
import type { SearchKBFn } from '@x-monitor/dify-client'

const MAX_BATCH = 20
const QUEUE_NAME = 'ai-tasks'

export interface ProcessBatchDeps {
  runPrompt: AnalyzeDeps['runPrompt'] & DraftDeps['runPrompt']
  searchKB: SearchKBFn
}

export async function processBatch(
  db: Database.Database,
  log: Logger,
  deps: ProcessBatchDeps = { runPrompt, searchKB: getKB() },
): Promise<{ processed: number }> {
  const accounts = accountsRepo(db).list()
  if (accounts.length === 0) throw new Error('No accounts seeded; run pnpm seed first')

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
    if (analysis.scenario === 'skip') {
      postsRepo(db).updateStatus(post.id, 'no_match')
      log.info('skipped scenario', { postId: post.id, scenario: 'skip', traceId: post.traceId })
      return
    }

    let draftPayload: { content: string; citations: { chunkId: string; quote: string }[] } | null = null
    let strategy: string | null = null
    let articleId: string | undefined
    let promptVersion: string

    if (analysis.scenario === '1') {
      const dr = await draftOne(
        { text: post.text, authorHandle: post.authorHandle },
        { runPrompt: deps.runPrompt, searchKB: deps.searchKB },
      )
      draftPayload = dr.draft
      strategy = 'article-match'
      articleId = dr.articleId
      promptVersion = dr.promptVersion
    } else if (analysis.scenario === '2') {
      const sr = await synthesizeOne(
        { text: post.text, authorHandle: post.authorHandle, viewpoint: analysis.viewpoint },
        { runPrompt: deps.runPrompt, searchKB: deps.searchKB },
      )
      draftPayload = sr.draft
      strategy = 'kb-synthesis'
      promptVersion = sr.promptVersion
    } else {
      // scenario === '3' — customer engagement: synthesize a friendly engagement reply from KB
      const sr = await synthesizeOne(
        { text: post.text, authorHandle: post.authorHandle, viewpoint: analysis.viewpoint },
        { runPrompt: deps.runPrompt, searchKB: deps.searchKB },
      )
      draftPayload = sr.draft
      strategy = 'customer-engagement'
      promptVersion = sr.promptVersion
    }

    if (!draftPayload) {
      postsRepo(db).updateStatus(post.id, 'no_match')
      log.info('no draft produced', { postId: post.id, scenario: analysis.scenario, traceId: post.traceId })
      return
    }

    const targetAccount = pickAccountForStrategy(strategy as DraftStrategy, accounts)
    if (!targetAccount) {
      postsRepo(db).updateStatus(post.id, 'no_match')
      log.warn('no account for strategy', { postId: post.id, strategy, traceId: post.traceId })
      return
    }
    const idempKey = createHash('sha1')
      .update(`${post.id}:${targetAccount.id}:${draftPayload.content}`)
      .digest('hex')
    draftsRepo(db).insert({
      postId: post.id,
      accountId: targetAccount.id,
      content: draftPayload.content,
      format: 'single',
      citations: draftPayload.citations,
      strategy,
      status: 'pending',
      idempotencyKey: idempKey,
      promptVersion,
    })
    postsRepo(db).updateStatus(post.id, 'matched_article')
    log.info('drafted', { postId: post.id, articleId, strategy, accountId: targetAccount.id, traceId: post.traceId })
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
