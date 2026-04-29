import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { migrate, kbDocsRepo } from '@x-monitor/db'
import type { DifyManager } from '@x-monitor/dify-client'
import { syncOnce } from '../src/sync.js'

function fakeManager(pages: { docs: any[]; hasMore: boolean }[]): DifyManager {
  let i = 0
  return {
    async createDocByText() { throw new Error('not used') },
    async listDocuments() {
      const p = pages[i] ?? { docs: [], hasMore: false }
      i++
      return { docs: p.docs, total: p.docs.length, hasMore: p.hasMore }
    },
  }
}

describe('syncOnce', () => {
  let db: Database.Database
  beforeEach(() => { db = new Database(':memory:'); migrate(db) })
  afterEach(() => { db.close() })

  it('upserts docs across paginated pages', async () => {
    const manager = fakeManager([
      { docs: [
        { id: 'a', name: 'A', position: 0, dataSourceType: 'text', indexingStatus: 'completed', enabled: true, wordCount: 100, hitCount: 5, createdAt: 1000 },
        { id: 'b', name: 'B', position: 1, dataSourceType: 'text', indexingStatus: 'completed', enabled: true, wordCount: 200, hitCount: 0, createdAt: 2000 },
      ], hasMore: true },
      { docs: [
        { id: 'c', name: 'C', position: 2, dataSourceType: 'text', indexingStatus: 'completed', enabled: false, wordCount: 50, hitCount: 1, createdAt: 3000 },
      ], hasMore: false },
    ])
    const r = await syncOnce({ db, manager })
    expect(r.pages).toBe(2)
    expect(r.docs).toBe(3)
    expect(r.updated).toBe(3)
    expect(kbDocsRepo(db).count()).toBe(3)
    const docs = kbDocsRepo(db).list()
    expect(docs[0].difyDocId).toBe('c')  // ordered by dify_created_at desc
  })

  it('marks unchanged docs as not updated', async () => {
    const docs = [{ id: 'a', name: 'A', position: 0, dataSourceType: 'text', indexingStatus: 'completed', enabled: true, wordCount: 100, hitCount: 5, createdAt: 1000 }]
    const manager = fakeManager([{ docs, hasMore: false }])
    await syncOnce({ db, manager })
    const r2 = await syncOnce({ db, manager: fakeManager([{ docs, hasMore: false }]) })
    expect(r2.docs).toBe(1)
    expect(r2.updated).toBe(0)
  })
})
