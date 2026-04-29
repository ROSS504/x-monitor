import { getDb, migrate, accountsRepo } from '@x-monitor/db'
import { createDryRunClient, createLiveClient, type XClient, type LiveXClient } from '@x-monitor/x-client'
import { createLogger } from '@x-monitor/observability'
import { runLoop } from './loop.js'

const db = getDb(); migrate(db)
const log = createLogger('dm-collector')

const COOKIES_ENV: Record<string, string> = {
  'FinTax_Official': 'COOKIES_FINTAX_OFFICIAL',
  'RossYu_Personal': 'COOKIES_ROSSYU_PERSONAL',
  'RossYu_Founder': 'COOKIES_ROSSYU_FOUNDER',
}

async function buildClient(handle: string): Promise<XClient> {
  if (process.env.X_CLIENT_MODE !== 'live') return createDryRunClient()
  const acct = accountsRepo(db).findByHandle(handle)
  if (!acct) throw new Error(`account not seeded: ${handle}`)
  const envKey = COOKIES_ENV[handle]
  const cookiesPath = (envKey && process.env[envKey]) ?? acct.cookiesPath
  return createLiveClient({ cookiesPath, headless: process.env.DM_HEADLESS !== '0' })
}

async function shutdownClient(xc: XClient) {
  if ('shutdown' in xc && typeof (xc as LiveXClient).shutdown === 'function') {
    await (xc as LiveXClient).shutdown()
  }
}

const intervalMs = parseInt(process.env.DM_COLLECTOR_INTERVAL_MS ?? '600000', 10)  // 10 min
log.info('starting', { intervalMs, mode: process.env.X_CLIENT_MODE ?? 'dry' })
await runLoop({ db, log, intervalMs, buildClient, shutdownClient })
