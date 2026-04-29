import { describe, it, expect } from 'vitest'
import { withinBusinessHours, addMinutes } from '../src/time.js'

describe('withinBusinessHours', () => {
  it('returns true at 10:00 when business is 9-23', () => {
    const d = new Date('2026-04-28T10:00:00+08:00')
    expect(withinBusinessHours(d, { startHour: 9, endHour: 23, tz: 'Asia/Shanghai' })).toBe(true)
  })
  it('returns false at 03:00', () => {
    const d = new Date('2026-04-28T03:00:00+08:00')
    expect(withinBusinessHours(d, { startHour: 9, endHour: 23, tz: 'Asia/Shanghai' })).toBe(false)
  })
})

describe('addMinutes', () => {
  it('adds minutes correctly', () => {
    const d = new Date('2026-04-28T10:00:00Z')
    expect(addMinutes(d, 30).toISOString()).toBe('2026-04-28T10:30:00.000Z')
  })
})
