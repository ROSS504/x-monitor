export interface ThirdPartyTweet {
  tweetId: string
  authorHandle: string
  text: string
  postedAt: number
  lang: string
}

export interface ThirdPartySearchClient {
  search(query: string, opts?: { limit?: number; sinceMs?: number }): Promise<ThirdPartyTweet[]>
  name: string
}
