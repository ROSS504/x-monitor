import { spawn } from 'node:child_process'

export interface RunPromptOptions {
  prompt: string
  timeoutMs?: number
  spawner?: typeof spawn
}

export interface RunPromptResult {
  text: string
  durationMs: number
}

export async function runPrompt(opts: RunPromptOptions): Promise<RunPromptResult> {
  const bin = process.env.CLAUDE_BIN ?? 'claude'
  const start = Date.now()
  const child = (opts.spawner ?? spawn)(bin, ['-p', opts.prompt], { stdio: ['ignore', 'pipe', 'pipe'] })
  let out = ''
  let err = ''
  child.stdout!.on('data', (d) => { out += d.toString() })
  child.stderr!.on('data', (d) => { err += d.toString() })
  const timeout = opts.timeoutMs ?? 120_000
  const exit = await Promise.race([
    new Promise<number>((resolve) => child.on('exit', (c) => resolve(c ?? 0))),
    new Promise<number>((_, reject) => setTimeout(() => { child.kill('SIGKILL'); reject(new Error('claude timeout')) }, timeout)),
  ])
  if (exit !== 0) throw new Error(`claude exited ${exit}: ${err}`)
  return { text: out.trim(), durationMs: Date.now() - start }
}
