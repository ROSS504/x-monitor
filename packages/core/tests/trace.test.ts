import { describe, it, expect } from 'vitest'
import { newTraceId } from '../src/trace.js'

describe('newTraceId', () => {
  it('produces unique 26-char ULID-like ids', () => {
    const a = newTraceId()
    const b = newTraceId()
    expect(a).toHaveLength(26)
    expect(b).toHaveLength(26)
    expect(a).not.toBe(b)
  })
  it('is sortable by time', () => {
    const a = newTraceId()
    const b = newTraceId()
    expect(a < b).toBe(true)
  })
})
