import { describe, it, expect } from 'vitest'
import { checkHealth, formatIssue, type ProcessExpectation } from '../src/check.js'

const exps: ProcessExpectation[] = [
  { name: 'live-a', kind: 'live', staleSeconds: 60 },
  { name: 'event-b', kind: 'event-driven', staleSeconds: 3600 },
]

describe('checkHealth', () => {
  it('returns no issues when all fresh and ok', () => {
    const now = 100_000
    const rows = [
      { processName: 'live-a', lastHeartbeat: now - 10_000, status: 'ok' as const, lastError: null },
      { processName: 'event-b', lastHeartbeat: now - 600_000, status: 'ok' as const, lastError: null },
    ]
    expect(checkHealth(now, rows, exps)).toEqual([])
  })

  it('flags stale live process', () => {
    const now = 100_000
    const rows = [
      { processName: 'live-a', lastHeartbeat: now - 200_000, status: 'ok' as const, lastError: null },
    ]
    const issues = checkHealth(now, rows, exps)
    expect(issues).toHaveLength(1)
    expect(issues[0].kind).toBe('stale')
    expect(issues[0].process).toBe('live-a')
  })

  it('flags any error status regardless of freshness', () => {
    const now = 100_000
    const rows = [
      { processName: 'live-a', lastHeartbeat: now - 1000, status: 'error' as const, lastError: 'boom' },
      { processName: 'event-b', lastHeartbeat: now - 1000, status: 'error' as const, lastError: 'oops' },
    ]
    const issues = checkHealth(now, rows, exps)
    expect(issues).toHaveLength(2)
    expect(issues.every(i => i.kind === 'error')).toBe(true)
  })

  it('flags missing live process but ignores missing event-driven', () => {
    const now = 100_000
    const issues = checkHealth(now, [], exps)
    const kinds = issues.map(i => i.kind)
    const procs = issues.map(i => i.process)
    expect(procs).toContain('live-a')
    expect(procs).not.toContain('event-b')
    expect(kinds).toContain('missing')
  })

  it('event-driven within 1h is healthy', () => {
    const now = 100_000
    const rows = [
      { processName: 'event-b', lastHeartbeat: now - 1000_000, status: 'ok' as const, lastError: null },
    ]
    const issues = checkHealth(now, rows, exps).filter(i => i.process === 'event-b')
    expect(issues).toHaveLength(0)
  })
})

describe('formatIssue', () => {
  it('formats stale, error, and missing', () => {
    const exp: ProcessExpectation = { name: 'p', kind: 'live', staleSeconds: 60 }
    expect(formatIssue({ kind: 'stale', process: 'p', expectation: exp, lastHeartbeat: 0, ageSeconds: 120 })).toMatch(/STALE.*p.*120s/)
    expect(formatIssue({ kind: 'error', process: 'p', lastError: 'boom', lastHeartbeat: 0 })).toMatch(/ERROR.*p.*boom/)
    expect(formatIssue({ kind: 'missing', process: 'p', expectation: exp })).toMatch(/MISSING.*p/)
  })
})
