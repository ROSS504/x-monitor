export type PostStatus =
  | 'discovered' | 'analyzing' | 'matched_article' | 'no_match'
  | 'drafting' | 'failed' | 'archived'

export type DraftStatus = 'pending' | 'approved' | 'rejected' | 'sent'

export interface Account {
  id: number
  handle: string
  role: 'official' | 'personal' | 'founder'
  cookiesPath: string
  dailyLimit: number
  minIntervalMin: number
  businessHours: { startHour: number; endHour: number; tz: string }
  cooldownUntil: number | null
}

export interface Post {
  id: number
  tweetId: string
  authorHandle: string
  text: string
  postedAt: number
  lang: string
  source: 'browser' | '3rdparty'
  scenarioHint: string | null
  status: PostStatus
  traceId: string
}

export interface Draft {
  id: number
  postId: number
  accountId: number
  content: string
  format: 'single' | 'thread' | 'quote'
  citations: { chunkId: string; quote: string }[]
  strategy: string | null
  status: DraftStatus
  idempotencyKey: string
}
