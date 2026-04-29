import { describe, it, expect, vi } from 'vitest'
import { synthesizeOne } from '../src/synthesize.js'
import { searchKB } from '@x-monitor/kb-fixture'

describe('synthesizeOne', () => {
  it('returns no_kb_match when nothing matches', async () => {
    const fakeRun = vi.fn()
    const r = await synthesizeOne(
      { text: 'random pet food topic', authorHandle: 'a', viewpoint: 'pets' },
      { runPrompt: fakeRun, searchKB },
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
      { runPrompt: fakeRun, searchKB },
    )
    expect(r.reason).toBe('synthesized')
    expect(r.draft?.content).toContain('Synthesized')
    expect(fakeRun).toHaveBeenCalledOnce()
  })

  it('passes playbook hints into the prompt when provided', async () => {
    let capturedPrompt = ''
    const fakeRun = vi.fn(async ({ prompt }: { prompt: string }) => {
      capturedPrompt = prompt
      return {
        text: '{"content":"x","citations":[{"chunkId":"staking-1","quote":"FMV"}]}',
        durationMs: 50,
      }
    })
    await synthesizeOne(
      { text: 'How are crypto staking rewards taxed?', authorHandle: 'a', viewpoint: 'asks about staking' },
      {
        runPrompt: fakeRun,
        searchKB,
        playbooks: [{ name: 'Tax-season urgency', strategyText: 'Lean into deadline pressure.' }],
      },
    )
    expect(capturedPrompt).toContain('Tax-season urgency')
    expect(capturedPrompt).toContain('deadline pressure')
  })
})
