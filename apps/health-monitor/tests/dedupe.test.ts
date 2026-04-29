import { describe, it, expect } from 'vitest'
import { AlertDedupe } from '../src/dedupe.js'
import type { CheckIssue } from '../src/check.js'

const stale: CheckIssue = { kind: 'stale', process: 'p', expectation: { name: 'p', kind: 'live', staleSeconds: 60 }, lastHeartbeat: 0, ageSeconds: 120 }

describe('AlertDedupe', () => {
  it('sends the first time, suppresses duplicates within window', () => {
    const d = new AlertDedupe()
    expect(d.shouldSend(stale, 0)).toBe(true)
    expect(d.shouldSend(stale, 1000)).toBe(false)
    expect(d.shouldSend(stale, 30 * 60_000 - 1)).toBe(false)
  })
  it('resends after the interval elapses', () => {
    const d = new AlertDedupe()
    expect(d.shouldSend(stale, 0)).toBe(true)
    expect(d.shouldSend(stale, 30 * 60_000)).toBe(true)
  })
  it('different kinds for the same process are tracked separately', () => {
    const d = new AlertDedupe()
    const err: CheckIssue = { kind: 'error', process: 'p', lastError: 'boom', lastHeartbeat: 0 }
    expect(d.shouldSend(stale, 0)).toBe(true)
    expect(d.shouldSend(err, 0)).toBe(true)
  })
})
