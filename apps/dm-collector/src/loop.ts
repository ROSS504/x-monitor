import type Database from 'better-sqlite3'
import type { XClient } from '@x-monitor/x-client'
import type { Logger } from '@x-monitor/observability'
import { accountsRepo } from '@x-monitor/db'
import { getNetStatus } from '@x-monitor/queue'
import { heartbeat } from '@x-monitor/observability'
import { collectForAccount } from './collect.js'

export interface LoopDeps {
  db: Database.Database
  log: Logger
  intervalMs: number
  /** Build (or reuse) an XClient for a given account handle. */
  buildClient: (handle: string) => Promise<XClient>
  shutdownClient?: (xc: XClient) => Promise<void>
}

export async function runLoop(deps: LoopDeps): Promise<void> {
  while (true) {
    const status = await getNetStatus()
    if (status === 'DOWN' || status === 'DEGRADED_X') {
      deps.log.warn('skipping DM collection, network not healthy', { status })
      await sleep(deps.intervalMs)
      continue
    }
    const accounts = accountsRepo(deps.db).list()
    for (const acct of accounts) {
      let xc: XClient | null = null
      try {
        xc = await deps.buildClient(acct.handle)
        const r = await collectForAccount({ db: deps.db, accountId: acct.id, xc })
        deps.log.info('dm-collected', { account: acct.handle, ...r })
      } catch (e) {
        deps.log.error('dm collect failed', { account: acct.handle, error: String(e) })
      } finally {
        if (xc && deps.shutdownClient) {
          await deps.shutdownClient(xc).catch(() => {})
        }
      }
    }
    heartbeat(deps.db, 'dm-collector', 'ok')
    await sleep(deps.intervalMs)
  }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }
