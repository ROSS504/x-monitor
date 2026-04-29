import { Worker } from 'bullmq'
import { getDb, migrate } from '@x-monitor/db'
import { connection, getNetStatus, type AnalyticsTaskPayload } from '@x-monitor/queue'
import { createDryRunClient, createLiveClient, type XClient } from '@x-monitor/x-client'
import { createLogger, heartbeat } from '@x-monitor/observability'
import { snapshot } from './snapshot.js'

const db = getDb(); migrate(db)
const log = createLogger('analytics-worker')

async function buildClient(): Promise<XClient> {
  if (process.env.X_CLIENT_MODE !== 'live') return createDryRunClient()
  const cookiesPath = process.env.COOKIES_FINTAX_OFFICIAL
  if (!cookiesPath) throw new Error('COOKIES_FINTAX_OFFICIAL not set; refusing to start live analytics-worker')
  return createLiveClient({ cookiesPath, headless: process.env.ANALYTICS_HEADLESS !== '0' })
}

const xc = await buildClient()

new Worker<AnalyticsTaskPayload>(
  'analytics-tasks',
  async (job) => {
    if (await getNetStatus() === 'DOWN') throw new Error('network down')
    const r = await snapshot({ db, xc, sentId: job.data.sentId, tweetId: job.data.tweetId, bucket: job.data.bucket })
    log.info('snapshot', { sentId: job.data.sentId, tweetId: job.data.tweetId, bucket: job.data.bucket, traceId: job.data.traceId, ...r })
    heartbeat(db, 'analytics-worker', 'ok')
    return r
  },
  { connection, concurrency: 1 },
)

log.info('analytics-worker started')
