import type Database from 'better-sqlite3'
import type { XClient } from '@x-monitor/x-client'
import { draftsRepo, postsRepo, accountsRepo, sentRepo } from '@x-monitor/db'
import { scheduleAllBuckets } from '@x-monitor/queue'

const TWEET_LIMIT = 280
function partDelayMs(): number {
  return parseInt(process.env.POSTER_PART_DELAY_MS ?? '3000', 10)
}

function splitThread(content: string): string[] {
  // Split by double-newline (paragraph break) and trim
  const parts = content.split(/\n\s*\n/).map(s => s.trim()).filter(s => s.length > 0)
  // If any part still exceeds the tweet limit, hard-split it on whitespace
  const out: string[] = []
  for (const p of parts) {
    if (p.length <= TWEET_LIMIT) { out.push(p); continue }
    // Greedy word-boundary split
    let buf = ''
    for (const word of p.split(/(\s+)/)) {
      if ((buf + word).length > TWEET_LIMIT) {
        if (buf.trim()) out.push(buf.trim())
        buf = word
      } else {
        buf += word
      }
    }
    if (buf.trim()) out.push(buf.trim())
  }
  return out
}

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

export async function sendOne(
  db: Database.Database,
  xc: XClient,
  draftId: number,
): Promise<{ tweetId: string; skipped?: 'duplicate'; partsSent?: number }> {
  const d = draftsRepo(db).findById(draftId)
  if (!d) throw new Error(`draft ${draftId} not found`)
  const existing = sentRepo(db).findByDraftId(draftId)
  if (existing) return { tweetId: existing.tweetId, skipped: 'duplicate' }

  const post = postsRepo(db).findById(d.postId)!
  const acct = accountsRepo(db).findById(d.accountId)!

  const isThread = d.format === 'thread'
  const parts = isThread ? splitThread(d.content) : [d.content]

  let firstSentTweetId: string | null = null
  let lastTweetId = post.tweetId  // start by replying to the source post
  for (let i = 0; i < parts.length; i++) {
    const r = await xc.postReply(lastTweetId, parts[i], acct.handle)
    if (!firstSentTweetId) firstSentTweetId = r.tweetId
    lastTweetId = r.tweetId
    if (i < parts.length - 1) await sleep(partDelayMs())
  }
  if (!firstSentTweetId) throw new Error('no parts sent')

  const sentId = sentRepo(db).insert({
    draftId: d.id,
    tweetId: firstSentTweetId,
    accountId: acct.id,
    sentAt: Date.now(),
  })
  draftsRepo(db).updateStatus(d.id, 'sent')
  try {
    await scheduleAllBuckets({ sentId, tweetId: firstSentTweetId, traceId: `draft-${d.id}` })
  } catch {
    // analytics scheduling is best-effort
  }
  return { tweetId: firstSentTweetId, partsSent: parts.length }
}
