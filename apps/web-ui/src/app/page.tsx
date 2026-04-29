import { db } from '@/lib/server'
import { draftsRepo, sentRepo } from '@x-monitor/db'

export const dynamic = 'force-dynamic'

export default function HomePage() {
  const pendingCount = draftsRepo(db).listByStatus('pending').length
  const sentToday = sentRepo(db).countTodayForAccount(1, Date.now())
  return (
    <main>
      <h1>Overview</h1>
      <div style={{ display: 'flex', gap: 24, marginBottom: 32 }}>
        <Stat label="Pending review" value={pendingCount} />
        <Stat label="Sent today (account 1)" value={sentToday} />
      </div>
      <h2>Inject test post</h2>
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
        placeholder="Paste a tweet text..."
        rows={3}
        style={{ width: '100%', padding: 8 }}
      />
      <input
        name="authorHandle"
        placeholder="author handle"
        style={{ marginTop: 8, padding: 6 }}
      />
      <button type="submit" style={{ marginTop: 8, padding: '8px 16px' }}>
        Inject
      </button>
      <p style={{ color: '#888', fontSize: 12 }}>
        Note: dev tool. Browser cannot POST application/json directly via form. Use:{' '}
        <code>
          curl -XPOST http://localhost:3000/api/test/inject-post -H &apos;content-type:
          application/json&apos; -d &apos;{`{"text":"...","authorHandle":"alice"}`}&apos;
        </code>
      </p>
    </form>
  )
}
