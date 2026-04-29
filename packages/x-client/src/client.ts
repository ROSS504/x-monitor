export interface XSearchResult {
  tweetId: string
  authorHandle: string
  text: string
  postedAt: number
  lang: string
}

export interface XClient {
  search(query: string, sinceMs: number): Promise<XSearchResult[]>
  postReply(replyToTweetId: string, content: string, accountHandle: string): Promise<{ tweetId: string }>
  getTweet(tweetId: string): Promise<XSearchResult | null>
}
