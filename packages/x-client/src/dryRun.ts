import type { XClient, XSearchResult, DmMessage } from './client.js'

export interface DryRunXClient extends XClient {
  posted: { replyToTweetId: string; content: string; account: string; tweetId: string; kind?: 'reply' | 'quote'; quotedSourceUrl?: string }[]
  seedSearch: (results: XSearchResult[]) => void
  seedDMs: (dms: DmMessage[]) => void
  readonly dmInbox: DmMessage[]
}

export function createDryRunClient(seeded: XSearchResult[] = []): DryRunXClient {
  const posted: DryRunXClient['posted'] = []
  let searchSeed = [...seeded]
  let dmInboxArr: DmMessage[] = []
  let counter = 0
  const client: DryRunXClient = {
    posted,
    seedSearch(r) { searchSeed = [...r] },
    seedDMs(dms: DmMessage[]) { dmInboxArr = [...dms] },
    get dmInbox() { return dmInboxArr },
    async search(_q, _since) { return searchSeed },
    async postReply(replyToTweetId, content, account) {
      const tweetId = `dry-${++counter}`
      posted.push({ replyToTweetId, content, account, tweetId, kind: 'reply' })
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
    async quoteTweet(sourceUrl, content, account) {
      const tweetId = `dry-${++counter}`
      posted.push({ replyToTweetId: '', quotedSourceUrl: sourceUrl, content, account, tweetId, kind: 'quote' })
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
    async listDMs(sinceMs: number) {
      return dmInboxArr.filter(d => d.sentAt >= sinceMs)
    },
  }
  return client
}
