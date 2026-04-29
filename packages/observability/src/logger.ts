type LogFn = (msg: string, ctx?: Record<string, unknown>) => void

export interface Logger {
  info: LogFn
  warn: LogFn
  error: LogFn
}

export function createLogger(proc: string, sink: (line: string) => void = console.log): Logger {
  const make = (level: 'info' | 'warn' | 'error'): LogFn =>
    (msg, ctx = {}) => sink(JSON.stringify({ ts: Date.now(), level, process: proc, msg, ...ctx }))
  return { info: make('info'), warn: make('warn'), error: make('error') }
}
