import { describe, it, expect } from 'vitest'
import { KB_MATCH_THRESHOLD, isMatched } from '../src/matchingThreshold.js'

describe('matchingThreshold', () => {
  it('threshold is 0.15', () => {
    expect(KB_MATCH_THRESHOLD).toBe(0.15)
  })
  it('isMatched at boundary', () => {
    expect(isMatched(0.15)).toBe(true)
    expect(isMatched(0.149)).toBe(false)
  })
})
