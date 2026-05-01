import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import {
  createBrowser,
  createPage,
  loginWithCookie,
  searchTweets,
  engagementManager,
  dmManager,
  type XActionsBrowser,
  type XActionsPage,
} from 'xactions'
import type { XClient, XSearchResult, DmMessage } from './client.js'
import { parseCount } from './parseCounts.js'

interface CookieEntry {
  name: string
  value: string
  domain?: string
}

export interface LiveClientOptions {
  cookiesPath: string
  headless?: boolean
}

export interface LiveXClient extends XClient {
  shutdown(): Promise<void>
}

function readAuthToken(cookiesPath: string): string {
  const raw = readFileSync(cookiesPath, 'utf8')
  const cookies = JSON.parse(raw) as CookieEntry[]
  const auth = cookies.find(c => c.name === 'auth_token')
  if (!auth) throw new Error(`auth_token not found in ${cookiesPath}`)
  return auth.value
}

function parsePostedAt(ts: string | null): number {
  if (!ts) return Date.now()
  const ms = Date.parse(ts)
  return Number.isNaN(ms) ? Date.now() : ms
}

function searchMetricsFromLikes(likesStr: string | null) {
  return { likes: parseCount(likesStr), retweets: 0, replies: 0, bookmarks: 0 }
}

function dmMessageId(name: string, text: string, time: string): string {
  return createHash('sha1').update(`${name}|${time}|${text}`).digest('hex').slice(0, 32)
}

/**
 * Click the primary submit button. X uses several data-testids; also fall back
 * to aria-label / text matching ("Reply" / "Post" / "Tweet" / "发布" / "回复").
 */
async function clickSubmit(page: any): Promise<boolean> {
  const candidates = [
    '[data-testid="tweetButtonInline"]',
    '[data-testid="tweetButton"]',
    '[data-testid="tweetButtonInlineV2"]',
  ]
  for (const sel of candidates) {
    try {
      const el = await page.$(sel)
      if (!el) continue
      const disabled = await page.evaluate(`(function(){var e=document.querySelector(${JSON.stringify(sel)}); return e ? (e.getAttribute('aria-disabled')==='true' || e.disabled) : true;})()`)
      if (disabled) continue
      await el.click()
      return true
    } catch {}
  }
  return await page.evaluate(`
    (function() {
      var nodes = document.querySelectorAll('button, [role="button"]');
      for (var i = 0; i < nodes.length; i++) {
        var l = (nodes[i].getAttribute('aria-label') || '').toLowerCase();
        var t = (nodes[i].textContent || '').toLowerCase();
        if (/^(reply|tweet|post|发布|发帖|回复)$/.test(l) || /^(reply|tweet|post|发布|发帖|回复)$/.test(t)) {
          if (nodes[i].getAttribute('aria-disabled') === 'true') continue;
          nodes[i].click();
          return true;
        }
      }
      return false;
    })()
  `)
}

/**
 * Compose a NEW tweet that quote-embeds the source URL. Appears in the user's
 * main profile timeline (Posts tab), unlike replies which only appear under
 * /with_replies. Returns true on apparent success.
 */
async function quoteOnPage(page: any, sourceUrl: string, text: string): Promise<boolean> {
  // /compose/post opens the standalone composer with the textarea immediately focused
  await page.goto('https://x.com/compose/post', { waitUntil: 'domcontentloaded', timeout: 25_000 })
  await new Promise(r => setTimeout(r, 1500))
  const composer = '[data-testid="tweetTextarea_0"]'
  await page.waitForSelector(composer, { timeout: 15_000 })
  await page.click(composer)
  await new Promise(r => setTimeout(r, 300))
  // Type body text first, then a blank line, then the source URL last so X
  // unfurls it as a quote-card at the bottom.
  await page.keyboard.type(text, { delay: 12 })
  await page.keyboard.type('\n\n', { delay: 30 })
  await page.keyboard.type(sourceUrl, { delay: 12 })
  // Wait for X to fetch the quote-card preview
  await new Promise(r => setTimeout(r, 2500))
  const ok = await clickSubmit(page)
  if (!ok) return false
  await new Promise(r => setTimeout(r, 4000))
  return true
}

/**
 * Robust reply: navigates to tweet URL, clicks reply, types text, finds the
 * primary submit button (X uses different data-testids depending on the
 * composer surface and locale). Returns true on apparent success.
 */
async function replyOnPage(page: any, tweetUrl: string, replyText: string): Promise<boolean> {
  await page.goto(tweetUrl, { waitUntil: 'domcontentloaded', timeout: 25_000 })
  await new Promise(r => setTimeout(r, 2000))
  // Focus reply textarea — testid is stable across locales
  const replyInput = '[data-testid="tweetTextarea_0"]'
  await page.waitForSelector(replyInput, { timeout: 15_000 })
  await page.click(replyInput)
  await new Promise(r => setTimeout(r, 400))
  // Type the text. Use insertText via Keyboard API for better unicode handling.
  await page.keyboard.type(replyText, { delay: 15 })
  await new Promise(r => setTimeout(r, 700))
  if (!(await clickSubmit(page))) return false
  await new Promise(r => setTimeout(r, 4000))
  return true
}

