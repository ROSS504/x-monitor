import { getDb, migrate, healthRepo } from '@x-monitor/db'
import { createLogger, sendTelegramAlert, heartbeat } from '@x-monitor/observability'
import { checkHealthMonitor, formatVerdict } from './check.js'
import { WatchdogDedupe } from './dedupe.js'

const db = getDb(); migrate(db)
const log = createLogger('watchdog')
const dedupe = new WatchdogDedupe()

const TICK_MS = parseInt(process.env.WATCHDOG_TICK_MS ?? '120000', 10)
const MAX_STALE_S = parseInt(process.env.WATCHDOG_MAX_STALE_S ?? String(5 * 60), 10)

async function tick() {
  try {
    const rows = healthRepo(db).all()
    const v = checkHealthMonitor(Date.now(), rows, { maxStaleSeconds: MAX_STALE_S })
    const msg = formatVerdict(v)
    if (v.ok) {
      log.info('health-monitor ok', { ageSeconds: v.ageSeconds })
    } else {
      log.error('health-monitor down', { reason: v.reason, ageSeconds: v.ageSeconds, lastError: v.lastError })
      if (dedupe.shouldSend(v)) {
        try {
          await sendTelegramAlert(`x-monitor watchdog: ${msg}`)
        } catch (e) {
          log.error('watchdog telegram send failed', { error: String(e) })
        }
      }
    }
    heartbeat(db, 'watchdog', 'ok')
  } catch (e) {
    log.error('watchdog tick failed', { error: String(e) })
    heartbeat(db, 'watchdog', 'error', String(e))
  }
}

await tick()
setInterval(tick, TICK_MS)
log.info('started', { tickMs: TICK_MS, maxStaleSeconds: MAX_STALE_S })
