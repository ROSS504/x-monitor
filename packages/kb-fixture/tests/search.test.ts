import { describe, it, expect } from 'vitest'
import { searchKB } from '../src/search.js'

describe('searchKB', () => {
  it('returns articles ranked by keyword overlap', () => {
    const results = searchKB('I have a question about staking taxes')
    expect(results[0].article.id).toBe('art-staking')
    expect(results[0].score).toBeGreaterThan(0)
  })
  it('returns empty when nothing matches', () => {
    const results = searchKB('completely unrelated topic about pet food')
    expect(results).toEqual([])
  })
})
