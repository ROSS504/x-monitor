import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { migrate } from '../src/migrate.js'
import { playbooksRepo, scorePlaybook, pickRelevantPlaybooks } from '../src/repos/playbooks.js'

describe('playbooksRepo', () => {
  let db: Database.Database
  beforeEach(() => { db = new Database(':memory:'); migrate(db) })
  afterEach(() => { db.close() })

  it('insert + list round-trip', () => {
    const id = playbooksRepo(db).insert({
      name: 'Tax season urgency',
      keywords: ['tax', 'deadline', 'IRS'],
      strategyText: 'Mention deadline-driven cost of inaction.',
    })
    expect(id).toBeGreaterThan(0)
    const all = playbooksRepo(db).list()
    expect(all).toHaveLength(1)
    expect(all[0].keywords).toEqual(['tax', 'deadline', 'irs'])
    expect(all[0].enabled).toBe(true)
  })

  it('setEnabled toggles inclusion in listEnabled', () => {
    const id = playbooksRepo(db).insert({ name: 'A', keywords: ['x'], strategyText: 'y' })
    expect(playbooksRepo(db).listEnabled()).toHaveLength(1)
    playbooksRepo(db).setEnabled(id, false)
    expect(playbooksRepo(db).listEnabled()).toHaveLength(0)
    expect(playbooksRepo(db).list()).toHaveLength(1)
  })

  it('deleteById removes the row', () => {
    const id = playbooksRepo(db).insert({ name: 'A', keywords: ['x'], strategyText: 'y' })
    playbooksRepo(db).deleteById(id)
    expect(playbooksRepo(db).list()).toHaveLength(0)
  })
})

describe('scorePlaybook', () => {
  it('returns 0 when disabled', () => {
    const p = { id: 1, name: 'x', keywords: ['tax'], strategyText: '', enabled: false, createdAt: 0, updatedAt: 0 }
    expect(scorePlaybook(p, 'tax tax tax')).toBe(0)
  })
  it('counts unique keyword hits case-insensitively', () => {
    const p = { id: 1, name: 'x', keywords: ['tax', 'irs', 'crypto'], strategyText: '', enabled: true, createdAt: 0, updatedAt: 0 }
    expect(scorePlaybook(p, 'Tax season and IRS rules')).toBe(2)
  })
})

describe('pickRelevantPlaybooks', () => {
  it('returns top-N by score, filters out zero matches, respects N', () => {
    const mk = (id: number, keywords: string[]) => ({
      id, name: `pb-${id}`, keywords, strategyText: 's', enabled: true, createdAt: 0, updatedAt: 0,
    })
    const playbooks = [mk(1, ['tax', 'irs']), mk(2, ['unrelated']), mk(3, ['tax']), mk(4, ['crypto', 'tax'])]
    const r = pickRelevantPlaybooks(playbooks, 'tax IRS crypto', 2)
    expect(r.map(p => p.id)).toEqual([1, 4]) // score 2 each, slice 2
  })
})
