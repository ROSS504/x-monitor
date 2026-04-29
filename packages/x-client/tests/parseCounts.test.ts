import { describe, it, expect } from 'vitest'
import { parseCount } from '../src/parseCounts.js'

describe('parseCount', () => {
  it('parses plain integers', () => {
    expect(parseCount('0')).toBe(0)
    expect(parseCount('12')).toBe(12)
    expect(parseCount('1234')).toBe(1234)
  })
  it('parses K/M/B suffixes case-insensitively', () => {
    expect(parseCount('1.2K')).toBe(1200)
    expect(parseCount('1.2k')).toBe(1200)
    expect(parseCount('3M')).toBe(3_000_000)
    expect(parseCount('2.5b')).toBe(2_500_000_000)
  })
  it('strips commas and whitespace', () => {
    expect(parseCount('1,234')).toBe(1234)
    expect(parseCount(' 12 ')).toBe(12)
  })
  it('returns 0 for empty / dash / unparseable input', () => {
    expect(parseCount(null)).toBe(0)
    expect(parseCount(undefined)).toBe(0)
    expect(parseCount('')).toBe(0)
    expect(parseCount('-')).toBe(0)
    expect(parseCount('—')).toBe(0)
    expect(parseCount('lol')).toBe(0)
  })
})
