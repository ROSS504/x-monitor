export async function probeOne(url: string, timeoutMs = 5000): Promise<boolean> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const r = await fetch(url, { method: 'HEAD', signal: ctrl.signal })
    return r.status < 500
  } catch {
    return false
  } finally {
    clearTimeout(t)
  }
}

export async function probeAll(): Promise<{ x: boolean; dify: boolean; internet: boolean }> {
  const [x, dify, internet] = await Promise.all([
    probeOne('https://x.com/'),
    probeOne('https://api.dify.ai/'),
    probeOne('https://1.1.1.1/'),
  ])
  return { x, dify, internet }
}
