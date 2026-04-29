import type Database from 'better-sqlite3'
import type { DifyManager } from '@x-monitor/dify-client'
import { kbDocsRepo } from '@x-monitor/db'

export interface SyncDeps {
  db: Database.Database
  manager: DifyManager
}

export async function syncOnce(d: SyncDeps): Promise<{ pages: number; docs: number; updated: number }> {
  let page = 1
  let pages = 0
  let docs = 0
  let updated = 0
  while (true) {
    const r = await d.manager.listDocuments({ page, limit: 50 })
    pages++
    docs += r.docs.length
    for (const doc of r.docs) {
      const before = kbDocsRepo(d.db).findByDifyId(doc.id)
      kbDocsRepo(d.db).upsert({
        difyDocId: doc.id,
        name: doc.name,
        wordCount: doc.wordCount,
        hitCount: doc.hitCount,
        enabled: doc.enabled,
        indexingStatus: doc.indexingStatus,
        dataSourceType: doc.dataSourceType,
        difyCreatedAt: doc.createdAt,
      })
      if (!before || before.name !== doc.name || before.wordCount !== doc.wordCount || before.hitCount !== doc.hitCount) {
        updated++
      }
    }
    if (!r.hasMore) break
    page++
  }
  return { pages, docs, updated }
}
