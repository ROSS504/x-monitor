#!/usr/bin/env tsx
/**
 * Scrape a user's full timeline (own original tweets + own thread replies),
 * filtering out reposts/quotes-of-others. Last N days only.
 *
 * Detection: each article on the profile timeline has a User-Name link.
 * If that link's handle differs from our target, the article is a repost
 * of someone else and we drop it. (X surfaces reposts on the profile but
 * the User-Name shown is always the original author.)
 *
 * Usage:
 *   pnpm tsx scripts/scrape-user-timeline.ts <handle> [days=14] [limit=300] [cookiesPath]
 */
import { readFileSync } from 'node:fs'
import { getDb, migrate, postsRepo } from '@x-monitor/db'
import { aiTasksQ, connection } from '@x-monitor/queue'
import { newTraceId } from '@x-monitor/core'
import { createBrowser, createPage } from 'xactions'

interface CookieEntry { name: string; value: string; domain?: string; path?: string; secure?: boolean; httpOnly?: boolean }

const [, , handleArg, daysArg, limitArg, cookiesArg] = process.argv
if (!handleArg) {
  console.error('Usage: pnpm tsx scripts/scrape-user-timeline.ts <handle> [days=14] [limit=300] [cookiesPath]')
  process.exit(1)
}
const handle = handleArg.replace(/^@/, '')
const handleLower = handle.toLowerCase()
const days = parseInt(daysArg ?? '14', 10)
const limit = parseInt(limitArg ?? '300', 10)
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

const profileUrl = `https://x.com/${handle}/with_replies`
console.log(`[timeline] navigating ${profileUrl}`)
await page.goto(profileUrl, { waitUntil: 'networkidle2', timeout: 30_000 })
await new Promise(r => setTimeout(r, 2000))

interface RawTweet {
  tweetId: string
  authorHandle: string
  text: string
  postedAt: number
  isRepost: boolean
}

const seen = new Set<string>()
const collected: RawTweet[] = []
let scrollAttempts = 0
const maxRetries = 15

while (collected.length < limit && scrollAttempts < maxRetries) {
  const batch = (await page.evaluate(`
    (function() {
      var arts = Array.prototype.slice.call(document.querySelectorAll('article[data-testid="tweet"]'));
      return arts.map(function(a) {
        var textEl = a.querySelector('[data-testid="tweetText"]');
        var timeEl = a.querySelector('time');
        var unameLink = a.querySelector('[data-testid="User-Name"] a[href^="/"]');
        // permalink: any anchor href matching /handle/status/digits
        var anchors = Array.prototype.slice.call(a.querySelectorAll('a[href*="/status/"]'));
        var perma = null;
        for (var i = 0; i < anchors.length; i++) {
          var h = anchors[i].getAttribute('href') || '';
          if (/^\\/[^/]+\\/status\\/\\d+$/.test(h)) { perma = h; break; }
        }
        var social = a.querySelector('[data-testid="socialContext"]');
        return {
          text: textEl ? textEl.textContent : null,
          time: timeEl ? timeEl.getAttribute('datetime') : null,
          authorHref: unameLink ? unameLink.getAttribute('href') : null,
          permalink: perma,
          socialContext: social ? social.textContent : null,
        };
      });
    })()
  `)) as Array<{ text: string | null; time: string | null; authorHref: string | null; permalink: string | null; socialContext: string | null }>

  let added = 0
  for (const r of batch) {
    if (!r.text || !r.time || !r.permalink) continue
    const m = r.permalink.match(/^\/([^/]+)\/status\/(\d+)$/)
    if (!m) continue
    const articleAuthor = m[1]
    const tweetId = m[2]
    if (seen.has(tweetId)) continue
    seen.add(tweetId)
    const articleAuthorLower = articleAuthor.toLowerCase()
    // socialContext like "[handle] reposted" indicates a repost — skip
    const social = (r.socialContext || '').toLowerCase()
    const isRepost = articleAuthorLower !== handleLower
      || /reposted|转发了|转推了/.test(social)
    if (isRepost) continue
    const postedAt = Date.parse(r.time)
    if (Number.isNaN(postedAt)) continue
    collected.push({
      tweetId,
      authorHandle: articleAuthor,
      text: r.text,
      postedAt,
      isRepost: false,
    })
    added++
    if (collected.length >= limit) break
  }

  if (added === 0) scrollAttempts++
  else scrollAttempts = 0

  await page.evaluate(`window.scrollTo(0, document.body.scrollHeight)`)
  await new Promise(r => setTimeout(r, 1500 + Math.random() * 1000))
}

console.log(`[timeline] collected ${collected.length} OWN tweets (after filtering reposts), seen ${seen.size} articles total`)

const sinceMs = Date.now() - days * 24 * 3600_000
const eligible = collected.filter(t => t.postedAt >= sinceMs)
console.log(`[timeline] ${eligible.length} match the ${days}-day window (cutoff ${new Date(sinceMs).toISOString()})`)

let inserted = 0
let skipped = 0
const byDay = new Map<string, number>()
for (const t of eligible) {
  const day = new Date(t.postedAt).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })
  byDay.set(day, (byDay.get(day) ?? 0) + 1)
  const before = db.prepare(`SELECT id FROM posts WHERE tweet_id = ?`).get(t.tweetId) as { id: number } | undefined
  if (before) { skipped++; continue }
  const id = postsRepo(db).insert({
    tweetId: t.tweetId,
    authorHandle: t.authorHandle,
    text: t.text,
    postedAt: t.postedAt,
    lang: /[一-龥]/.test(t.text) ? 'zh' : 'en',
    source: 'browser',
    scenarioHint: `scrape-user:@${handle}`,
    status: 'discovered',
    traceId: newTraceId(),
  })
  await aiTasksQ.add('analyze', { postId: id, traceId: newTraceId() })
  inserted++
}

console.log(`\n[timeline] done: collected=${collected.length} eligible=${eligible.length} inserted=${inserted} skipped(dupe)=${skipped}`)
console.log('[timeline] daily distribution:')
const sortedDays = [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0]))
for (const [d, c] of sortedDays) console.log(`  ${d}: ${c}`)

await browser.close()
await connection.quit()
process.exit(0)
