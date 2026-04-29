#!/usr/bin/env tsx
/**
 * Scrape a single user's tweets within the last N days, save to posts table.
 *
 * Usage:
 *   pnpm tsx scripts/scrape-user.ts <handle> [days] [cookiesPath]
 *   pnpm tsx scripts/scrape-user.ts FinTax_Intern 14 /Users/nightyoung/twitter_cookies_fintax_intern.json
 */
import { getDb, migrate, postsRepo } from '@x-monitor/db'
import { createLiveClient } from '@x-monitor/x-client'
import { aiTasksQ, connection } from '@x-monitor/queue'
import { newTraceId } from '@x-monitor/core'

const [, , handleArg, daysArg, cookiesArg] = process.argv
if (!handleArg) {
  console.error('Usage: pnpm tsx scripts/scrape-user.ts <handle> [days=14] [cookiesPath]')
  process.exit(1)
}
const handle = handleArg.replace(/^@/, '')
const days = parseInt(daysArg ?? '14', 10)
const cookiesPath = cookiesArg
  ?? process.env.COOKIES_FINTAX_INTERN
  ?? '/Users/nightyoung/twitter_cookies_fintax_intern.json'

console.log(`[scrape-user] handle=@${handle} days=${days} cookies=${cookiesPath}`)

const db = getDb()
migrate(db)

const xc = await createLiveClient({
  cookiesPath,
  headless: process.env.SCRAPE_HEADLESS !== '0',
})

const sinceMs = Date.now() - days * 24 * 3600_000
console.log(`[scrape-user] cutoff: ${new Date(sinceMs).toISOString()}`)

console.log('[scrape-user] searching...')
const tweets = await xc.search(`from:${handle}`, sinceMs)
console.log(`[scrape-user] got ${tweets.length} tweets, filtering to last ${days} days`)

const recent = tweets.filter(t => t.postedAt >= sinceMs)
console.log(`[scrape-user] ${recent.length} match the time window`)

let inserted = 0
let skipped = 0
for (const t of recent) {
  const before = db.prepare(`SELECT id FROM posts WHERE tweet_id = ?`).get(t.tweetId) as { id: number } | undefined
  if (before) { skipped++; continue }
  const id = postsRepo(db).insert({
    tweetId: t.tweetId,
    authorHandle: t.authorHandle,
    text: t.text,
    postedAt: t.postedAt,
    lang: t.lang,
    source: 'browser',
    scenarioHint: `scrape-user:@${handle}`,
    status: 'discovered',
    traceId: newTraceId(),
  })
  await aiTasksQ.add('analyze', { postId: id, traceId: newTraceId() })
  inserted++
  const date = new Date(t.postedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
  console.log(`  + #${id} ${date} ❤${t.metrics?.likes ?? '?'}: ${t.text.slice(0, 90).replace(/\n/g, ' ')}`)
}

console.log(`[scrape-user] done: inserted=${inserted} skipped(dupe)=${skipped}`)
await xc.shutdown()
await connection.quit()
process.exit(0)
