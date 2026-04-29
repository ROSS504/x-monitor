import { getDb, migrate } from '@x-monitor/db'
import { createLogger, heartbeat } from '@x-monitor/observability'
import { getNetStatus, connection } from '@x-monitor/queue'
import { Worker } from 'bullmq'
import { createDryRunClient, createLiveClient, type XClient } from '@x-monitor/x-client'
import { sendOne } from './post.js'

const db = getDb(); migrate(db)
const log = createLogger('poster')

async function buildClient(): Promise<XClient> {
  if (process.env.POSTER_DRY_RUN !== '0') return createDryRunClient()
  const cookiesPath = process.env.COOKIES_FINTAX_OFFICIAL
  if (!cookiesPath) throw new Error('COOKIES_FINTAX_OFFICIAL not set; refusing to start live poster')
  log.info('starting live X client', { cookiesPath })
  return createLiveClient({ cookiesPath, headless: process.env.POSTER_HEADLESS !== '0' })
}

const xc = await buildClient()

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
