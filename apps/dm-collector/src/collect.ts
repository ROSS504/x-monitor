import type Database from 'better-sqlite3'
import type { XClient, DmMessage } from '@x-monitor/x-client'
import { dmsRepo } from '@x-monitor/db'

const SEVEN_DAYS_MS = 7 * 24 * 3600_000

export interface CollectInput {
  db: Database.Database
  accountId: number
  xc: XClient
  now?: number
}

export async function collectForAccount(i: CollectInput): Promise<{ fetched: number; inserted: number; attributed: number }> {
  const now = i.now ?? Date.now()
  const since = now - SEVEN_DAYS_MS
  const dms = await i.xc.listDMs(since)
  let inserted = 0
  let attributed = 0
  for (const d of dms) {
    const attrId = attributeDM(i.db, i.accountId, d, now)
    const id = dmsRepo(i.db).insertIfNew({
      accountId: i.accountId,
      conversationId: d.conversationId,
      senderHandle: d.senderHandle,
      messageId: d.messageId,
      text: d.text,
      sentAt: d.sentAt,
      attributedSentId: attrId,
    })
    if (id !== null) {
      inserted++
      if (attrId !== null) attributed++
    }
  }
  return { fetched: dms.length, inserted, attributed }
}

/**
 * Best-effort: link a DM to the most recent sent reply where the original post's
 * author matches the DM sender, within 14 days of send.
 */
function attributeDM(
  db: Database.Database,
  accountId: number,
  dm: DmMessage,
  now: number,
): number | null {
  const cutoff = now - 14 * 24 * 3600_000
  const candidates = db.prepare(`
    SELECT s.id AS sent_id, p.author_handle AS author
    FROM sent s
    JOIN drafts d ON d.id = s.draft_id
    JOIN posts p ON p.id = d.post_id
    WHERE s.account_id = ? AND s.sent_at >= ?
    ORDER BY s.sent_at DESC
  `).all(accountId, cutoff) as { sent_id: number; author: string }[]
  const match = candidates.find(c => c.author.toLowerCase() === dm.senderHandle.toLowerCase())
  return match ? match.sent_id : null
}