async function findOurNewestTweetId(page: any, accountHandle: string): Promise<string | null> {
  await page.goto(`https://x.com/${accountHandle}/with_replies`, { waitUntil: 'domcontentloaded', timeout: 20_000 })
  await new Promise(r => setTimeout(r, 2500))
  return (await page.evaluate(`
    (function() {
      var handle = ${JSON.stringify(accountHandle.toLowerCase())};
      var arts = document.querySelectorAll('article[data-testid="tweet"]');
      var best = null;
      var bestTime = 0;
      for (var i = 0; i < arts.length; i++) {
        var social = arts[i].querySelector('[data-testid="socialContext"]');
        if (social && /pin|置顶/i.test(social.textContent || '')) continue;
        var anchors = arts[i].querySelectorAll('a[href*="/status/"]');
        var perma = '';
        for (var j = 0; j < anchors.length; j++) {
          var h = anchors[j].getAttribute('href') || '';
          var m = h.match(/^\\/([^/]+)\\/status\\/(\\d+)$/);
          if (m && m[1].toLowerCase() === handle) { perma = m[2]; break; }
        }
        if (!perma) continue;
        var t = arts[i].querySelector('time');
        var dt = t ? Date.parse(t.getAttribute('datetime') || '') : 0;
        if (dt > bestTime) { best = perma; bestTime = dt; }
      }
      return best;
    })()
  `)) as string | null
}

export async function createLiveClient(opts: LiveClientOptions): Promise<LiveXClient> {
  const authToken = readAuthToken(opts.cookiesPath)
  const browser: XActionsBrowser = await createBrowser({ headless: opts.headless ?? true })
  const page: XActionsPage = await createPage(browser)
  await loginWithCookie(page, authToken)

  return {
    async search(query: string, _sinceMs: number): Promise<XSearchResult[]> {
      const tweets = await searchTweets(page, query, { limit: 50, filter: 'latest' })
      return tweets
        .filter(t => t.id && t.author && t.text)
        .map(t => ({
          tweetId: t.id,
          authorHandle: t.author!,
          text: t.text!,
          postedAt: parsePostedAt(t.timestamp),
          lang: 'en',
          metrics: searchMetricsFromLikes(t.likes ?? null),
        }))
    },

    async postReply(replyToTweetId: string, content: string, accountHandle: string): Promise<{ tweetId: string }> {
      const url = `https://x.com/i/web/status/${replyToTweetId}`
      const ok = await replyOnPage(page, url, content)
      if (!ok) throw new Error(`replyToTweet failed for ${replyToTweetId}`)
      try {
        const newId = await findOurNewestTweetId(page, accountHandle)
        if (newId) return { tweetId: newId }
      } catch {}
      return { tweetId: `live-${accountHandle}-${Date.now()}` }
    },

    async quoteTweet(sourceUrl: string, content: string, accountHandle: string): Promise<{ tweetId: string }> {
      const ok = await quoteOnPage(page, sourceUrl, content)
      if (!ok) throw new Error(`quoteTweet failed for ${sourceUrl}`)
      try {
        const newId = await findOurNewestTweetId(page, accountHandle)
        if (newId) return { tweetId: newId }
      } catch {}
      return { tweetId: `live-${accountHandle}-${Date.now()}` }
    },

    async getTweet(tweetId: string): Promise<XSearchResult | null> {
      // xactions's getEngagementAnalytics returns metric strings (likes/reposts/replies/impressions)
      // for a given tweet URL. It does NOT surface authorHandle or text — callers (analytics-worker
      // snapshot) only consume `metrics`, so we leave handle/text as placeholders.
      const url = `https://x.com/i/web/status/${tweetId}`
      try {
        const result = await engagementManager.getEngagementAnalytics(page, url)
        if (!result.analytics) return null
        return {
          tweetId,
          authorHandle: 'unknown',
          text: '',
          postedAt: Date.parse(result.scrapedAt) || Date.now(),
          lang: 'en',
          metrics: {
            likes: parseCount(result.analytics.likes),
            retweets: parseCount(result.analytics.reposts),
            replies: parseCount(result.analytics.replies),
            bookmarks: 0, // xactions doesn't surface bookmarks via getEngagementAnalytics
            views: parseCount(result.analytics.impressions) || undefined,
          },
        }
      } catch {
        return null
      }
    },

    async listDMs(sinceMs: number): Promise<DmMessage[]> {
      // xactions's getConversations only returns conversation summaries (name/lastMessage/time/unread),
      // not individual messageIds. We synthesize a stable hash-based messageId so dm-collector's
      // insertIfNew dedupes correctly across polls. Older message history isn't fetched here.
      try {
        const r = await dmManager.getConversations(page, { limit: 50 })
        return r.conversations
          .map(c => {
            const sentAt = parsePostedAt(c.time || null)
            return {
              conversationId: c.name || 'unknown',
              messageId: dmMessageId(c.name, c.lastMessage, c.time),
              senderHandle: c.name.replace(/^@/, '').trim() || 'unknown',
              text: c.lastMessage,
              sentAt,
            }
          })
          .filter(d => d.sentAt >= sinceMs)
      } catch {
        return []
      }
    },

    async shutdown() {
      await page.close()
      await browser.close()
    },
  }
}
