import { describe, it, expect } from 'vitest'
import { createDifyManager } from '../src/manager.js'

function fakeFetch(body: unknown, init: { ok?: boolean; status?: number; text?: string } = {}): typeof fetch {
  return (async () => ({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    text: async () => init.text ?? '',
    json: async () => body,
  })) as unknown as typeof fetch
}

describe('createDifyManager', () => {
  it('createDocByText posts payload and parses response', async () => {
    let captured: any = null
    const fetchImpl = (async (_url: any, init: any) => {
      captured = JSON.parse(init.body as string)
      return { ok: true, status: 200, json: async () => ({ document: { id: 'doc-1', name: 'My Doc' }, batch: 'b1' }) }
    }) as unknown as typeof fetch
    const m = createDifyManager({ apiKey: 'k', datasetId: 'ds', fetchImpl })
    const r = await m.createDocByText({ name: 'My Doc', text: 'hello' })
    expect(r.id).toBe('doc-1')
    expect(captured.name).toBe('My Doc')
    expect(captured.text).toBe('hello')
    expect(captured.indexing_technique).toBe('high_quality')
  })

  it('listDocuments maps snake_case fields and respects paging params', async () => {
    let calledUrl = ''
    const fetchImpl = (async (url: any) => {
      calledUrl = String(url)
      return {
        ok: true, status: 200,
        json: async () => ({
          data: [
            { id: 'a', name: 'A.md', position: 0, data_source_type: 'upload_file', indexing_status: 'completed', enabled: true, word_count: 100, hit_count: 5, created_at: 1700000000 },
            { id: 'b', name: 'B.md', position: 1, data_source_type: 'upload_file', indexing_status: 'completed', enabled: false, word_count: 50,  hit_count: 0, created_at: '2026-01-01T00:00:00Z' },
          ],
          has_more: false, limit: 20, total: 2, page: 1,
        }),
      }
    }) as unknown as typeof fetch
    const m = createDifyManager({ apiKey: 'k', datasetId: 'ds', fetchImpl })
    const r = await m.listDocuments({ page: 1, limit: 20, keyword: 'A' })
    expect(calledUrl).toContain('/datasets/ds/documents')
    expect(calledUrl).toContain('keyword=A')
    expect(r.docs).toHaveLength(2)
    expect(r.docs[0].dataSourceType).toBe('upload_file')
    expect(r.docs[0].createdAt).toBe(1700000000)
    expect(r.docs[1].createdAt).toBe(Date.parse('2026-01-01T00:00:00Z'))
  })

  it('throws with status code on non-ok', async () => {
    const m = createDifyManager({ apiKey: 'k', datasetId: 'ds', fetchImpl: fakeFetch({}, { ok: false, status: 401, text: 'unauthorized' }) })
    await expect(m.createDocByText({ name: 'x', text: 'y' })).rejects.toThrow(/401/)
  })

  it('passes Bearer token', async () => {
    let captured = ''
    const fetchImpl = (async (_url: any, init: any) => {
      captured = init.headers.Authorization
      return { ok: true, status: 200, json: async () => ({ data: [], has_more: false, limit: 20, total: 0, page: 1 }) }
    }) as unknown as typeof fetch
    const m = createDifyManager({ apiKey: 'sk-abc', datasetId: 'ds', fetchImpl })
    await m.listDocuments()
    expect(captured).toBe('Bearer sk-abc')
  })
})
