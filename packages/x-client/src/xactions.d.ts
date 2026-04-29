declare module 'xactions' {
  export interface XActionsBrowser { close(): Promise<void> }
  export interface XActionsPage { close(): Promise<void> }
  export interface XActionsTweet {
    id: string
    text: string | null
    author: string | null
    timestamp: string | null
    url: string | null
    likes?: string | null
  }
  export function createBrowser(opts?: { headless?: boolean }): Promise<XActionsBrowser>
  export function createPage(browser: XActionsBrowser): Promise<XActionsPage>
  export function loginWithCookie(page: XActionsPage, authToken: string): Promise<XActionsPage>
  export function searchTweets(
    page: XActionsPage,
    query: string,
    opts?: { limit?: number; filter?: 'latest' | 'top' | 'people' | 'photos' | 'videos' },
  ): Promise<XActionsTweet[]>

  export interface EngagementAnalyticsResult {
    url: string
    analytics: {
      likes: string
      reposts: string
      replies: string
      impressions: string
    } | null
    scrapedAt: string
  }
  interface EngagementManager {
    replyToTweet(
      page: XActionsPage,
      tweetUrl: string,
      replyText: string,
      opts?: { media?: string | null },
    ): Promise<{ success: boolean; action: string; url: string; reply: string; timestamp: string }>
    getEngagementAnalytics(page: XActionsPage, tweetUrl: string): Promise<EngagementAnalyticsResult>
  }
  export const engagementManager: EngagementManager

  export interface DmConversation {
    name: string
    lastMessage: string
    time: string
    unread: boolean
  }
  export interface DmExportedMessage {
    text: string
    time: string
    sender: string
  }
  interface DmManager {
    getConversations(
      page: XActionsPage,
      opts?: { limit?: number },
    ): Promise<{ conversations: DmConversation[]; scrapedAt: string }>
    exportConversation(
      page: XActionsPage,
      conversationUrl: string,
      opts?: { limit?: number },
    ): Promise<{ conversationUrl: string; messages: DmExportedMessage[]; count: number; exportedAt: string }>
  }
  export const dmManager: DmManager
}
