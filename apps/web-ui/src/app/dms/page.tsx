import { db } from '@/lib/server'
import { dmsRepo, accountsRepo } from '@x-monitor/db'

export const dynamic = 'force-dynamic'

export default function DmsPage() {
  const dms = dmsRepo(db).list(100)
  const accountsById = new Map(accountsRepo(db).list().map(a => [a.id, a]))
  return (
    <main>
      <h1>私信收件（最近 100 条）</h1>
      <p style={{ color: '#666', fontSize: 13 }}>仅采集，不自动回复。带「关联」的为可能由我方某条已发回复触发的。</p>
      {dms.length === 0 ? (
        <p>暂无私信。</p>
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: 16 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #ddd' }}>
              <th align="left">账号</th>
              <th align="left">发件人</th>
              <th align="left">内容</th>
              <th align="left">时间</th>
              <th align="left">关联</th>
            </tr>
          </thead>
          <tbody>
            {dms.map(d => (
              <tr key={d.id} style={{ borderTop: '1px solid #eee', fontSize: 13 }}>
                <td>@{accountsById.get(d.accountId)?.handle ?? '?'}</td>
                <td>@{d.senderHandle}</td>
                <td style={{ maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.text}</td>
                <td>{new Date(d.sentAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</td>
                <td>{d.attributedSentId ? `sent #${d.attributedSentId}` : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}
