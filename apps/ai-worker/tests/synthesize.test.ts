import { describe, it, expect, vi } from 'vitest'
import { synthesizeOne } from '../src/synthesize.js'

describe('synthesizeOne', () => {
  it('returns no_kb_match when nothing matches', async () => {
    const fakeRun = vi.fn()
    const r = await synthesizeOne(
      { text: 'random pet food topic', authorHandle: 'a', viewpoint: 'pets' },
      { runPrompt: fakeRun },
    )
    expect(r.reason).toBe('no_kb_match')
    expect(r.draft).toBeNull()
    expect(fakeRun).not.toHaveBeenCalled()
  })

  it('synthesizes from top KB results', async () => {
    const fakeRun = vi.fn(async () => ({
      text: '{"content":"Synthesized reply.","citations":[{"chunkId":"staking-1","quote":"FMV"}]}',
      durationMs: 100,
    }))
    const r = await synthesizeOne(
      { text: 'How are crypto staking rewards taxed?', authorHandle: 'a', viewpoint: 'asks about staking' },
      { runPrompt: fakeRun },
    )
    expect(r.reason).toBe('synthesized')
    expect(r.draft?.content).toContain('Synthesized')
    expect(fakeRun).toHaveBeenCalledOnce()
  })
})
