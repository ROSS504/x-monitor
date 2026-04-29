import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import type Database from 'better-sqlite3'

export function migrate(db: Database.Database): void {
  const here = dirname(fileURLToPath(import.meta.url))
  const sql = readFileSync(resolve(here, '../src/schema.sql'), 'utf8')
  db.exec(sql)
}
