import type { ThirdPartySearchClient, ThirdPartyTweet } from './types.js'

export interface TweetScoutClientOptions {
  apiKey: string
  baseUrl?: string
  fetchImpl?: typeof fetch
}

interface TweetScoutTweet {
  id_str?: string
  full_text?: string
  text?: string
  created_at?: string
  user?: { screen_name?: string; lang?: string }
  lang?: string
}

export function createTweetScoutClient(opts: TweetScoutClientOptions): ThirdPartySearchClient {
  const baseUrl = opts.baseUrl ?? 'https://api.tweetscout.io/v2'
  const f = opts.fetchImpl ?? fetch

  return {
    name: 'tweetscout',
    async search(query, search = {}) {
      const url = `${baseUrl}/search-tweets`
      const res = await f(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ApiKey': opts.apiKey,
        },
        body: JSON.stringify({ query, sort: 'Latest' }),
      })
      if (!res.ok) {
        throw new Error(`TweetScout search failed: ${res.status} ${await res.text().catch(() => '')}`)
      }
      const data = (await res.json()) as { tweets?: TweetScoutTweet[] } | TweetScoutTweet[]
      const items: TweetScoutTweet[] = Array.isArray(data) ? data : (data.tweets ?? [])
      const since = search.sinceMs ?? 0
      const limit = search.limit ?? 50
      const out: ThirdPartyTweet[] = []
      for (const it of items) {
        const id = it.id_str
        const text = it.full_text ?? it.text
        const handle = it.user?.screen_name
        if (!id || !text || !handle) continue
        const postedAt = it.created_at ? Date.parse(it.created_at) : Date.now()
        if (Number.isNaN(postedAt) || postedAt < since) continue
        out.push({
          tweetId: id,
          authorHandle: handle,
          text,
          postedAt,
          lang: it.lang ?? it.user?.lang ?? 'en',
        })
        if (out.length >= limit) break
      }
      return out
    },
  }
}
