import type { WatchdogVerdict } from './check.js'

const ALERT_INTERVAL_MS = 30 * 60_000

export class WatchdogDedupe {
  private state = new Map<string, number>()

  shouldSend(v: WatchdogVerdict, now = Date.now()): boolean {
    if (v.ok) return false
    const key = v.reason ?? 'unknown'
    const last = this.state.get(key)
    if (last === undefined || now - last >= ALERT_INTERVAL_MS) {
      this.state.set(key, now)
      return true
    }
    return false
  }
}
