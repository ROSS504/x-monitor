import { describe, it, expect } from 'vitest'
import { buildAnalyzePostPrompt, parseAnalyzePostResponse } from '../src/analyzePost.js'

describe('buildAnalyzePostPrompt', () => {
  it('includes the post text and asks for JSON output', () => {
    const p = buildAnalyzePostPrompt({ text: 'How are staking rewards taxed?', authorHandle: 'alice' })
    expect(p).toContain('How are staking rewards taxed?')
    expect(p).toContain('@alice')
    expect(p).toMatch(/JSON/)
  })
})

describe('parseAnalyzePostResponse', () => {
  it('extracts JSON from a fenced code block', () => {
    const raw = 'Here you go:\n```json\n{"type":"question","scenario":"1","viewpoint":"asks how staking is taxed"}\n```\nDone.'
    const r = parseAnalyzePostResponse(raw)
    expect(r.type).toBe('question')
    expect(r.scenario).toBe('1')
  })
  it('handles bare JSON', () => {
    const raw = '{"type":"opinion","scenario":"2","viewpoint":"x"}'
    const r = parseAnalyzePostResponse(raw)
    expect(r.type).toBe('opinion')
  })
  it('throws on garbage', () => {
    expect(() => parseAnalyzePostResponse('lol no')).toThrow()
  })
})
