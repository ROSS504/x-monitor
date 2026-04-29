import { describe, it, expect } from 'vitest'
import { createApifyClient } from '../src/apify.js'

function fakeFetch(body: unknown, init: { ok?: boolean; status?: number; text?: string } = {}): typeof fetch {
  return (async () => ({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    text: async () => init.text ?? '',
    json: async () => body,
  })) as unknown as typeof fetch
}

describe('createApifyClient', () => {
  it('maps Apify items to ThirdPartyTweet shape, filters out incomplete rows', async () => {
    const items = [
      { id: '1', text: 'hello', author: { userName: 'alice' }, createdAt: '2026-04-30T08:00:00Z', lang: 'en' },
      { id: '2', text: '', author: { userName: 'bob' }, createdAt: '2026-04-30T08:00:00Z' },
      { id: '3', text: 'hi', author: { userName: 'carol' }, createdAt: '2026-04-30T08:00:00Z' },
    ]
    const c = createApifyClient({ apiToken: 't', fetchImpl: fakeFetch(items) })
    const r = await c.search('crypto')
    expect(r.map(t => t.tweetId)).toEqual(['1', '3'])
    expect(r[0].authorHandle).toBe('alice')
    expect(r[0].postedAt).toBe(Date.parse('2026-04-30T08:00:00Z'))
  })

  it('respects sinceMs cutoff', async () => {
    const items = [
      { id: 'old', text: 'x', author: { userName: 'a' }, createdAt: '2020-01-01T00:00:00Z' },
      { id: 'new', text: 'x', author: { userName: 'a' }, createdAt: '2026-04-30T08:00:00Z' },
    ]
    const c = createApifyClient({ apiToken: 't', fetchImpl: fakeFetch(items) })
    const r = await c.search('x', { sinceMs: Date.parse('2025-01-01T00:00:00Z') })
    expect(r.map(t => t.tweetId)).toEqual(['new'])
  })

  it('throws on non-ok response', async () => {
    const c = createApifyClient({ apiToken: 't', fetchImpl: fakeFetch({}, { ok: false, status: 401, text: 'no' }) })
    await expect(c.search('x')).rejects.toThrow(/401/)
  })

  it('exposes name "apify"', () => {
    const c = createApifyClient({ apiToken: 't', fetchImpl: fakeFetch([]) })
    expect(c.name).toBe('apify')
  })
})
