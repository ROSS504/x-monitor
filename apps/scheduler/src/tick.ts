import type Database from 'better-sqlite3'
import { accountsRepo, scheduledRepo, sentRepo } from '@x-monitor/db'
import { computeTargetSendAt } from '@x-monitor/rules'

export interface TickInput {
  db: Database.Database
  now: number
  enqueue: (draftId: number, delayMs: number) => void
}

export async function tick(i: TickInput): Promise<{ scheduled: number; enqueuedReady: number }> {
  let scheduled = 0
  const approvedUnscheduled = i.db.prepare(`
    SELECT d.id AS id, d.account_id AS account_id FROM drafts d
    LEFT JOIN scheduled s ON s.draft_id = d.id
    WHERE d.status = 'approved' AND s.draft_id IS NULL
  `).all() as { id: number; account_id: number }[]

  for (const d of approvedUnscheduled) {
    const acct = accountsRepo(i.db).findById(d.account_id)
    if (!acct || (acct.cooldownUntil !== null && acct.cooldownUntil > i.now)) continue
    const lastSent = sentRepo(i.db).findLastForAccount(acct.id)?.sentAt ?? null
    const todayCount = sentRepo(i.db).countTodayForAccount(acct.id, i.now)
    const r = computeTargetSendAt({
      now: i.now,
      lastSentAt: lastSent,
      minIntervalMin: acct.minIntervalMin,
      dailyLimit: acct.dailyLimit,
      todayCount,
      businessHours: acct.businessHours,
    })
    scheduledRepo(i.db).upsert({ draftId: d.id, accountId: acct.id, targetSendAt: r.target, priority: 0 })
    scheduled++
  }

  const ready = scheduledRepo(i.db).findReadyToSend(i.now)
  for (const r of ready) {
    i.enqueue(r.draftId, 0)
  }
  return { scheduled, enqueuedReady: ready.length }
}
