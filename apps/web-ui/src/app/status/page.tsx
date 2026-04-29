import { db } from '@/lib/server'
import { healthRepo } from '@x-monitor/db'

export const dynamic = 'force-dynamic'

export default function StatusPage() {
  const procs = healthRepo(db).all()
  const now = Date.now()
  return (
    <main>
      <h1>System status</h1>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th align="left">Process</th>
            <th align="left">Status</th>
            <th align="left">Last heartbeat</th>
            <th align="left">Last error</th>
          </tr>
        </thead>
        <tbody>
          {procs.map((p) => {
            const ageS = Math.round((now - p.lastHeartbeat) / 1000)
            return (
              <tr key={p.processName} style={{ borderTop: '1px solid #eee' }}>
                <td>{p.processName}</td>
                <td>{p.status}</td>
                <td>{ageS}s ago</td>
                <td style={{ color: '#c33', fontSize: 12 }}>{p.lastError ?? ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </main>
  )
}
