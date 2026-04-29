import { describe, it, expect } from 'vitest'
import { buildSynthesizeReplyPrompt, parseSynthesizeReplyResponse } from '../src/synthesizeReply.js'

describe('buildSynthesizeReplyPrompt', () => {
  it('includes post, viewpoint, and all chunks with their article info', () => {
    const p = buildSynthesizeReplyPrompt({
      post: { text: 'Staking taxes seem unfair', authorHandle: 'alice', viewpoint: 'frustrated with tax timing' },
      chunks: [
        { id: 'staking-1', text: 'Staking is taxed at FMV at receipt', articleTitle: 'Staking Tax', articleUrl: 'https://fintax.tech/staking-tax' },
        { id: 'defi-1', text: 'DeFi tax varies by jurisdiction', articleTitle: 'DeFi Tax', articleUrl: 'https://fintax.tech/defi-tax' },
      ],
    })
    expect(p).toContain('Staking taxes seem unfair')
    expect(p).toContain('@alice')
    expect(p).toContain('frustrated with tax timing')
    expect(p).toContain('staking-1')
    expect(p).toContain('defi-1')
    expect(p).toContain('https://fintax.tech/staking-tax')
    expect(p).toMatch(/280/)
  })
})

describe('buildSynthesizeReplyPrompt with playbooks', () => {
  it('appends playbook hints when provided', () => {
    const p = buildSynthesizeReplyPrompt({
      post: { text: 'Staking taxes', authorHandle: 'a', viewpoint: 'asks' },
      chunks: [{ id: 'c1', text: 't', articleTitle: 'T', articleUrl: 'https://x' }],
      playbooks: [{ name: 'Tax season', strategyText: 'Mention deadline urgency' }],
    })
    expect(p).toContain('Tax season: Mention deadline urgency')
    expect(p).toContain('playbook hints')
  })
  it('omits the playbook section when empty', () => {
    const p = buildSynthesizeReplyPrompt({
      post: { text: 't', authorHandle: 'a', viewpoint: 'v' },
      chunks: [{ id: 'c1', text: 't', articleTitle: 'T', articleUrl: 'https://x' }],
    })
    expect(p).not.toContain('playbook hints')
  })
})

describe('parseSynthesizeReplyResponse', () => {
  it('extracts content + citations', () => {
    const raw = '```json\n{"content":"Tax timing is tough.","citations":[{"chunkId":"staking-1","quote":"FMV"}]}\n```'
    const r = parseSynthesizeReplyResponse(raw)
    expect(r.content).toBe('Tax timing is tough.')
    expect(r.citations[0].chunkId).toBe('staking-1')
  })
})
