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

  interface EngagementManager {
    replyToTweet(
      page: XActionsPage,
      tweetUrl: string,
      replyText: string,
      opts?: { media?: string | null },
    ): Promise<{ success: boolean; action: string; url: string; reply: string; timestamp: string }>
  }
  export const engagementManager: EngagementManager
}
