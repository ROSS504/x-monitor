import type { ThirdPartySearchClient, ThirdPartyTweet } from './types.js'

export interface ApifyClientOptions {
  apiToken: string
  /** Apify actor id, e.g. 'apidojo~tweet-scraper'. */
  actorId?: string
  baseUrl?: string
  fetchImpl?: typeof fetch
}

interface ApifyTweet {
  id?: string
  conversationId?: string
  url?: string
  text?: string
  createdAt?: string
  author?: { userName?: string; lang?: string }
  lang?: string
}

export function createApifyClient(opts: ApifyClientOptions): ThirdPartySearchClient {
  const baseUrl = opts.baseUrl ?? 'https://api.apify.com/v2'
  const actorId = opts.actorId ?? 'apidojo~tweet-scraper'
  const f = opts.fetchImpl ?? fetch

  return {
    name: 'apify',
    async search(query, search = {}) {
      const limit = search.limit ?? 50
      const url = `${baseUrl}/acts/${encodeURIComponent(actorId)}/run-sync-get-dataset-items?token=${encodeURIComponent(opts.apiToken)}`
      const body = {
        searchTerms: [query],
        maxItems: limit,
        sort: 'Latest',
      }
      const res = await f(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        throw new Error(`Apify run failed: ${res.status} ${await res.text().catch(() => '')}`)
      }
      const items = (await res.json()) as ApifyTweet[]
      const since = search.sinceMs ?? 0
      const out: ThirdPartyTweet[] = []
      for (const it of items) {
        if (!it.id || !it.text || !it.author?.userName) continue
        const postedAt = it.createdAt ? Date.parse(it.createdAt) : Date.now()
        if (Number.isNaN(postedAt) || postedAt < since) continue
        out.push({
          tweetId: it.id,
          authorHandle: it.author.userName,
          text: it.text,
          postedAt,
          lang: it.lang ?? it.author.lang ?? 'en',
        })
      }
      return out
    },
  }
}
