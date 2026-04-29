import { db } from '@/lib/server'
import { auditRepo } from '@x-monitor/db'

export const dynamic = 'force-dynamic'

export default function AuditPage() {
  const rows = auditRepo(db).recent(100)
  return (
    <main>
      <h1>活动日志（最近 100 条）</h1>
      <p style={{ color: '#666', fontSize: 13 }}>系统/操作员对草稿的审批等关键动作记录。</p>
      {rows.length === 0 ? (
        <p>暂无记录。审批 / 驳回 / 手动注入帖子都会写入这里。</p>
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #ddd' }}>
              <th align="left">时间</th>
              <th align="left">操作者</th>
              <th align="left">动作</th>
              <th align="left">对象</th>
              <th align="left">trace</th>
              <th align="left">附加</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} style={{ borderTop: '1px solid #eee', fontSize: 13 }}>
                <td>{new Date(r.at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</td>
                <td>{r.actor}</td>
                <td><strong>{r.action}</strong></td>
                <td>{r.targetType ?? '-'} {r.targetId ?? ''}</td>
                <td style={{ color: '#888', fontSize: 11 }}>{r.traceId ?? '-'}</td>
                <td style={{ color: '#666', fontSize: 11, maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {r.payload ? JSON.stringify(r.payload).slice(0, 80) : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}
