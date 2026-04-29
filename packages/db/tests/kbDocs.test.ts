import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { migrate } from '../src/migrate.js'
import { kbDocsRepo } from '../src/repos/kbDocs.js'

describe('kbDocsRepo', () => {
  let db: Database.Database
  beforeEach(() => { db = new Database(':memory:'); migrate(db) })
  afterEach(() => { db.close() })

  it('upsert inserts then updates the same dify_doc_id', () => {
    const id = kbDocsRepo(db).upsert({
      difyDocId: 'd1', name: 'Doc A', wordCount: 100, hitCount: 5,
      enabled: true, indexingStatus: 'completed', dataSourceType: 'text',
      difyCreatedAt: 1700,
    })
    expect(id).toBeGreaterThan(0)
    expect(kbDocsRepo(db).count()).toBe(1)
    kbDocsRepo(db).upsert({
      difyDocId: 'd1', name: 'Doc A renamed', wordCount: 150, hitCount: 7,
      enabled: false, difyCreatedAt: 1700,
    })
    expect(kbDocsRepo(db).count()).toBe(1)
    const found = kbDocsRepo(db).findByDifyId('d1')
    expect(found?.name).toBe('Doc A renamed')
    expect(found?.wordCount).toBe(150)
    expect(found?.enabled).toBe(false)
  })

  it('list orders by dify_created_at desc', () => {
    kbDocsRepo(db).upsert({ difyDocId: 'older', name: 'O', wordCount: 0, hitCount: 0, enabled: true, difyCreatedAt: 1000 })
    kbDocsRepo(db).upsert({ difyDocId: 'newer', name: 'N', wordCount: 0, hitCount: 0, enabled: true, difyCreatedAt: 2000 })
    const docs = kbDocsRepo(db).list()
    expect(docs.map(d => d.difyDocId)).toEqual(['newer', 'older'])
  })
})
