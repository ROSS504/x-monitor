import { describe, it, expect, vi } from 'vitest'
import { draftOne } from '../src/draft.js'
import { searchKB } from '@x-monitor/kb-fixture'

describe('draftOne', () => {
  it('returns no_match when KB has no relevant article', async () => {
    const fakeRun = vi.fn()
    const r = await draftOne(
      { text: 'completely unrelated topic about pet food', authorHandle: 'a' },
      { runPrompt: fakeRun, searchKB },
    )
    expect(r.reason).toBe('no_match')
    expect(r.draft).toBeNull()
    expect(fakeRun).not.toHaveBeenCalled()
  })

  it('builds draft from matched KB article', async () => {
    const fakeRun = vi.fn(async () => ({
      text: '{"content":"Great question.","citations":[{"chunkId":"staking-1","quote":"FMV"}]}',
      durationMs: 100,
    }))
    const r = await draftOne(
      { text: 'How are staking rewards taxed?', authorHandle: 'a' },
      { runPrompt: fakeRun, searchKB },
    )
    expect(r.reason).toBe('matched')
    expect(r.articleId).toBe('art-staking')
    expect(r.draft?.content).toContain('Great question')
    expect(r.draft?.citations[0].chunkId).toBe('staking-1')
  })
})
