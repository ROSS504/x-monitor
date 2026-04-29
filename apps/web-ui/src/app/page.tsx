import { db } from '@/lib/server'
import {
  draftsRepo, sentRepo, accountsRepo, healthRepo,
  customersRepo, playbooksRepo, kbDocsRepo,
} from '@x-monitor/db'

export const dynamic = 'force-dynamic'

interface SentRow {
  id: number
  tweet_id: string
  draft_id: number
  account_id: number
  sent_at: number
}

export default function HomePage() {
  const pendingCount = draftsRepo(db).listByStatus('pending').length
  const officialAccount = accountsRepo(db).findByHandle('FinTax_Official')
  const sentToday = officialAccount ? sentRepo(db).countTodayForAccount(officialAccount.id, Date.now()) : 0
  const totalPosts = (db.prepare(`SELECT COUNT(*) AS c FROM posts`).get() as { c: number }).c
  const totalDrafts = (db.prepare(`SELECT COUNT(*) AS c FROM drafts`).get() as { c: number }).c
  const totalSent  = (db.prepare(`SELECT COUNT(*) AS c FROM sent`).get() as { c: number }).c
  const customerCount = customersRepo(db).list().length
  const playbookCount = playbooksRepo(db).listEnabled().length
  const kbCount = kbDocsRepo(db).count()

  const procs = healthRepo(db).all()
  const okCount = procs.filter(p => p.status === 'ok').length
  const errCount = procs.filter(p => p.status === 'error').length

  const recentSent = db.prepare(`SELECT * FROM sent ORDER BY sent_at DESC LIMIT 5`).all() as SentRow[]
  const accountsById = new Map(accountsRepo(db).list().map(a => [a.id, a]))

  return (
    <main>
      <h1>概览</h1>

      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <Stat label="待审核" value={pendingCount} highlight={pendingCount > 0} />
        <Stat label="今日已发（官方）" value={sentToday} />
        <Stat label="总帖子" value={totalPosts} />
        <Stat label="总草稿" value={totalDrafts} />
        <Stat label="总发送" value={totalSent} />
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 32, flexWrap: 'wrap' }}>
        <Stat label="客户名单" value={customerCount} muted />
        <Stat label="启用策略" value={playbookCount} muted />
        <Stat label="KB 文档" value={kbCount} muted />
        <Stat label="进程健康" value={`${okCount}/${procs.length}`} highlight={errCount > 0} />
      </div>

      <h2>最近 5 次发送</h2>
      {recentSent.length === 0 ? (
        <p>暂无已发送记录。</p>
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: 32 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #ddd' }}>
              <th align="left">推文 ID</th>
              <th align="left">账号</th>
              <th align="left">时间</th>
            </tr>
          </thead>
          <tbody>
            {recentSent.map(s => {
              const acct = accountsById.get(s.account_id)
              return (
                <tr key={s.id} style={{ borderTop: '1px solid #eee', fontSize: 13 }}>
                  <td><code>{s.tweet_id}</code></td>
                  <td>@{acct?.handle ?? '?'}</td>
                  <td>{new Date(s.sent_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      <h2>注入测试帖子</h2>
      <form action="/api/test/inject-post" method="post" encType="application/json">
        <textarea name="text" placeholder="粘贴一条推文文本…" rows={3} style={{ width: '100%', padding: 8, maxWidth: 600 }} />
        <br />
        <input name="authorHandle" placeholder="作者用户名" style={{ marginTop: 8, padding: 6, maxWidth: 600 }} />
        <br />
        <button type="submit" style={{ marginTop: 8, padding: '8px 16px' }}>注入</button>
        <p style={{ color: '#888', fontSize: 12 }}>
          浏览器无法直接通过表单 POST application/json，请用 curl：{' '}
          <code>
            curl -XPOST http://localhost:3000/api/test/inject-post -H &apos;content-type: application/json&apos; -d &apos;{`{"text":"...","authorHandle":"alice"}`}&apos;
          </code>
        </p>
      </form>

      <p style={{ color: '#666', fontSize: 12, marginTop: 24 }}>
        新增客户/策略 → 到对应页面操作。所有修改实时生效。
      </p>
    </main>
  )
}

function Stat({ label, value, highlight, muted }: { label: string; value: number | string; highlight?: boolean; muted?: boolean }) {
  return (
    <div
      style={{
        padding: 12,
        border: highlight ? '2px solid #c33' : '1px solid #ddd',
        borderRadius: 4,
        minWidth: 120,
        background: muted ? '#fafafa' : 'white',
      }}
    >
      <div style={{ fontSize: 11, color: '#666' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 600, color: highlight ? '#c33' : '#222' }}>{value}</div>
    </div>
  )
}
