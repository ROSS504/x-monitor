import type { CheckIssue } from './check.js'

const ALERT_INTERVAL_MS = 30 * 60_000

export interface DedupeStateEntry {
  key: string
  lastSentAt: number
}

export class AlertDedupe {
  private state = new Map<string, number>()

  shouldSend(issue: CheckIssue, now = Date.now()): boolean {
    const key = this.keyOf(issue)
    const last = this.state.get(key)
    if (last === undefined || now - last >= ALERT_INTERVAL_MS) {
      this.state.set(key, now)
      return true
    }
    return false
  }

  /** For tests / introspection */
  snapshot(): DedupeStateEntry[] {
    return [...this.state.entries()].map(([key, lastSentAt]) => ({ key, lastSentAt }))
  }

  private keyOf(issue: CheckIssue): string {
    return `${issue.process}:${issue.kind}`
  }
}

export const ALERT_INTERVAL_MS_VALUE = ALERT_INTERVAL_MS
