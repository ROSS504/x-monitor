import { getDb, migrate } from '@x-monitor/db'

const _db = (() => {
  const d = getDb()
  migrate(d)
  return d
})()

export const db = _db
