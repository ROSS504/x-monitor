import { readFileSync } from 'node:fs'
import {
  createBrowser,
  createPage,
  loginWithCookie,
  searchTweets,
  engagementManager,
  type XActionsBrowser,
  type XActionsPage,
} from 'xactions'
import type { XClient, XSearchResult } from './client.js'

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
        }))
    },

    async postReply(replyToTweetId: string, content: string, accountHandle: string): Promise<{ tweetId: string }> {
      const url = `https://x.com/i/web/status/${replyToTweetId}`
      const r = await engagementManager.replyToTweet(page, url, content)
      if (!r.success) throw new Error(`replyToTweet failed for ${replyToTweetId}`)
      // xactions reply doesn't surface the new reply tweet id; synthesize a unique-enough id
      return { tweetId: `live-${accountHandle}-${Date.now()}` }
    },

    async getTweet(_tweetId: string): Promise<XSearchResult | null> {
      // Out of scope for M1 — analytics-worker will need this in M2
      return null
    },

    async shutdown() {
      await page.close()
      await browser.close()
    },
  }
}
