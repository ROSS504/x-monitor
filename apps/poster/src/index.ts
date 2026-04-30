import { getDb, migrate, draftsRepo, accountsRepo } from '@x-monitor/db'
import { createLogger, heartbeat } from '@x-monitor/observability'
import { getNetStatus, connection } from '@x-monitor/queue'
import { Worker } from 'bullmq'
import { createDryRunClient, createLiveClient, type XClient, type LiveXClient } from '@x-monitor/x-client'
import { sendOne } from './post.js'

const db = getDb(); migrate(db)
const log = createLogger('poster')

const isDryRun = process.env.POSTER_DRY_RUN !== '0'

// Cache of live clients keyed by handle. Each handle launches its own browser
// with its own cookies. In dry-run mode a single shared client is used.
const dryClient = createDryRunClient()
const liveByHandle = new Map<string, LiveXClient>()

async function clientFor(handle: string, cookiesPath: string): Promise<XClient> {
  if (isDryRun) return dryClient
  let c = liveByHandle.get(handle)
  if (!c) {
    log.info('launching live client', { handle, cookiesPath })
    c = await createLiveClient({ cookiesPath, headless: process.env.POSTER_HEADLESS !== '0' })
    liveByHandle.set(handle, c)
  }
  return c
}

new Worker<{ draftId: number; traceId: string }>(
  'send-tasks',
  async (job) => {
    if (await getNetStatus() === 'DOWN') throw new Error('network down')

    const draft = draftsRepo(db).findById(job.data.draftId)
    if (!draft) throw new Error(`draft ${job.data.draftId} not found`)
    const acct = accountsRepo(db).findById(draft.accountId)
    if (!acct) throw new Error(`account ${draft.accountId} not found`)

    const xc = await clientFor(acct.handle, acct.cookiesPath)
    const r = await sendOne(db, xc, job.data.draftId)
    log.info('sent', {
      draftId: job.data.draftId,
      tweetId: r.tweetId,
      partsSent: r.partsSent,
      account: acct.handle,
      traceId: job.data.traceId,
    })
    heartbeat(db, 'poster', 'ok')
    return r
  },
  { connection, concurrency: 1 },
)

log.info('poster started', { dryRun: isDryRun })

async function shutdown() {
  for (const c of liveByHandle.values()) await c.shutdown().catch(() => {})
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
