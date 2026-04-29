import { describe, it, expect } from 'vitest'
import { classify } from '../src/classify.js'

describe('classify', () => {
  it('all reachable -> HEALTHY', () => {
    expect(classify({ x: true, dify: true, internet: true })).toBe('HEALTHY')
  })
  it('internet ok, x down -> DEGRADED_X', () => {
    expect(classify({ x: false, dify: true, internet: true })).toBe('DEGRADED_X')
  })
  it('all down -> DOWN', () => {
    expect(classify({ x: false, dify: false, internet: false })).toBe('DOWN')
  })
})
