import { connection } from './connection.js'

export type NetStatus = 'HEALTHY' | 'DEGRADED_X' | 'DEGRADED_DIFY' | 'DOWN'

const KEY = 'network-status'
const CHANNEL = 'network-status'

export async function publishNetStatus(s: NetStatus): Promise<void> {
  await connection.set(KEY, s)
  await connection.publish(CHANNEL, s)
}

export async function getNetStatus(): Promise<NetStatus> {
  const s = await connection.get(KEY)
  return (s as NetStatus | null) ?? 'HEALTHY'
}

export function subscribeNetStatus(cb: (s: NetStatus) => void): () => Promise<void> {
  const sub = connection.duplicate()
  sub.subscribe(CHANNEL)
  sub.on('message', (_ch, msg) => cb(msg as NetStatus))
  return async () => { await sub.unsubscribe(CHANNEL); await sub.quit() }
}
