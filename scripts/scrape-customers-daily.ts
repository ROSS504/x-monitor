#!/usr/bin/env tsx
/**
 * Daily scrape: for every enabled customer, fetch the last 24h of original
 * tweets (replies kept, native retweets filtered) and persist to posts.
 * Designed to be run nightly via PM2 cron_restart at 00:00 Asia/Shanghai.
 *
 * Usage: pnpm tsx scripts/scrape-customers-daily.ts [hoursBack=24] [limitPerUser=50]
 *
 * We do not use xactions's scrapeTweets because:
 *   1. it waits for `networkidle2` which X's noisy timeline (ads/polling)
 *      almost never reaches → 30s/60s timeouts ~50% of the time.
 *   2. it does not return a per-article author handle, so retweet detection
 *      via author-mismatch is impossible. Its `isRetweet` flag works though.
 * We talk to puppeteer directly via xactions's createBrowser/createPage so
 * the rest of the project's xactions usage (scanner-customer, scanner-browser)
 * is unaffected.
 */
import { readFileSync } from 'node:fs'
import { getDb, migrate, postsRepo, customersRepo } from '@x-monitor/db'
import { newTraceId } from '@x-monitor/core'
import { createBrowser, createPage } from 'xactions'

interface RawTweet {
  id: string | null
  text: string | null
  timestamp: string | null
  isRetweet: boolean
}
interface CookieEntry { name: string; value: string; domain?: string; path?: string; secure?: boolean; httpOnly?: boolean }

const hoursBack = parseInt(process.argv[2] ?? '24', 10)
const limitPerUser = parseInt(process.argv[3] ?? '50', 10)
const cookiesPath = process.env.COOKIES_FINTAX_INTERN
  ?? '/Users/nightyoung/twitter_cookies_fintax_intern.json'

const db = getDb(); migrate(db)
const customers = customersRepo(db).listEnabled()
console.log(`[daily-scrape] ${customers.length} enabled customers, hoursBack=${hoursBack}, limitPerUser=${limitPerUser}`)
if (customers.length === 0) process.exit(0)

const cookies = JSON.parse(readFileSync(cookiesPath, 'utf8')) as CookieEntry[]
const browser = await createBrowser({ headless: process.env.HEADLESS !== '0' }) as any
const page = await createPage(browser) as any
await page.setCookie(...cookies.map(c => ({
  name: c.name, value: c.value, domain: c.domain ?? '.x.com', path: c.path ?? '/',
  secure: c.secure ?? true, httpOnly: c.httpOnly ?? false,
})))

async function scrapeUserTimeline(handle: string, limit: number): Promise<RawTweet[]> {
  const url = `https://x.com/${handle}/with_replies`
  // domcontentloaded fires once the HTML is parsed (~1-3s) instead of waiting
  // for networkidle which X never reaches. We then explicitly wait for a
  // tweet article to appear, which is the actual signal we care about.
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  // X renders tweets after JS hydration; sometimes the first article needs
  // 20-30s on a slow connection. Retry once with reload before giving up.
  try {
    await page.waitForSelector('article[data-testid="tweet"]', { timeout: 25_000 })
  } catch {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.waitForSelector('article[data-testid="tweet"]', { timeout: 25_000 })
  }

  const seen = new Map<string, RawTweet>()
  let stalled = 0
  while (seen.size < limit && stalled < 5) {
    const batch = (await page.evaluate(() => {
      const articles = document.querySelectorAll('article[data-testid="tweet"]')
      return Array.from(articles).map((a) => {
        const linkEl = a.querySelector('a[href*="/status/"]') as HTMLAnchorElement | null
        const textEl = a.querySelector('[data-testid="tweetText"]')
        const timeEl = a.querySelector('time') as HTMLTimeElement | null
        const id = linkEl?.href?.match(/status\/(\d+)/)?.[1] ?? null
        return {
          id,
          text: textEl?.textContent ?? null,
          timestamp: timeEl?.getAttribute('datetime') ?? null,
          // socialContext is X's "X reposted" badge above retweets in /with_replies.
          isRetweet: !!a.querySelector('[data-testid="socialContext"]'),
        } satisfies RawTweet
      })
    })) as RawTweet[]

    const before = seen.size
    for (const t of batch) if (t.id) seen.set(t.id, t)
    if (seen.size === before) stalled++
    else stalled = 0
    if (seen.size >= limit) break

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await new Promise(r => setTimeout(r, 1500 + Math.random() * 1000))
  }
  return Array.from(seen.values()).slice(0, limit)
}

const sinceMs = Date.now() - hoursBack * 3600_000
let totalSeen = 0
let totalNew = 0
let totalRetweets = 0
let userErrors = 0
const errors: { handle: string; error: string }[] = []

for (let i = 0; i < customers.length; i++) {
  const c = customers[i]
  const tag = `[${i + 1}/${customers.length}] @${c.handle}`
  try {
    const raw = await scrapeUserTimeline(c.handle, limitPerUser)
    let newCnt = 0
    let rtCnt = 0
    for (const t of raw) {
      if (!t.id || !t.text || !t.timestamp) continue
      const postedAt = Date.parse(t.timestamp)
      if (Number.isNaN(postedAt) || postedAt < sinceMs) continue
      if (t.isRetweet) { rtCnt++; continue }
      const exists = db.prepare(`SELECT id FROM posts WHERE tweet_id = ?`).get(t.id) as { id: number } | undefined
      if (exists) continue
      postsRepo(db).insert({
        tweetId: t.id,
        authorHandle: c.handle,
        text: t.text,
        postedAt,
        lang: /[一-龥]/.test(t.text) ? 'zh' : 'en',
        source: 'browser',
        scenarioHint: `daily-customer:@${c.handle}`,
        status: 'discovered',
        traceId: newTraceId(),
      })
      newCnt++
    }
    totalSeen += raw.length
    totalNew += newCnt
    totalRetweets += rtCnt
    // Diagnostic: when new=0 but we saw tweets, log the latest tweet's age in
    // hours so we can tell "user actually idle 24h" from "we're scraping old stuff".
    let tail = ''
    if (newCnt === 0 && raw.length > 0) {
      const ages = raw
        .map(t => t.timestamp ? Date.parse(t.timestamp) : NaN)
        .filter(n => !Number.isNaN(n))
        .map(n => (Date.now() - n) / 3600_000)
      if (ages.length > 0) {
        const minH = Math.min(...ages).toFixed(1)
        tail = ` (latest age ${minH}h)`
      }
    }
    console.log(`${tag} -> seen=${raw.length} new=${newCnt} reposts_skipped=${rtCnt}${tail}`)
  } catch (e) {
    userErrors++
    const msg = String(e).slice(0, 100)
    errors.push({ handle: c.handle, error: msg })
    console.log(`${tag} -> ERROR ${msg}`)
  }
  // gentle throttle
  await new Promise(r => setTimeout(r, 1500 + Math.random() * 800))
}

console.log(`\n[daily-scrape] done.`)
console.log(`  customers:       ${customers.length}`)
console.log(`  raw_seen:        ${totalSeen}`)
console.log(`  new_inserted:    ${totalNew}`)
console.log(`  reposts_skipped: ${totalRetweets}`)
console.log(`  errors:          ${userErrors}`)
if (errors.length > 0) {
  console.log('  first errors:')
  for (const e of errors.slice(0, 5)) console.log(`    @${e.handle}: ${e.error}`)
}

await browser.close()
process.exit(0)
