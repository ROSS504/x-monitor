#!/usr/bin/env tsx
/**
 * Mark external-queue drafts as approved and pre-schedule them every 2 hours,
 * alternating zh / en. Skips drafts that already have a scheduled row.
 *
 * Usage:
 *   pnpm tsx scripts/schedule-external-queue.ts [intervalMinutes=120] [startInMinutes=5]
 */
import { getDb, migrate, draftsRepo, scheduledRepo } from '@x-monitor/db'

const intervalMin = parseInt(process.argv[2] ?? '120', 10)
const startInMin = parseInt(process.argv[3] ?? '5', 10)

const db = getDb(); migrate(db)

// Mark all external-queue drafts as approved
const approved = db.prepare(`
  UPDATE drafts SET status = 'approved' WHERE strategy = 'external-queue' AND status = 'pending'
`).run()
console.log(`[schedule] marked ${approved.changes} external-queue drafts as approved`)

// Fetch them, joined with post.scenario_hint to determine language
interface Row {
  id: number
  account_id: number
  prompt_version: string
  scenario_hint: string | null
}
const rows = db.prepare(`
  SELECT d.id AS id, d.account_id AS account_id, d.prompt_version AS prompt_version, p.scenario_hint AS scenario_hint
  FROM drafts d
  JOIN posts p ON p.id = d.post_id
  WHERE d.strategy = 'external-queue' AND d.status = 'approved'
  AND NOT EXISTS (SELECT 1 FROM scheduled s WHERE s.draft_id = d.id)
`).all() as Row[]
console.log(`[schedule] ${rows.length} drafts need scheduling`)

function langOf(r: Row): 'zh' | 'en' {
  if (r.scenario_hint === 'external-queue:zh') return 'zh'
  return 'en'
}
function indexOf(r: Row): number {
  const m = r.prompt_version.match(/i=(\d+)/)
  return m ? parseInt(m[1], 10) : 0
}

const zh = rows.filter(r => langOf(r) === 'zh').sort((a, b) => indexOf(a) - indexOf(b))
const en = rows.filter(r => langOf(r) === 'en').sort((a, b) => indexOf(a) - indexOf(b))
console.log(`[schedule]   zh: ${zh.length}, en: ${en.length}`)

// Interleave zh, en, zh, en, ...
const interleaved: Row[] = []
for (let i = 0; i < Math.max(zh.length, en.length); i++) {
  if (zh[i]) interleaved.push(zh[i])
  if (en[i]) interleaved.push(en[i])
}

// Schedule
const startMs = Date.now() + startInMin * 60_000
const intervalMs = intervalMin * 60_000
let scheduled = 0
for (let i = 0; i < interleaved.length; i++) {
  const r = interleaved[i]
  const target = startMs + i * intervalMs
  scheduledRepo(db).upsert({
    draftId: r.id,
    accountId: r.account_id,
    targetSendAt: target,
    priority: 0,
  })
  scheduled++
}
console.log(`[schedule] scheduled ${scheduled} drafts`)
console.log(`[schedule] first send at: ${new Date(startMs).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}`)
console.log(`[schedule] last send at:  ${new Date(startMs + (interleaved.length - 1) * intervalMs).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}`)
console.log(`[schedule] total span: ${Math.round(interleaved.length * intervalMin / 60 / 24)} days`)
process.exit(0)
