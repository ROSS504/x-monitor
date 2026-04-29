import type { XClient, XSearchResult } from './client.js'

export interface DryRunXClient extends XClient {
  posted: { replyToTweetId: string; content: string; account: string; tweetId: string }[]
  seedSearch: (results: XSearchResult[]) => void
}

export function createDryRunClient(seeded: XSearchResult[] = []): DryRunXClient {
  const posted: DryRunXClient['posted'] = []
  let searchSeed = [...seeded]
  let counter = 0
  const client: DryRunXClient = {
    posted,
    seedSearch(r) { searchSeed = [...r] },
    async search(_q, _since) { return searchSeed },
    async postReply(replyToTweetId, content, account) {
      const tweetId = `dry-${++counter}`
      posted.push({ replyToTweetId, content, account, tweetId })
      searchSeed.push({
        tweetId,
        authorHandle: account,
        text: content,
        postedAt: Date.now(),
        lang: 'en',
        metrics: { likes: 0, retweets: 0, replies: 0, bookmarks: 0 },
      })
      return { tweetId }
    },
    async getTweet(tweetId) {
      return searchSeed.find(r => r.tweetId === tweetId) ?? null
    },
  }
  return client
}
