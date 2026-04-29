import { describe, it, expect } from 'vitest'
import { buildDraftFromArticlePrompt, parseDraftFromArticleResponse } from '../src/draftFromArticle.js'

describe('buildDraftFromArticlePrompt', () => {
  it('includes post, article chunks with chunk_ids, and length constraint', () => {
    const p = buildDraftFromArticlePrompt({
      post: { text: 'How are staking rewards taxed?', authorHandle: 'alice' },
      article: { id: 'art-staking', title: 'Staking Tax', url: 'https://fintax.tech/staking-tax' },
      chunks: [{ id: 'staking-1', text: 'Staking rewards are taxed at FMV...' }],
    })
    expect(p).toContain('staking-1')
    expect(p).toContain('https://fintax.tech/staking-tax')
    expect(p).toMatch(/280/)
  })
})

describe('parseDraftFromArticleResponse', () => {
  it('extracts content + citations[]', () => {
    const raw = '```json\n{"content":"Great question. ...","citations":[{"chunkId":"staking-1","quote":"taxed at FMV"}]}\n```'
    const r = parseDraftFromArticleResponse(raw)
    expect(r.content).toContain('Great question')
    expect(r.citations[0].chunkId).toBe('staking-1')
  })
})
