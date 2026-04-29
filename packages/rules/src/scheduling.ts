import type { BusinessHours } from '@x-monitor/core'
import { withinBusinessHours } from '@x-monitor/core'

export interface ComputeInput {
  now: number
  lastSentAt: number | null
  minIntervalMin: number
  dailyLimit: number
  todayCount: number
  businessHours: BusinessHours
}
export interface ComputeResult { target: number }

function nextBusinessStart(d: Date, bh: BusinessHours): Date {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: bh.tz, year: 'numeric', month: '2-digit', day: '2-digit' })
  const parts = fmt.formatToParts(d)
  const y = parts.find(p => p.type === 'year')!.value
  const m = parts.find(p => p.type === 'month')!.value
  const day = parts.find(p => p.type === 'day')!.value
  const offsetH = bh.tz === 'Asia/Shanghai' ? 8 : 0
  const sign = offsetH >= 0 ? '+' : '-'
  const off = `${sign}${String(Math.abs(offsetH)).padStart(2, '0')}:00`
  let candidate = new Date(`${y}-${m}-${day}T${String(bh.startHour).padStart(2,'0')}:00:00${off}`)
  if (candidate.getTime() <= d.getTime()) {
    candidate = new Date(candidate.getTime() + 24 * 3600_000)
  }
  return candidate
}

export function computeTargetSendAt(i: ComputeInput): ComputeResult {
  const intervalMs = i.minIntervalMin * 60_000
  const base = i.lastSentAt !== null
    ? Math.max(i.now, i.lastSentAt + intervalMs)
    : i.now + intervalMs
  if (i.todayCount >= i.dailyLimit) {
    return { target: nextBusinessStart(new Date(i.now + 24 * 3600_000), i.businessHours).getTime() }
  }
  const baseDate = new Date(base)
  if (!withinBusinessHours(baseDate, i.businessHours)) {
    return { target: nextBusinessStart(baseDate, i.businessHours).getTime() }
  }
  return { target: base }
}
