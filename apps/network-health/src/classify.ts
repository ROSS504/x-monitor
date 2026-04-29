import type { NetStatus } from '@x-monitor/queue'

export interface ProbeResults {
  x: boolean
  dify: boolean
  internet: boolean
}

export function classify(r: ProbeResults): NetStatus {
  if (!r.internet) return 'DOWN'
  if (!r.x) return 'DEGRADED_X'
  if (!r.dify) return 'DEGRADED_DIFY'
  return 'HEALTHY'
}
