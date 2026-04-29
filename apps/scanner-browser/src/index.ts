import { getDb, migrate } from '@x-monitor/db'
import { createDryRunClient } from '@x-monitor/x-client'
import { createLogger } from '@x-monitor/observability'
import { runLoop } from './loop.js'

const db = getDb(); migrate(db)
const log = createLogger('scanner-browser')

const queries = ['crypto tax', 'staking tax', 'IRS crypto', 'DeFi tax']

const xc = process.env.X_CLIENT_MODE === 'live'
  ? (() => { throw new Error('live X client not implemented in M1') })()
  : createDryRunClient()

const intervalMs = parseInt(process.env.SCANNER_INTERVAL_MS ?? '60000', 10)
log.info('starting', { queries, intervalMs })
await runLoop({ db, xc, log, queries, intervalMs })
