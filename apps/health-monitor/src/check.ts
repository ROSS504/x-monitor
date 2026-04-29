import type { HealthStatus } from '@x-monitor/db'

export type ProcessKind = 'live' | 'event-driven'

export interface ProcessExpectation {
  name: string
  kind: ProcessKind
  /** Max acceptable seconds since last heartbeat. */
  staleSeconds: number
}

export const PROCESS_EXPECTATIONS: ProcessExpectation[] = [
  // live processes — heartbeat in their main loop
  { name: 'network-health',   kind: 'live',         staleSeconds: 15 * 60 },
  { name: 'scanner-browser',  kind: 'live',         staleSeconds: 10 * 60 },
  { name: 'scanner-customer', kind: 'live',         staleSeconds: 30 * 60 },
  { name: 'ai-worker',        kind: 'live',         staleSeconds: 10 * 60 },
  { name: 'scheduler',        kind: 'live',         staleSeconds: 5  * 60 },
  { name: 'dm-collector',     kind: 'live',         staleSeconds: 30 * 60 },
  { name: 'watchdog',         kind: 'live',         staleSeconds: 10 * 60 },
  // event-driven — only heartbeat when work arrives; silence is acceptable up to 24h
  { name: 'poster',           kind: 'event-driven', staleSeconds: 24 * 3600 },
  { name: 'analytics-worker', kind: 'event-driven', staleSeconds: 24 * 3600 },
  // ai-routine fires from Claude /schedule (5-10 min)
  { name: 'ai-routine',       kind: 'event-driven', staleSeconds: 60 * 60 },
]

export interface HealthRow {
  processName: string
  lastHeartbeat: number
  status: HealthStatus
  lastError: string | null
}

export type CheckIssue =
  | { kind: 'stale'; process: string; expectation: ProcessExpectation; lastHeartbeat: number; ageSeconds: number }
  | { kind: 'error'; process: string; lastError: string | null; lastHeartbeat: number }
  | { kind: 'missing'; process: string; expectation: ProcessExpectation }

export function checkHealth(now: number, rows: HealthRow[], expectations: ProcessExpectation[] = PROCESS_EXPECTATIONS): CheckIssue[] {
  const byName = new Map(rows.map(r => [r.processName, r]))
  const issues: CheckIssue[] = []
  for (const exp of expectations) {
    const r = byName.get(exp.name)
    if (!r) {
      // Missing rows are tolerated for event-driven (never ran yet) but not for live processes once seen
      if (exp.kind === 'live') {
        issues.push({ kind: 'missing', process: exp.name, expectation: exp })
      }
      continue
    }
    if (r.status === 'error') {
      issues.push({ kind: 'error', process: exp.name, lastError: r.lastError ?? null, lastHeartbeat: r.lastHeartbeat })
      continue
    }
    const ageSeconds = Math.round((now - r.lastHeartbeat) / 1000)
    if (ageSeconds > exp.staleSeconds) {
      issues.push({ kind: 'stale', process: exp.name, expectation: exp, lastHeartbeat: r.lastHeartbeat, ageSeconds })
    }
  }
  return issues
}

export function formatIssue(issue: CheckIssue): string {
  if (issue.kind === 'error') {
    return `[ERROR] ${issue.process}: status=error, lastError=${issue.lastError ?? '(none)'}`
  }
  if (issue.kind === 'stale') {
    return `[STALE] ${issue.process}: last heartbeat ${issue.ageSeconds}s ago (threshold ${issue.expectation.staleSeconds}s)`
  }
  return `[MISSING] ${issue.process}: never reported a heartbeat`
}
