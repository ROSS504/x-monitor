import { db } from '@/lib/server'
import { analyticsRepo, accountsRepo, type AnalyticsBucket } from '@x-monitor/db'

export const dynamic = 'force-dynamic'

interface SentRow {
  id: number
  tweet_id: string
  draft_id: number
  account_id: number
  sent_at: number
}

export default function SentPage() {
  const sent = db.prepare(`SELECT * FROM sent ORDER BY sent_at DESC LIMIT 50`).all() as SentRow[]
  const accountsById = new Map(accountsRepo(db).list().map(a => [a.id, a]))
  return (
    <main>
      <h1>已发送（最近 50 条）</h1>
      <p style={{ fontSize: 12, color: '#666' }}>每格：点赞/转发/回复</p>
      {sent.length === 0 ? (
        <p>暂无已发送记录。</p>
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #ddd' }}>
              <th align="left">推文 ID</th>
              <th align="left">账号</th>
              <th align="left">发送时间</th>
              <th align="left">1h</th>
              <th align="left">6h</th>
              <th align="left">24h</th>
              <th align="left">72h</th>
              <th align="left">7d</th>
            </tr>
          </thead>
          <tbody>
            {sent.map(s => {
              const rows = analyticsRepo(db).listForSent(s.id)
              const byBucket = new Map(rows.map(r => [r.bucket, r]))
              const fmt = (b: AnalyticsBucket) => {
                const r = byBucket.get(b)
                if (!r) return '-'
                return `${r.likes}/${r.retweets}/${r.replies}`
              }
              const acct = accountsById.get(s.account_id)
              return (
                <tr key={s.id} style={{ borderTop: '1px solid #eee', fontSize: 13 }}>
                  <td><code>{s.tweet_id}</code></td>
                  <td>@{acct?.handle ?? '?'}</td>
                  <td>{new Date(s.sent_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</td>
                  <td>{fmt('1h')}</td>
                  <td>{fmt('6h')}</td>
                  <td>{fmt('24h')}</td>
                  <td>{fmt('72h')}</td>
                  <td>{fmt('7d')}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </main>
  )
}
