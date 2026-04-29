import { describe, it, expect, vi } from 'vitest'
import { analyzeOne } from '../src/analyze.js'

describe('analyzeOne', () => {
  it('returns parsed analysis from claude response', async () => {
    const fakeRun = vi.fn(async () => ({ text: '{"type":"question","scenario":"1","viewpoint":"asks about staking"}', durationMs: 100 }))
    const r = await analyzeOne(
      { text: 'staking question?', authorHandle: 'a' },
      { runPrompt: fakeRun }
    )
    expect(r.type).toBe('question')
    expect(r.scenario).toBe('1')
    expect(r.promptVersion).toBe('analyze-post@v1')
  })
})
