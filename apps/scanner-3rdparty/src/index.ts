import { getDb, migrate } from '@x-monitor/db'
import { createApifyClient, createTweetScoutClient, type ThirdPartySearchClient } from '@x-monitor/x-thirdparty'
import { createLogger } from '@x-monitor/observability'
import { runLoop } from './loop.js'

const db = getDb(); migrate(db)
const log = createLogger('scanner-3rdparty')

const queries = ['crypto tax', 'staking tax', 'IRS crypto', 'DeFi tax']

function buildClient(): ThirdPartySearchClient | null {
  const provider = process.env.THIRDPARTY_PROVIDER ?? 'none'
  if (provider === 'apify') {
    const token = process.env.APIFY_API_TOKEN
    if (!token) { log.warn('APIFY_API_TOKEN not set; refusing to run'); return null }
    return createApifyClient({ apiToken: token, actorId: process.env.APIFY_ACTOR_ID })
  }
  if (provider === 'tweetscout') {
    const key = process.env.TWEETSCOUT_API_KEY
    if (!key) { log.warn('TWEETSCOUT_API_KEY not set; refusing to run'); return null }
    return createTweetScoutClient({ apiKey: key })
  }
  log.info('THIRDPARTY_PROVIDER not configured; idling')
  return null
}

const client = buildClient()
if (!client) {
  log.info('no 3rdparty provider; exiting cleanly')
  process.exit(0)
}

const intervalMs = parseInt(process.env.SCANNER_3RDPARTY_INTERVAL_MS ?? '1800000', 10)  // 30 min
const triggerAgeMs = parseInt(process.env.THIRDPARTY_TRIGGER_AGE_MS ?? '1800000', 10)
log.info('starting', { provider: client.name, intervalMs, triggerAgeMs })
await runLoop({ db, client, log, queries, intervalMs, triggerAgeMs })
