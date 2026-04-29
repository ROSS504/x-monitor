import { db } from '@/lib/server'
import { draftsRepo, sentRepo } from '@x-monitor/db'

export const dynamic = 'force-dynamic'

export default function HomePage() {
  const pendingCount = draftsRepo(db).listByStatus('pending').length
  const sentToday = sentRepo(db).countTodayForAccount(1, Date.now())
  return (
    <main>
      <h1>概览</h1>
      <div style={{ display: 'flex', gap: 24, marginBottom: 32 }}>
        <Stat label="待审核草稿" value={pendingCount} />
        <Stat label="今日已发送（账号 1）" value={sentToday} />
      </div>
      <h2>注入测试帖子</h2>
      <InjectForm />
    </main>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        padding: 16,
        border: '1px solid #ddd',
        borderRadius: 4,
        minWidth: 160,
      }}
    >
      <div style={{ fontSize: 12, color: '#666' }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 600 }}>{value}</div>
    </div>
  )
}

function InjectForm() {
  return (
    <form action="/api/test/inject-post" method="post" encType="application/json">
      <textarea
        name="text"
        placeholder="粘贴一条推文文本…"
        rows={3}
        style={{ width: '100%', padding: 8 }}
      />
      <input
        name="authorHandle"
        placeholder="作者用户名"
        style={{ marginTop: 8, padding: 6 }}
      />
      <button type="submit" style={{ marginTop: 8, padding: '8px 16px' }}>
        注入
      </button>
      <p style={{ color: '#888', fontSize: 12 }}>
        说明：开发工具。浏览器无法通过表单直接 POST application/json，请用：{' '}
        <code>
          curl -XPOST http://localhost:3000/api/test/inject-post -H &apos;content-type:
          application/json&apos; -d &apos;{`{"text":"...","authorHandle":"alice"}`}&apos;
        </code>
      </p>
    </form>
  )
}
