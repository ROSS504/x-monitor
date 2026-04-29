import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

let db: Database.Database | null = null

export function getDb(path: string = process.env.SQLITE_PATH ?? './data/x-monitor.db'): Database.Database {
  if (db) return db
  mkdirSync(dirname(path), { recursive: true })
  db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  return db
}

export function closeDb(): void {
  if (db) { db.close(); db = null }
}
