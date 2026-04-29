import { describe, it, expect } from 'vitest'
import { createLogger } from '../src/logger.js'

describe('createLogger', () => {
  it('emits JSON lines with process and trace_id', () => {
    const out: string[] = []
    const log = createLogger('test-proc', (line) => out.push(line))
    log.info('hello', { traceId: 'abc' })
    const parsed = JSON.parse(out[0])
    expect(parsed.process).toBe('test-proc')
    expect(parsed.level).toBe('info')
    expect(parsed.msg).toBe('hello')
    expect(parsed.traceId).toBe('abc')
    expect(typeof parsed.ts).toBe('number')
  })
})
