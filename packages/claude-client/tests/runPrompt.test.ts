import { describe, it, expect } from 'vitest'
import { EventEmitter, Readable } from 'node:stream'
import { runPrompt } from '../src/runPrompt.js'

function fakeSpawn(stdout: string, exitCode = 0) {
  return () => {
    const ee: any = new EventEmitter()
    ee.stdout = Readable.from([stdout])
    ee.stderr = Readable.from([''])
    ee.kill = () => {}
    setImmediate(() => ee.emit('exit', exitCode))
    return ee
  }
}

describe('runPrompt', () => {
  it('returns stdout when exit 0', async () => {
    const r = await runPrompt({ prompt: 'hi', spawner: fakeSpawn('hello world') as any })
    expect(r.text).toBe('hello world')
  })
  it('throws on non-zero exit', async () => {
    await expect(runPrompt({ prompt: 'hi', spawner: fakeSpawn('', 1) as any })).rejects.toThrow(/exited 1/)
  })
})
