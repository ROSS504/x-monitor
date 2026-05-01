export interface TweetMetrics {
  likes: number
  retweets: number
  replies: number
  bookmarks: number
  views?: number
}

export interface XSearchResult {
  tweetId: string
  authorHandle: string
  text: string
  postedAt: number
  lang: string
  metrics?: TweetMetrics
}

export interface DmMessage {
  conversationId: string
  messageId: string
  senderHandle: string
  text: string
  sentAt: number
}

export interface XClient {
  search(query: string, sinceMs: number): Promise<XSearchResult[]>
  postReply(replyToTweetId: string, content: string, accountHandle: string): Promise<{ tweetId: string }>
  /**
   * Quote-tweet: a brand-new tweet by accountHandle that embeds the source as a quote card.
   * Appears in the account's main profile timeline (unlike replies). Returns the new tweet's id.
   */
  quoteTweet(sourceUrl: string, content: string, accountHandle: string): Promise<{ tweetId: string }>
  getTweet(tweetId: string): Promise<XSearchResult | null>
  listDMs(sinceMs: number): Promise<DmMessage[]>
}
