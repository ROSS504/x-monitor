#!/usr/bin/env tsx
// Claude Code routine entry: drains the ai-tasks queue once and exits.
// Wire up via local Claude Code /schedule with cron "*/5 * * * *" running
// "cd /Users/nightyoung/IdeaProjects/x-monitor && pnpm ai-routine".
// Each invocation processes up to MAX_BATCH posts and exits. The PM2
// ai-worker process can coexist as a 60s-poll fallback; BullMQ delivers
// each job to exactly one consumer.
import { getDb, migrate } from '@x-monitor/db'
import { processBatch } from '@x-monitor/app-ai-worker/lib'
import { createLogger, heartbeat } from '@x-monitor/observability'
import { connection } from '@x-monitor/queue'

const db = getDb(); migrate(db)
const log = createLogger('ai-routine')

try {
  const r = await processBatch(db, log)
  log.info('routine done', r)
  heartbeat(db, 'ai-routine', 'ok')
} catch (e) {
  log.error('routine failed', { error: String(e) })
  heartbeat(db, 'ai-routine', 'error', String(e))
  await connection.quit()
  process.exit(1)
}

await connection.quit()
process.exit(0)
