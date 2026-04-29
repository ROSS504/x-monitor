import { describe, it, expect } from 'vitest'
import { checkHealthMonitor, formatVerdict } from '../src/check.js'

describe('checkHealthMonitor', () => {
  const cfg = { maxStaleSeconds: 300 }

  it('missing row → not ok / missing', () => {
    expect(checkHealthMonitor(0, [], cfg).reason).toBe('missing')
  })
  it('errored status → not ok / errored', () => {
    const r = checkHealthMonitor(1000_000, [
      { processName: 'health-monitor', lastHeartbeat: 999_999, status: 'error', lastError: 'boom' },
    ], cfg)
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('errored')
    expect(r.lastError).toBe('boom')
  })
  it('fresh ok heartbeat → ok', () => {
    const now = 1000_000
    const r = checkHealthMonitor(now, [
      { processName: 'health-monitor', lastHeartbeat: now - 30_000, status: 'ok', lastError: null },
    ], cfg)
    expect(r.ok).toBe(true)
    expect(r.ageSeconds).toBe(30)
  })
  it('stale heartbeat → not ok / stale', () => {
    const now = 1000_000
    const r = checkHealthMonitor(now, [
      { processName: 'health-monitor', lastHeartbeat: now - 600_000, status: 'ok', lastError: null },
    ], cfg)
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('stale')
    expect(r.ageSeconds).toBe(600)
  })
  it('default cfg uses 5 minutes', () => {
    const now = 1000_000
    const r = checkHealthMonitor(now, [
      { processName: 'health-monitor', lastHeartbeat: now - 6 * 60_000, status: 'ok', lastError: null },
    ])
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('stale')
  })
  it('formatVerdict produces human strings', () => {
    expect(formatVerdict({ ok: true, ageSeconds: 30 })).toMatch(/OK/)
    expect(formatVerdict({ ok: false, reason: 'missing' })).toMatch(/EMERGENCY/)
    expect(formatVerdict({ ok: false, reason: 'stale', ageSeconds: 400 })).toMatch(/400s/)
    expect(formatVerdict({ ok: false, reason: 'errored', lastError: 'boom' })).toMatch(/boom/)
  })
})
