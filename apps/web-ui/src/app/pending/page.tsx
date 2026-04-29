import { db } from '@/lib/server'
import { draftsRepo, postsRepo } from '@x-monitor/db'

export const dynamic = 'force-dynamic'

export default function PendingListPage() {
  const drafts = draftsRepo(db).listByStatus('pending')
  return (
    <main>
      <h1>Pending review ({drafts.length})</h1>
      {drafts.length === 0 ? (
        <p>No drafts pending review.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {drafts.map((d) => {
            const post = postsRepo(db).findById(d.postId)
            return (
              <li
                key={d.id}
                style={{
                  border: '1px solid #ddd',
                  padding: 12,
                  marginBottom: 12,
                  borderRadius: 4,
                }}
              >
                <a href={`/pending/${d.id}`} style={{ fontWeight: 600 }}>
                  Draft #{d.id}
                </a>
                <div style={{ color: '#666', fontSize: 13, marginTop: 4 }}>
                  Original by @{post?.authorHandle}: {post?.text?.slice(0, 120)}
                </div>
                <div style={{ marginTop: 8 }}>{d.content}</div>
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
