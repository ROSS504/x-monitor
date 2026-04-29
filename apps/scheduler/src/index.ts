import { getDb, migrate } from '@x-monitor/db'
import { createLogger, heartbeat } from '@x-monitor/observability'
import { sendTasksQ, getNetStatus } from '@x-monitor/queue'
import { tick } from './tick.js'

const db = getDb(); migrate(db)
const log = createLogger('scheduler')

while (true) {
  if (await getNetStatus() === 'DOWN') {
    await new Promise(r => setTimeout(r, 30_000))
    continue
  }
  try {
    const r = await tick({
      db,
      now: Date.now(),
      enqueue: (draftId, delayMs) => {
        sendTasksQ.add('send', { draftId, traceId: String(draftId) }, { delay: delayMs })
      },
    })
    log.info('tick', r)
    heartbeat(db, 'scheduler', 'ok')
  } catch (e) {
    log.error('tick failed', { error: String(e) })
    heartbeat(db, 'scheduler', 'error', String(e))
  }
  await new Promise(r => setTimeout(r, 30_000))
}
