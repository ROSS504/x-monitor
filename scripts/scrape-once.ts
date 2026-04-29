#!/usr/bin/env tsx
/**
 * One-shot live scrape: grabs N tweets matching a query via xactions/Puppeteer,
 * inserts new ones into posts and enqueues to ai-tasks. Exits when done.
 *
 * Usage:
 *   pnpm tsx scripts/scrape-once.ts [query] [limit]
 *   pnpm tsx scripts/scrape-once.ts "crypto tax" 20
 */
import { getDb, migrate, postsRepo } from '@x-monitor/db'
import { createLiveClient } from '@x-monitor/x-client'
import { aiTasksQ, connection } from '@x-monitor/queue'
import { newTraceId } from '@x-monitor/core'

const [, , queryArg, limitArg] = process.argv
const query = queryArg ?? 'crypto tax'
const limit = parseInt(limitArg ?? '20', 10)
const cookiesPath = process.env.COOKIES_FINTAX_OFFICIAL
  ?? '/Users/nightyoung/twitter_cookies_fintax_en.json'

console.log(`[scrape-once] query="${query}" limit=${limit} cookies=${cookiesPath}`)

const db = getDb()
migrate(db)

const xc = await createLiveClient({
  cookiesPath,
  headless: process.env.SCRAPE_HEADLESS !== '0',
})

console.log('[scrape-once] browser launched, searching...')
const tweets = await xc.search(query, Date.now() - 6 * 30 * 24 * 3600_000)
console.log(`[scrape-once] got ${tweets.length} tweets, taking up to ${limit}`)

let inserted = 0
let skipped = 0
for (const t of tweets.slice(0, limit)) {
  const before = db.prepare(`SELECT id FROM posts WHERE tweet_id = ?`).get(t.tweetId) as { id: number } | undefined
  if (before) { skipped++; continue }
  const id = postsRepo(db).insert({
    tweetId: t.tweetId,
    authorHandle: t.authorHandle,
    text: t.text,
    postedAt: t.postedAt,
    lang: t.lang,
    source: 'browser',
    scenarioHint: `scrape-once:${query}`,
    status: 'discovered',
    traceId: newTraceId(),
  })
  await aiTasksQ.add('analyze', { postId: id, traceId: newTraceId() })
  inserted++
  console.log(`  + #${id} @${t.authorHandle}: ${t.text.slice(0, 80).replace(/\n/g, ' ')}`)
}

console.log(`[scrape-once] done: inserted=${inserted} skipped(dupe)=${skipped}`)
await xc.shutdown()
await connection.quit()
process.exit(0)
