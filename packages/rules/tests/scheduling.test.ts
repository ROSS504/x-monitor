import { describe, it, expect } from 'vitest'
import { computeTargetSendAt } from '../src/scheduling.js'

const ACCOUNT_BH = { startHour: 9, endHour: 23, tz: 'Asia/Shanghai' }

describe('computeTargetSendAt', () => {
  it('schedules NOW + min_interval when account idle and within hours', () => {
    const now = new Date('2026-04-28T10:00:00+08:00').getTime()
    const r = computeTargetSendAt({
      now, lastSentAt: null, minIntervalMin: 15, dailyLimit: 30, todayCount: 0,
      businessHours: ACCOUNT_BH,
    })
    expect(r.target - now).toBeCloseTo(15 * 60_000, -2)
  })

  it('respects last_sent_at if more recent than now-interval', () => {
    const now = new Date('2026-04-28T10:00:00+08:00').getTime()
    const lastSent = now - 5 * 60_000
    const r = computeTargetSendAt({
      now, lastSentAt: lastSent, minIntervalMin: 15, dailyLimit: 30, todayCount: 0,
      businessHours: ACCOUNT_BH,
    })
    expect(r.target - now).toBeCloseTo(10 * 60_000, -2)
  })

  it('pushes to next business window when outside hours', () => {
    const now = new Date('2026-04-28T03:00:00+08:00').getTime()
    const r = computeTargetSendAt({
      now, lastSentAt: null, minIntervalMin: 15, dailyLimit: 30, todayCount: 0,
      businessHours: ACCOUNT_BH,
    })
    const targetDate = new Date(r.target)
    expect(targetDate.toISOString()).toMatch(/T01:00:00/)
  })

  it('pushes to tomorrow when daily_limit reached', () => {
    const now = new Date('2026-04-28T10:00:00+08:00').getTime()
    const r = computeTargetSendAt({
      now, lastSentAt: null, minIntervalMin: 15, dailyLimit: 30, todayCount: 30,
      businessHours: ACCOUNT_BH,
    })
    expect(r.target).toBeGreaterThan(new Date('2026-04-29T01:00:00Z').getTime())
  })
})
