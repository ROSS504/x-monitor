#!/usr/bin/env tsx
/**
 * Scrape a user's full timeline (with replies, to capture threads) within last N days.
 * Uses xactions.scrapeTweets which paginates the user profile, NOT search,
 * so it can return way more than 50.
 *
 * Usage:
 *   pnpm tsx scripts/scrape-user-timeline.ts <handle> [days=14] [limit=200] [cookiesPath]
 */
import { readFileSync } from 'node:fs'
import { getDb, migrate, postsRepo } from '@x-monitor/db'
import { aiTasksQ, connection } from '@x-monitor/queue'
import { newTraceId } from '@x-monitor/core'
import { createBrowser, createPage, scrapeTweets } from 'xactions'

interface CookieEntry { name: string; value: string; domain?: string; path?: string; secure?: boolean; httpOnly?: boolean }
interface XATweet {
  id: string | null
  text: string | null
  author?: string
  timestamp: string | null
  likes?: string
  url?: string
}

const [, , handleArg, daysArg, limitArg, cookiesArg] = process.argv
if (!handleArg) {
  console.error('Usage: pnpm tsx scripts/scrape-user-timeline.ts <handle> [days=14] [limit=200] [cookiesPath]')
  process.exit(1)
}
const handle = handleArg.replace(/^@/, '')
const days = parseInt(daysArg ?? '14', 10)
const limit = parseInt(limitArg ?? '200', 10)
const cookiesPath = cookiesArg ?? '/Users/nightyoung/twitter_cookies_fintax_intern.json'

console.log(`[timeline] handle=@${handle} days=${days} limit=${limit} cookies=${cookiesPath}`)

const db = getDb(); migrate(db)

const cookies = JSON.parse(readFileSync(cookiesPath, 'utf8')) as CookieEntry[]
const browser = await createBrowser({ headless: process.env.SCRAPE_HEADLESS !== '0' }) as any
const page = await createPage(browser) as any
await page.setCookie(...cookies.map(c => ({
  name: c.name, value: c.value, domain: c.domain ?? '.x.com', path: c.path ?? '/',
  secure: c.secure ?? true, httpOnly: c.httpOnly ?? false,
})))

console.log('[timeline] scraping user timeline (with replies)...')
const tweets = (await scrapeTweets(page, handle, { limit, includeReplies: true })) as unknown as XATweet[]
console.log(`[timeline] xactions returned ${tweets.length} tweets`)

const sinceMs = Date.now() - days * 24 * 3600_000
const eligible = tweets.filter(t =>
  t.id && t.text && t.timestamp && Date.parse(t.timestamp) >= sinceMs
)
console.log(`[timeline] ${eligible.length} match the ${days}-day window (cutoff ${new Date(sinceMs).toISOString()})`)

let inserted = 0
let skipped = 0
const byDay = new Map<string, number>()
for (const t of eligible) {
  const tweetId = t.id!
  const text = t.text!
  const postedAt = Date.parse(t.timestamp!)
  const day = new Date(postedAt).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })
  byDay.set(day, (byDay.get(day) ?? 0) + 1)

  const before = db.prepare(`SELECT id FROM posts WHERE tweet_id = ?`).get(tweetId) as { id: number } | undefined
  if (before) { skipped++; continue }
  const id = postsRepo(db).insert({
    tweetId,
    authorHandle: t.author ?? handle,
    text,
    postedAt,
    lang: /[一-龥]/.test(text) ? 'zh' : 'en',
    source: 'browser',
    scenarioHint: `scrape-user:@${handle}`,
    status: 'discovered',
    traceId: newTraceId(),
  })
  await aiTasksQ.add('analyze', { postId: id, traceId: newTraceId() })
  inserted++
}

console.log(`\n[timeline] done: fetched=${tweets.length} eligible=${eligible.length} inserted=${inserted} skipped(dupe)=${skipped}`)
console.log('[timeline] daily distribution (latest:)')
const sortedDays = [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0]))
for (const [d, c] of sortedDays) console.log(`  ${d}: ${c}`)

await browser.close()
await connection.quit()
process.exit(0)
