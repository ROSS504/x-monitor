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
      const r = await engagementManager.replyToTweet(page, url, content)
      if (!r.success) throw new Error(`replyToTweet failed for ${replyToTweetId}`)
      // After replying, look up the most recent NON-PINNED tweet on the account's profile.
      // That tweet IS the one we just posted (we control timing). This gives a real tweet_id
      // that can be chained for thread replies.
      try {
        await (page as any).goto(`https://x.com/${accountHandle}/with_replies`, { waitUntil: 'domcontentloaded', timeout: 20_000 })
        await new Promise(r => setTimeout(r, 2500))
        const newId = (await (page as any).evaluate(`
          (function() {
            var arts = document.querySelectorAll('article[data-testid="tweet"]');
            for (var i = 0; i < arts.length; i++) {
              var social = arts[i].querySelector('[data-testid="socialContext"]');
              if (social && /pin|置顶/i.test(social.textContent || '')) continue;
              var anchors = arts[i].querySelectorAll('a[href*="/status/"]');
              for (var j = 0; j < anchors.length; j++) {
                var h = anchors[j].getAttribute('href') || '';
                var m = h.match(/^\\/[^/]+\\/status\\/(\\d+)$/);
                if (m) return m[1];
              }
            }
            return null;
          })()
        `)) as string | null
        if (newId) return { tweetId: newId }
      } catch {
        // fall through to synthetic id
      }
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
