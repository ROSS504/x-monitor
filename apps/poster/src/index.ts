import { getDb, migrate } from '@x-monitor/db'
import { createLogger, heartbeat } from '@x-monitor/observability'
import { getNetStatus, connection } from '@x-monitor/queue'
import { Worker } from 'bullmq'
import { createDryRunClient } from '@x-monitor/x-client'
import { sendOne } from './post.js'

const db = getDb(); migrate(db)
const log = createLogger('poster')

const xc = process.env.POSTER_DRY_RUN === '0'
  ? (() => { throw new Error('live X client not implemented in M1') })()
  : createDryRunClient()

new Worker<{ draftId: number; traceId: string }>(
  'send-tasks',
  async (job) => {
    if (await getNetStatus() === 'DOWN') throw new Error('network down')
    const r = await sendOne(db, xc, job.data.draftId)
    log.info('sent', { draftId: job.data.draftId, tweetId: r.tweetId, traceId: job.data.traceId })
    heartbeat(db, 'poster', 'ok')
    return r
  },
  { connection, concurrency: 1 },
)

log.info('poster started', { dryRun: process.env.POSTER_DRY_RUN !== '0' })
