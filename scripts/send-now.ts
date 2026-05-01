#!/usr/bin/env tsx
/**
 * Manually enqueue a single draft into send-tasks for immediate posting.
 * Usage: pnpm tsx scripts/send-now.ts <draftId>
 */
import { sendTasksQ, connection } from '@x-monitor/queue'

const id = parseInt(process.argv[2] ?? '', 10)
if (Number.isNaN(id)) {
  console.error('Usage: pnpm tsx scripts/send-now.ts <draftId>')
  process.exit(1)
}
const job = await sendTasksQ.add('send', { draftId: id, traceId: `manual-${id}` })
console.log(`enqueued draft ${id} as job ${job.id}`)
await connection.quit()
process.exit(0)
