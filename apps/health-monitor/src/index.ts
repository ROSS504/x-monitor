import { getDb, migrate, healthRepo } from '@x-monitor/db'
import { createLogger, heartbeat, sendTelegramAlert } from '@x-monitor/observability'
import { checkHealth, formatIssue } from './check.js'
import { AlertDedupe } from './dedupe.js'

const db = getDb(); migrate(db)
const log = createLogger('health-monitor')
const dedupe = new AlertDedupe()

const TICK_MS = parseInt(process.env.HEALTH_MONITOR_TICK_MS ?? '60000', 10)

async function tick() {
  try {
    const rows = healthRepo(db).all()
    const issues = checkHealth(Date.now(), rows)
    if (issues.length === 0) {
      log.info('all healthy', { processes: rows.length })
    } else {
      const fresh = issues.filter(i => dedupe.shouldSend(i))
      for (const i of fresh) {
        const msg = formatIssue(i)
        log.warn('issue', { process: i.process, kind: i.kind, msg })
        try {
          await sendTelegramAlert(`x-monitor: ${msg}`)
        } catch (e) {
          log.error('telegram send failed', { error: String(e) })
        }
      }
      log.info('summary', { totalIssues: issues.length, alertsSent: fresh.length })
    }
    heartbeat(db, 'health-monitor', 'ok')
  } catch (e) {
    log.error('tick failed', { error: String(e) })
    heartbeat(db, 'health-monitor', 'error', String(e))
  }
}

await tick()
setInterval(tick, TICK_MS)
log.info('started', { tickMs: TICK_MS })
