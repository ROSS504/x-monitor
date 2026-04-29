import type { HealthRow } from '@x-monitor/db'

export interface WatchdogVerdict {
  ok: boolean
  reason?: 'missing' | 'stale' | 'errored'
  ageSeconds?: number
  lastError?: string | null
}

export interface WatchdogConfig {
  maxStaleSeconds: number
}

const DEFAULT: WatchdogConfig = { maxStaleSeconds: 5 * 60 }

export function checkHealthMonitor(now: number, rows: HealthRow[], cfg: WatchdogConfig = DEFAULT): WatchdogVerdict {
  const r = rows.find(x => x.processName === 'health-monitor')
  if (!r) return { ok: false, reason: 'missing' }
  if (r.status === 'error') return { ok: false, reason: 'errored', lastError: r.lastError }
  const ageSeconds = Math.round((now - r.lastHeartbeat) / 1000)
  if (ageSeconds > cfg.maxStaleSeconds) return { ok: false, reason: 'stale', ageSeconds }
  return { ok: true, ageSeconds }
}

export function formatVerdict(v: WatchdogVerdict): string {
  if (v.ok) return `health-monitor OK (last heartbeat ${v.ageSeconds}s ago)`
  if (v.reason === 'missing')  return 'EMERGENCY: health-monitor has never reported a heartbeat'
  if (v.reason === 'stale')    return `EMERGENCY: health-monitor stale, last heartbeat ${v.ageSeconds}s ago`
  if (v.reason === 'errored')  return `EMERGENCY: health-monitor reported error: ${v.lastError ?? '(none)'}`
  return 'EMERGENCY: health-monitor failure (unknown reason)'
}
