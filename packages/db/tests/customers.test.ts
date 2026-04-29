import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { migrate } from '../src/migrate.js'
import { customersRepo } from '../src/repos/customers.js'

describe('customersRepo', () => {
  let db: Database.Database
  beforeEach(() => { db = new Database(':memory:'); migrate(db) })
  afterEach(() => { db.close() })

  it('insert + listEnabled + findByHandle round-trip', () => {
    const id = customersRepo(db).insert({ handle: 'alice_corp', displayName: 'Alice Corp' })
    expect(id).toBeGreaterThan(0)
    const found = customersRepo(db).findByHandle('alice_corp')
    expect(found?.handle).toBe('alice_corp')
    expect(found?.displayName).toBe('Alice Corp')
    expect(found?.enabled).toBe(true)
    expect(customersRepo(db).listEnabled()).toHaveLength(1)
  })

  it('insert is idempotent on handle', () => {
    const a = customersRepo(db).insert({ handle: 'bob' })
    const b = customersRepo(db).insert({ handle: 'bob', displayName: 'second time' })
    expect(a).toBe(b)
  })

  it('setEnabled toggles inclusion in listEnabled', () => {
    const id = customersRepo(db).insert({ handle: 'carol' })
    expect(customersRepo(db).listEnabled()).toHaveLength(1)
    customersRepo(db).setEnabled(id, false)
    expect(customersRepo(db).listEnabled()).toHaveLength(0)
    expect(customersRepo(db).list()).toHaveLength(1)
  })

  it('deleteById removes the row', () => {
    const id = customersRepo(db).insert({ handle: 'temp' })
    customersRepo(db).deleteById(id)
    expect(customersRepo(db).list()).toHaveLength(0)
  })
})
