import { describe, it, expect } from 'vitest'
import { WatchdogDedupe } from '../src/dedupe.js'

describe('WatchdogDedupe', () => {
  it('never sends for ok verdict', () => {
    const d = new WatchdogDedupe()
    expect(d.shouldSend({ ok: true }, 0)).toBe(false)
  })
  it('sends first time per reason, suppresses within window', () => {
    const d = new WatchdogDedupe()
    expect(d.shouldSend({ ok: false, reason: 'stale', ageSeconds: 400 }, 0)).toBe(true)
    expect(d.shouldSend({ ok: false, reason: 'stale', ageSeconds: 500 }, 1000)).toBe(false)
  })
  it('different reasons tracked separately', () => {
    const d = new WatchdogDedupe()
    expect(d.shouldSend({ ok: false, reason: 'stale', ageSeconds: 400 }, 0)).toBe(true)
    expect(d.shouldSend({ ok: false, reason: 'errored', lastError: 'x' }, 0)).toBe(true)
  })
  it('resends after interval elapses', () => {
    const d = new WatchdogDedupe()
    expect(d.shouldSend({ ok: false, reason: 'stale' }, 0)).toBe(true)
    expect(d.shouldSend({ ok: false, reason: 'stale' }, 30 * 60_000)).toBe(true)
  })
})
