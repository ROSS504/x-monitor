import { db } from '@/lib/server'
import { healthRepo } from '@x-monitor/db'

export const dynamic = 'force-dynamic'

export default function StatusPage() {
  const procs = healthRepo(db).all()
  const now = Date.now()
  return (
    <main>
      <h1>系统状态</h1>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th align="left">进程</th>
            <th align="left">状态</th>
            <th align="left">上次心跳</th>
            <th align="left">最近错误</th>
          </tr>
        </thead>
        <tbody>
          {procs.map((p) => {
            const ageS = Math.round((now - p.lastHeartbeat) / 1000)
            return (
              <tr key={p.processName} style={{ borderTop: '1px solid #eee' }}>
                <td>{p.processName}</td>
                <td>{p.status === 'ok' ? '正常' : '异常'}</td>
                <td>{ageS} 秒前</td>
                <td style={{ color: '#c33', fontSize: 12 }}>{p.lastError ?? ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </main>
  )
}
