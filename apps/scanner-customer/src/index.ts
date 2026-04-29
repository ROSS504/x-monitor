import { getDb, migrate } from '@x-monitor/db'
import { createDryRunClient, createLiveClient, type XClient } from '@x-monitor/x-client'
import { createLogger } from '@x-monitor/observability'
import { runLoop } from './loop.js'

const db = getDb(); migrate(db)
const log = createLogger('scanner-customer')

async function buildClient(): Promise<XClient> {
  if (process.env.X_CLIENT_MODE !== 'live') return createDryRunClient()
  const cookiesPath = process.env.COOKIES_ROSSYU_PERSONAL ?? process.env.COOKIES_FINTAX_OFFICIAL
  if (!cookiesPath) throw new Error('No cookies env set; refusing to start live customer scanner')
  log.info('starting live X client', { cookiesPath })
  return createLiveClient({ cookiesPath, headless: process.env.SCANNER_HEADLESS !== '0' })
}

const xc = await buildClient()

const intervalMs = parseInt(process.env.SCANNER_CUSTOMER_INTERVAL_MS ?? '300000', 10)
log.info('starting', { intervalMs, mode: process.env.X_CLIENT_MODE ?? 'dry' })
await runLoop({ db, xc, log, intervalMs })
