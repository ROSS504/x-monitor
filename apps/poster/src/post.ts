import type Database from 'better-sqlite3'
import type { XClient } from '@x-monitor/x-client'
import { draftsRepo, postsRepo, accountsRepo, sentRepo } from '@x-monitor/db'
import { scheduleAllBuckets } from '@x-monitor/queue'

export async function sendOne(
  db: Database.Database,
  xc: XClient,
  draftId: number,
): Promise<{ tweetId: string; skipped?: 'duplicate' }> {
  const d = draftsRepo(db).findById(draftId)
  if (!d) throw new Error(`draft ${draftId} not found`)
  const existing = sentRepo(db).findByDraftId(draftId)
  if (existing) return { tweetId: existing.tweetId, skipped: 'duplicate' }

  const post = postsRepo(db).findById(d.postId)!
  const acct = accountsRepo(db).findById(d.accountId)!

  const r = await xc.postReply(post.tweetId, d.content, acct.handle)

  const sentId = sentRepo(db).insert({
    draftId: d.id,
    tweetId: r.tweetId,
    accountId: acct.id,
    sentAt: Date.now(),
  })
  draftsRepo(db).updateStatus(d.id, 'sent')
  try {
    await scheduleAllBuckets({ sentId, tweetId: r.tweetId, traceId: `draft-${d.id}` })
  } catch {
    // analytics scheduling is best-effort — never fail a send because of it
  }
  return { tweetId: r.tweetId }
}
