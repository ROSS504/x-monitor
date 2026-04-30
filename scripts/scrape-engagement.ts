#!/usr/bin/env tsx
/**
 * Scrape engagement metrics (likes/retweets/replies/views) for all posts
 * matching a scenario_hint pattern. Stores results in post_engagement table.
 *
 * Usage:
 *   pnpm tsx scripts/scrape-engagement.ts <scenario_hint_like> [cookiesPath]
 *   pnpm tsx scripts/scrape-engagement.ts "scrape-user:@FinTax_Intern" /Users/nightyoung/twitter_cookies_fintax_intern.json
 */
import { readFileSync } from 'node:fs'
import { getDb, migrate, engagementRepo } from '@x-monitor/db'
import { createBrowser, createPage } from 'xactions'

/**
 * Read engagement counts off a tweet detail page using aria-label parsing.
 * Much more robust than data-testid which X mutates frequently.
 */
async function scrapeTweetEngagement(page: any, tweetUrl: string): Promise<{
  likes: number; retweets: number; replies: number; bookmarks: number; views: number
}> {
  await page.goto(tweetUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 })
  await new Promise(r => setTimeout(r, 2500))
  const SCRIPT = `
    (function() {
      function parseLeadingNum(s) {
        if (!s) return 0;
        var m = s.match(/^\\s*([\\d,.]+)\\s*([KkMmBb]?)/);
        if (!m) return 0;
        var v = parseFloat(m[1].replace(/,/g, ''));
        var unit = m[2].toLowerCase();
        var mult = unit === 'k' ? 1000 : unit === 'm' ? 1000000 : unit === 'b' ? 1000000000 : 1;
        return Math.round(v * mult);
      }
      function parseNumBefore(s, keyword) {
        if (!s) return 0;
        // match: "78 次观看", "202 次查看", "69 views", "1.2K views"
        var re = new RegExp('([\\\\d,.]+)\\\\s*([KkMmBb]?)\\\\s*(?:次)?\\\\s*' + keyword, 'i');
        var m = s.match(re);
        if (!m) return 0;
        var v = parseFloat(m[1].replace(/,/g, ''));
        var unit = m[2].toLowerCase();
        var mult = unit === 'k' ? 1000 : unit === 'm' ? 1000000 : unit === 'b' ? 1000000000 : 1;
        return Math.round(v * mult);
      }
      var article = document.querySelector('article[data-testid="tweet"]');
      var root = article || document;
      function aria(sel) {
        var e = root.querySelector(sel);
        return e ? (e.getAttribute('aria-label') || '') : '';
      }
      var likes = parseLeadingNum(aria('[data-testid="like"]') || aria('[data-testid="unlike"]'));
      var retweets = parseLeadingNum(aria('[data-testid="retweet"]') || aria('[data-testid="unretweet"]'));
      var replies = parseLeadingNum(aria('[data-testid="reply"]'));
      var bookmarks = parseLeadingNum(aria('[data-testid="bookmark"]') || aria('[data-testid="removeBookmark"]'));
      // Views: scan all aria-labels for "N views" / "N 次观看" / "N 次查看"
      var views = 0;
      var all = Array.prototype.slice.call(root.querySelectorAll('[aria-label]'));
      for (var i = 0; i < all.length; i++) {
        var l = all[i].getAttribute('aria-label') || '';
        var v = Math.max(
          parseNumBefore(l, 'views?'),
          parseNumBefore(l, '观看'),
          parseNumBefore(l, '查看')
        );
        if (v > views) views = v;
      }
      return { likes: likes, retweets: retweets, replies: replies, bookmarks: bookmarks, views: views };
    })()
  `
  return await page.evaluate(SCRIPT)
}

interface CookieEntry { name: string; value: string; domain?: string; path?: string; secure?: boolean; httpOnly?: boolean }

const [, , hintArg, cookiesArg] = process.argv
if (!hintArg) {
  console.error('Usage: pnpm tsx scripts/scrape-engagement.ts <scenario_hint> [cookiesPath]')
  process.exit(1)
}
const cookiesPath = cookiesArg ?? '/Users/nightyoung/twitter_cookies_fintax_intern.json'

const db = getDb(); migrate(db)

const posts = db.prepare(`SELECT id, tweet_id, author_handle, substr(text, 1, 60) AS preview FROM posts WHERE scenario_hint = ? ORDER BY posted_at DESC`)
  .all(hintArg) as Array<{ id: number; tweet_id: string; author_handle: string; preview: string }>

console.log(`[engagement] found ${posts.length} posts matching scenario_hint="${hintArg}"`)
if (posts.length === 0) process.exit(0)

const cookies = JSON.parse(readFileSync(cookiesPath, 'utf8')) as CookieEntry[]
console.log(`[engagement] loaded ${cookies.length} cookies from ${cookiesPath}`)

const browser = await createBrowser({ headless: process.env.SCRAPE_HEADLESS !== '0' }) as any
const page = await createPage(browser) as any
await page.setCookie(...cookies.map(c => ({
  name: c.name, value: c.value,
  domain: c.domain ?? '.x.com',
  path: c.path ?? '/',
  secure: c.secure ?? true,
  httpOnly: c.httpOnly ?? false,
})))
// Warm up: load home so X recognizes the session
await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 20_000 })
await new Promise(r => setTimeout(r, 1500))

let scraped = 0
const totals = { likes: 0, retweets: 0, replies: 0, views: 0 }

for (const p of posts) {
  const tweetUrl = `https://x.com/${p.author_handle}/status/${p.tweet_id}`
  try {
    const m = await scrapeTweetEngagement(page, tweetUrl)
    const { likes, retweets, replies, views } = m
    engagementRepo(db).insert({ postId: p.id, likes, retweets, replies, bookmarks: m.bookmarks, views })
    scraped++
    totals.likes += likes
    totals.retweets += retweets
    totals.replies += replies
    totals.views += views
    console.log(`  + #${p.id} L${likes} RT${retweets} R${replies} V${views.toLocaleString()} - ${p.preview.replace(/\n/g, ' ')}`)
  } catch (e) {
    console.log(`  ! #${p.id} ERROR ${String(e).slice(0, 80)}`)
  }
}

console.log(`\n[engagement] done: scraped=${scraped}/${posts.length}`)
console.log(`[engagement] aggregate: likes=${totals.likes} retweets=${totals.retweets} replies=${totals.replies} views=${totals.views.toLocaleString()}`)

await browser.close()
process.exit(0)
