import { describe, it, expect } from 'vitest'
import { createTweetScoutClient } from '../src/tweetscout.js'

function fakeFetch(body: unknown, init: { ok?: boolean; status?: number; text?: string } = {}): typeof fetch {
  return (async () => ({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    text: async () => init.text ?? '',
    json: async () => body,
  })) as unknown as typeof fetch
}

describe('createTweetScoutClient', () => {
  it('parses array body and filters incomplete entries', async () => {
    const items = [
      { id_str: '1', full_text: 'hi', user: { screen_name: 'alice' }, created_at: 'Wed Apr 30 08:00:00 +0000 2026', lang: 'en' },
      { id_str: '2', user: { screen_name: 'bob' } },
      { id_str: '3', text: 'fallback', user: { screen_name: 'carol' }, created_at: 'Wed Apr 30 08:00:00 +0000 2026' },
    ]
    const c = createTweetScoutClient({ apiKey: 'k', fetchImpl: fakeFetch(items) })
    const r = await c.search('crypto')
    expect(r.map(t => t.tweetId)).toEqual(['1', '3'])
    expect(r[0].text).toBe('hi')
    expect(r[1].text).toBe('fallback')
  })

  it('parses {tweets:[...]} object response', async () => {
    const c = createTweetScoutClient({
      apiKey: 'k',
      fetchImpl: fakeFetch({ tweets: [{ id_str: '1', full_text: 'hi', user: { screen_name: 'a' }, created_at: 'Wed Apr 30 08:00:00 +0000 2026' }] }),
    })
    const r = await c.search('x')
    expect(r).toHaveLength(1)
  })

  it('passes ApiKey header', async () => {
    let captured = ''
    const fetchImpl = (async (_url: any, init: any) => {
      captured = init.headers.ApiKey
      return { ok: true, status: 200, json: async () => [], text: async () => '' }
    }) as unknown as typeof fetch
    const c = createTweetScoutClient({ apiKey: 'sk-xyz', fetchImpl })
    await c.search('x')
    expect(captured).toBe('sk-xyz')
  })

  it('throws on non-ok', async () => {
    const c = createTweetScoutClient({ apiKey: 'k', fetchImpl: fakeFetch([], { ok: false, status: 503, text: 'bad' }) })
    await expect(c.search('x')).rejects.toThrow(/503/)
  })
})
