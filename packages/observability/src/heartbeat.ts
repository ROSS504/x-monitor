import type Database from 'better-sqlite3'
import { healthRepo } from '@x-monitor/db'

export function heartbeat(db: Database.Database, processName: string, status: 'ok' | 'error', lastError?: string): void {
  healthRepo(db).heartbeat(processName, status, lastError ?? null)
}
