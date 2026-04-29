import { describe, it, expect } from 'vitest'
import { createDifyClient } from '../src/client.js'

function fakeFetch(body: any, init: { ok?: boolean; status?: number; text?: string } = {}): typeof fetch {
  return (async () => ({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    text: async () => init.text ?? '',
    json: async () => body,
  })) as unknown as typeof fetch
}

describe('createDifyClient', () => {
  it('groups chunks by document and ranks by max chunk score', async () => {
    const fetchImpl = fakeFetch({
      query: { content: 'staking' },
      records: [
        { segment: { id: 'c1', content: 'Staking is taxed at FMV', document: { id: 'doc-staking', name: 'https://fintax.tech/staking-tax' } }, score: 0.9 },
        { segment: { id: 'c2', content: 'Capital gains on disposal',  document: { id: 'doc-staking', name: 'https://fintax.tech/staking-tax' } }, score: 0.7 },
        { segment: { id: 'c3', content: 'DeFi LP varies by jurisdiction', document: { id: 'doc-defi', name: 'https://fintax.tech/defi-tax' } }, score: 0.4 },
      ],
    })
    const search = createDifyClient({ apiKey: 'k', datasetId: 'ds', fetchImpl })
    const r = await search('staking')
    expect(r).toHaveLength(2)
    expect(r[0].article.id).toBe('doc-staking')
    expect(r[0].score).toBe(0.9)
    expect(r[0].chunks).toHaveLength(2)
    expect(r[0].article.url).toBe('https://fintax.tech/staking-tax')
    expect(r[1].article.id).toBe('doc-defi')
  })

  it('throws on non-ok response with message', async () => {
    const fetchImpl = fakeFetch({}, { ok: false, status: 401, text: 'unauthorized' })
    const search = createDifyClient({ apiKey: 'bad', datasetId: 'ds', fetchImpl })
    await expect(search('x')).rejects.toThrow(/401/)
  })

  it('passes the api key as a Bearer token', async () => {
    let capturedAuth = ''
    const fetchImpl = (async (_url: any, init: any) => {
      capturedAuth = init.headers.Authorization
      return { ok: true, status: 200, json: async () => ({ query: { content: '' }, records: [] }) }
    }) as unknown as typeof fetch
    const search = createDifyClient({ apiKey: 'sk-abc', datasetId: 'ds', fetchImpl })
    await search('q')
    expect(capturedAuth).toBe('Bearer sk-abc')
  })

  it('falls back to placeholder URL when document name is not a URL', async () => {
    const fetchImpl = fakeFetch({
      query: { content: 'x' },
      records: [{ segment: { id: 'c1', content: 'x', document: { id: 'doc-1', name: 'plain-text-name.pdf' } }, score: 0.5 }],
    })
    const search = createDifyClient({ apiKey: 'k', datasetId: 'ds', fetchImpl })
    const r = await search('x')
    expect(r[0].article.url).toBe('https://fintax.tech/kb/doc-1')
  })
})
